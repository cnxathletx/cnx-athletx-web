# Repository Guidelines

## Structure
- npm workspace monorepo.
- `packages/web`: Vue 3, Vite, Tailwind v4 frontend.
- `packages/api`: Cloudflare Worker API in TypeScript.
- `docs/plan`: current product, architecture, and frontend notes.
- `assets`: reference product/design assets.
- Generated: `packages/web/dist`, `.wrangler`. Do not edit generated output.

## Commands
Run from repo root unless a workspace flag is shown.

- Install: `npm ci`
- Web dev: `npm run dev:web` (Vite on `0.0.0.0:5171`)
- API dev: `npm run dev:api` (Wrangler on `8787`)
- Unit tests: `npm test`
- API integration tests: `npm run test:integration -w @cnx-athletx/api`
- E2E tests: `npm run test:e2e` (Playwright starts API and web servers)
- Typecheck: `npm run typecheck`
- Build: `npm run build`
- Deploy: `npm run deploy:web`, `npm run deploy:api`, or `npm run deploy`

Note: root `npm run lint` is currently a no-op unless workspace lint scripts are added.

## Tests
- Add or update focused tests for feature work and bug fixes.
- API unit tests live beside source as `packages/api/src/**/*.test.ts`.
- API integration tests live as `packages/api/src/**/*.integration.test.ts` and use `packages/api/src/test/helpers.ts`.
- Web component/unit tests live as `packages/web/src/**/*.test.ts` and run with Vitest + happy-dom.
- E2E tests live in `e2e/*.spec.ts`; Playwright runs Chromium with one worker.
- For happy-dom tests that touch browser storage, stub `localStorage`.

## Code Style
- TypeScript strict mode; 2-space indentation, semicolons, single quotes, trailing commas where valid.
- Vue component filenames use PascalCase.
- Keep modules small and package-local unless shared use is real.

## i18n
- Customer-facing Vue text uses `vue-i18n`; do not hardcode visible customer copy.
- Add new customer copy to both `packages/web/src/i18n/en.json` and `packages/web/src/i18n/th.json`.
- Use `computed()` for translation-dependent arrays.
- Admin UI is English-only.

## Secrets and Deploy
- Never commit `.env`, `.dev.vars`, tokens, or credentials.
- Manage Worker secrets through Wrangler or GitHub Secrets.
- Check `packages/api/wrangler.toml` bindings and target environment before deploy.

## Docs
- Update `docs/changelog.md` under `[Unreleased]` for user-visible or operational changes.
- Skip changelog entries for doc-only edits, formatting, pure refactors, and internal test-only changes.
- Update `docs/plan/*` only when product, backend architecture, or frontend design changes.
