# Repository Guidelines

## Project Structure & Module Organization
This repository is an npm workspace monorepo.

- `packages/web`: Vue 3 + Vite + Tailwind v4 frontend (`src/` for app code, `dist/` build output).
- `packages/api`: Cloudflare Worker API in TypeScript (`src/index.ts`, `wrangler.toml` for env/bindings).
- `docs/plan`: implementation plans by phase.
- `assets/`: reference design/product assets.

Treat `packages/web/dist` and `.wrangler/` as generated artifacts; do not edit them directly.

## Build, Test, and Development Commands
Run from repo root unless noted.

- `npm ci`: install workspace dependencies cleanly.
- `npm run dev:web`: run Vite dev server on `0.0.0.0:5171`.
- `npm run dev:api`: run Worker locally with Wrangler on port `8787`.
- `npm run typecheck`: run strict TypeScript checks across workspaces.
- `npm run build`: build validation for both web and api packages.
- `npm run lint`: runs workspace lint scripts if present.
- `npm run deploy:web` / `npm run deploy:api`: deploy to Cloudflare Pages/Workers.
- you have access to wrangler cli locally.
- you have access to gh command for github.

## Testing Guidelines
This project follows **TDD (Test-Driven Development)**. Every feature and bug fix must have an associated test — write the test first, see it fail, then implement the code to make it pass. Do not consider work complete until tests cover the change.

### Running tests
- `npm test`: run unit tests across all workspaces.
- `npm run test:integration -w @cnx-athletx/api`: run API integration tests (uses `wrangler unstable_dev` to spin up a local Worker).
- `npm run test:all -w @cnx-athletx/api`: run API unit + integration tests together.
- `npm run test:e2e`: run Playwright E2E browser tests (auto-starts dev servers).
- Single file: `cd packages/api && npx vitest run src/routes/checkout.integration.test.ts`
- Watch mode: `npm run test:watch -w @cnx-athletx/api` or `-w @cnx-athletx/web`.

### Test organization
- **API unit tests** (`packages/api/src/**/*.test.ts`): colocated with source, run with default vitest config.
- **API integration tests** (`packages/api/src/**/*.integration.test.ts`): use `vitest.integration.config.ts`, spin up a real Worker via `unstable_dev`, and share helpers from `src/test/helpers.ts`.
- **Vue component tests** (`packages/web/src/**/*.test.ts`): use `@vue/test-utils` + `happy-dom`. Require `vi.stubGlobal('localStorage', ...)` since happy-dom's localStorage is limited.
- **E2E tests** (`e2e/*.spec.ts`): Playwright with Chromium, single worker (tests share DB state). Config auto-starts both API (port 8787) and web (port 5171) dev servers.

### CI quality gates
- `npm run lint`
- `npm run typecheck`
- `npm run build`

## Coding Principles
- **DRY (Don't Repeat Yourself)**: extract shared logic into reusable helpers, composables, or services. If the same data structure is built in multiple places, build it once and pass it around. If the same pattern appears three or more times, refactor it into a shared function.
- Language: TypeScript (strict mode enabled in both packages).
- 2-space indentation, semicolons, single quotes, trailing commas where valid.
- Vue components: PascalCase filenames (e.g. `ProductCard.vue`).
- Prefer small, composable modules under each package's `src/`.

## Internationalization (i18n)
- **All customer-facing text must be localized.** Never hardcode user-visible strings in Vue templates — always use `t()` from vue-i18n.
- Setup: `const { t } = useI18n({ useScope: 'global' })` in each component's `<script setup>`.
- Translation files: `packages/web/src/i18n/en.json` (English) and `packages/web/src/i18n/th.json` (Thai).
- When adding new text, add keys to **both** locale files in the same commit.
- Use parameterized messages for dynamic values: `t('key', { count: 5 })`.
- For translation-dependent arrays (e.g. tab labels, step lists), use `computed()` so they stay reactive to locale changes.
- Locale is persisted in `localStorage` under the `cnx-locale` key.
- Admin pages are **not** localized (English only).

## Security & Configuration Tips
- Never commit `.env`, `.dev.vars`, or secrets.
- Manage Worker secrets via Wrangler/GitHub Secrets, not source control.
- Confirm D1 bindings and environment targets in `packages/api/wrangler.toml` before deploy.

## Documentation discipline
- Update this @project-guidelines.md file as the project evolves.
- Update @docs/plan/02-backend-architecture.md when change are made to backend architecture.
- Update @docs/plan/03-frontend-design.md when change are made to frontend design.
- Make sure to keep @docs/plan/01-executive-summary.md up to date with the current state of the project.
- **Changelog discipline**: every user-visible or operationally-relevant change must add an entry to @docs/changelog.md under the `[Unreleased]` section in the same commit as the change. Use [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) categories: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`. One bullet per change, reference the commit hash. On release, rename `[Unreleased]` to the new semver version with the release date and start a fresh `[Unreleased]` section. Skip entries only for pure refactors, internal test changes, doc-only edits, or formatting.