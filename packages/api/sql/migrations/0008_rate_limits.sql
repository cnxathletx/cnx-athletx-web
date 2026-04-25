-- 0008_rate_limits.sql
-- Fixed-window rate-limit counters keyed by (scope, key, window_start).
-- Used to enforce per-IP and global quotas on public write endpoints
-- (magic-link request, chat conversation create, checkout).

CREATE TABLE IF NOT EXISTS rate_limits (
    scope TEXT NOT NULL,
    key TEXT NOT NULL,
    window_start TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (scope, key, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start ON rate_limits(window_start);
