# Repository Guidelines

## Project Structure & Module Organization
This repository is an npm workspace monorepo.

- `packages/web`: Vue 3 + Vite + Tailwind v4 frontend (`src/` for app code, `dist/` build output).
- `packages/api`: Cloudflare Worker API in TypeScript (`src/index.ts`, `wrangler.toml` for env/bindings).
- `docs/plan`: implementation plans by phase.
- `docs/progress.md`: current delivery status.
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

## Security & Configuration Tips
- Never commit `.env`, `.dev.vars`, or secrets.
- Manage Worker secrets via Wrangler/GitHub Secrets, not source control.
- Confirm D1 bindings and environment targets in `packages/api/wrangler.toml` before deploy.

## Documentation discipline
- Update this @project-guidelines.md file as the project evolves.
- Update @docs/progress.md as the project evolves.
- Update @docs/plan/<phase>.md files as the project evolves.
