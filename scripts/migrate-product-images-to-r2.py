#!/usr/bin/env python3
"""
One-off migration: move data-URL product images from D1 into R2.

Reads every products.image_url and product_images.url whose value is a
base64 data URL, writes the bytes into R2 under products/<ulid>.<ext>,
then updates the D1 row to reference the new URL served from
PUBLIC_IMAGES_BASE_URL.

Run:
  python3 scripts/migrate-product-images-to-r2.py --db cnx-athletx-prod --bucket cnx-product-images-prod --base https://images.cnxnature.com

Idempotent: rows already pointing at an http(s) URL are skipped.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from secrets import token_bytes
from typing import Any

DATA_URL_RE = re.compile(
    r"^data:image/(?P<mime>png|jpe?g|webp|gif);base64,(?P<data>[A-Za-z0-9+/=]+)$",
    re.IGNORECASE,
)

MIME_TO_EXT: dict[str, str] = {
    "png": "png",
    "jpg": "jpg",
    "jpeg": "jpg",
    "webp": "webp",
    "gif": "gif",
}

CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


def generate_ulid() -> str:
    # 48-bit timestamp + 80-bit random, Crockford base32 → 26 chars
    now_ms = int(time.time() * 1000)
    ts_bits = f"{now_ms:048b}"
    rand_bits = "".join(f"{b:08b}" for b in token_bytes(10))
    total = ts_bits + rand_bits  # 48 + 80 = 128, 26*5 = 130 → pad MSB with 00
    total = "00" + total
    out = []
    for i in range(0, 130, 5):
        chunk = int(total[i : i + 5], 2)
        out.append(CROCKFORD[chunk])
    return "".join(out)


def run(cmd: list[str], capture: bool = True, cwd: str | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, check=True, text=True, capture_output=capture, cwd=cwd)


def parse_wrangler_json(stdout: str) -> Any:
    """wrangler d1 execute --json prints a big structure; pull the first JSON array."""
    m = re.search(r"\[[\s\S]*\]", stdout)
    if not m:
        raise ValueError("No JSON array in wrangler output")
    return json.loads(m.group(0))


def d1_query(db: str, sql: str, api_dir: str, remote: bool) -> list[dict[str, Any]]:
    flag = "--remote" if remote else "--local"
    proc = run(
        ["npx", "wrangler", "d1", "execute", db, flag, "--json", "--command", sql],
        cwd=api_dir,
    )
    payload = parse_wrangler_json(proc.stdout)
    return payload[0]["results"]


def d1_exec(db: str, sql: str, api_dir: str, remote: bool) -> None:
    flag = "--remote" if remote else "--local"
    run(
        ["npx", "wrangler", "d1", "execute", db, flag, "--command", sql],
        cwd=api_dir,
    )


def r2_put(bucket: str, key: str, path: str, content_type: str, api_dir: str, remote: bool) -> None:
    flag = "--remote" if remote else "--local"
    run(
        [
            "npx",
            "wrangler",
            "r2",
            "object",
            "put",
            f"{bucket}/{key}",
            "--file",
            path,
            "--content-type",
            content_type,
            flag,
        ],
        cwd=api_dir,
    )


def migrate_row(
    *,
    table: str,
    pk_col: str,
    url_col: str,
    row: dict[str, Any],
    bucket: str,
    db: str,
    base_url: str,
    api_dir: str,
    remote: bool,
) -> str | None:
    raw = row[url_col]
    if not isinstance(raw, str) or not raw.startswith("data:"):
        return None

    m = DATA_URL_RE.match(raw)
    if not m:
        print(f"    skip {table}#{row[pk_col]}: not a recognized data URL")
        return None

    mime = m.group("mime").lower()
    ext = MIME_TO_EXT[mime]
    content_type = f"image/{'jpeg' if ext == 'jpg' else ext}"
    data = base64.b64decode(m.group("data"), validate=False)

    key = f"products/{generate_ulid().lower()}.{ext}"

    with tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False) as tmp:
        tmp.write(data)
        tmp_path = tmp.name

    try:
        r2_put(bucket, key, tmp_path, content_type, api_dir, remote)
    finally:
        os.unlink(tmp_path)

    new_url = f"{base_url.rstrip('/')}/{key}"
    escaped = new_url.replace("'", "''")
    sql = f"UPDATE {table} SET {url_col} = '{escaped}' WHERE {pk_col} = {int(row[pk_col])};"
    d1_exec(db, sql, api_dir, remote)

    size_kb = len(data) // 1024
    print(f"    ok  {table}#{row[pk_col]}  →  {new_url}  ({size_kb} KB)")
    return new_url


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--db", required=True, help="D1 database name (e.g. cnx-athletx-prod)")
    p.add_argument("--bucket", required=True, help="R2 bucket name")
    p.add_argument("--base", required=True, help="Public images base URL (e.g. https://images.cnxnature.com)")
    p.add_argument("--api-dir", default=os.path.join(os.path.dirname(__file__), "..", "packages", "api"))
    p.add_argument("--local", action="store_true", help="Use local D1 + local R2 (default: --remote)")
    args = p.parse_args()

    api_dir = os.path.abspath(args.api_dir)
    remote = not args.local

    print(f"DB:     {args.db}  ({'remote' if remote else 'local'})")
    print(f"Bucket: {args.bucket}")
    print(f"Base:   {args.base}")
    print()

    print("[1/2] Migrating products.image_url …")
    rows = d1_query(
        args.db,
        "SELECT id, image_url FROM products WHERE image_url LIKE 'data:%'",
        api_dir,
        remote,
    )
    for row in rows:
        migrate_row(
            table="products",
            pk_col="id",
            url_col="image_url",
            row=row,
            bucket=args.bucket,
            db=args.db,
            base_url=args.base,
            api_dir=api_dir,
            remote=remote,
        )

    print()
    print("[2/2] Migrating product_images.url …")
    rows = d1_query(
        args.db,
        "SELECT id, url FROM product_images WHERE url LIKE 'data:%'",
        api_dir,
        remote,
    )
    for row in rows:
        migrate_row(
            table="product_images",
            pk_col="id",
            url_col="url",
            row=row,
            bucket=args.bucket,
            db=args.db,
            base_url=args.base,
            api_dir=api_dir,
            remote=remote,
        )

    print()
    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
