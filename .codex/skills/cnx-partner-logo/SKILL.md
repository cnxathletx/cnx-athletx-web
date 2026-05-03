---
name: cnx-partner-logo
description: Use when adding a partner, sponsor, collaborator, logo, brand mark, or partner visual to the CNX AthletX website partner section, especially when source artwork must be adapted to the existing 3:2 partner tile format.
---

# CNX Partner Logo

## Overview

Use this skill to turn a supplied partner logo or visual into a website-ready linked partner tile and wire it into the CNX AthletX storefront. The site currently renders partner tiles in `packages/web/src/components/layout/PartnersSection.vue` with a 3:2 visual slot (`aspect-[3/2]`).

## Inputs

Require a partner name, partner URL, and source visual before generating. If any are missing, ask for them.

- Partner name: exact display/alt text.
- Partner URL: canonical external URL for the partner tile link.
- Source visual: local path, attached image, or URL to the partner logo/brand image.
- Optional constraints: background preference, exact brand colors, whether to preserve a transparent background.

Do not invent or redraw a partner logo from memory. Use the supplied source as the identity reference.

## Workflow

1. Re-read `docs/project-guidelines.md` and `packages/web/src/components/layout/PartnersSection.vue`; the component or ratio may have changed.
2. Create the asset folder if needed: `packages/web/public/images/partners/`.
3. Use `$imagegen` from `/Users/jdelaire/.codex/skills/imagegen/SKILL.md` for the logo adaptation. Prefer an edit from the supplied visual, not a fresh generation.
4. Save the final web asset as `packages/web/public/images/partners/<partner-slug>.png` unless there is a strong reason to use `.webp`.
5. Inspect the generated image before editing the component. Reject outputs that distort the logo, misspell text, crop the mark, add watermarks, or introduce unrelated brand elements.
6. Update `PartnersSection.vue` to render the new image as an external link while preserving the `aspect-[3/2]` tile geometry, responsive grid, existing placeholder behavior for empty slots, and randomized tile display order.
7. Update `docs/changelog.md` under `[Unreleased]` for the partner logo addition.
8. Verify with `npm run typecheck` and `npm run build:web`. For visual confidence, run `npm run dev:web` and inspect the partner section in a browser.

## Imagegen Prompt

Use `edit` with `--input-fidelity high` and a 3:2 output size. Keep the prompt short and invariant-heavy:

```text
Use case: logo-brand
Asset type: CNX AthletX partner section logo tile
Primary request: adapt the supplied partner logo/visual into a clean 3:2 website partner tile.
Composition/framing: centered logo, fully visible, balanced padding, fits within a 1536x1024 canvas.
Style/medium: clean brand asset for an ecommerce storefront, crisp edges, no mockup scene.
Color palette: preserve the source brand colors; use a transparent or very subtle neutral background only if needed for legibility.
Quality: high
Input fidelity (edits): high
Constraints: preserve the exact logo text, symbol, proportions, and brand identity; no cropping; no stretching; no invented text; no watermark.
Avoid: shadows, bevels, 3D effects, stock-photo backgrounds, extra badges, extra typography, unrelated icons.
```

Command template:

```bash
export CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
export IMAGE_GEN="$CODEX_HOME/skills/imagegen/scripts/image_gen.py"
mkdir -p packages/web/public/images/partners tmp/imagegen

uv run --with openai --with pillow python "$IMAGE_GEN" edit \
  --image "<source-logo-path>" \
  --prompt-file tmp/imagegen/<partner-slug>-prompt.txt \
  --size 1536x1024 \
  --quality high \
  --input-fidelity high \
  --output-format png \
  --out packages/web/public/images/partners/<partner-slug>.png \
  --force
```

Delete temporary prompt files after the generation run. If `OPENAI_API_KEY` is missing, follow the `$imagegen` skill's environment instructions instead of attempting a live call.

## Component Pattern

Keep the tile shape and use semantic image alt text. If the component still contains numeric placeholders, convert only as much as needed:

```vue
<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n({ useScope: 'global' })

const partners = [
  {
    name: 'Partner Name',
    image: '/images/partners/partner-name.png',
    href: 'https://partner.example',
  },
  { placeholderIndex: 2 },
  { placeholderIndex: 3 },
  { placeholderIndex: 4 },
  { placeholderIndex: 5 },
  { placeholderIndex: 6 },
]

const displayedPartners = [...partners]

for (let i = displayedPartners.length - 1; i > 0; i -= 1) {
  const j = Math.floor(Math.random() * (i + 1))
  const partner = displayedPartners[i]
  displayedPartners[i] = displayedPartners[j]
  displayedPartners[j] = partner
}
</script>
```

In the tile, render a linked `img` when `image` exists and fallback localized placeholder text otherwise. Partner links must use `target="_blank"` and `rel="noopener noreferrer"`:

```vue
<a
  v-if="'image' in partner"
  :href="partner.href"
  target="_blank"
  rel="noopener noreferrer"
  class="block h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
>
  <img
    :src="partner.image"
    :alt="partner.name"
    class="h-full w-full object-cover"
  >
</a>
```

Keep customer-facing text localized. Partner names in `alt` text may remain literal brand names.

## Quality Bar

- The final asset is exactly 3:2 or visually safe inside a 3:2 tile.
- The mark is legible at mobile tile sizes.
- The logo identity is preserved; generation did not create a lookalike.
- Each real partner tile has a valid external link.
- Partner tile order is randomized at render time.
- The component still works when fewer than six real partners exist.
- No unrelated app copy, layout, theme, or generated `dist` files are changed.
