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
- `npm run dev:web`: run Vite dev server on `0.0.0.0:5173`.
- `npm run dev:api`: run Worker locally with Wrangler on port `8787`.
- `npm run typecheck`: run strict TypeScript checks across workspaces.
- `npm run build`: build validation for both web and api packages.
- `npm run lint`: runs workspace lint scripts if present.
- `npm run deploy:web` / `npm run deploy:api`: deploy to Cloudflare Pages/Workers.
- you have access to wrangler cli locally.
- you have access to gh command for github.

## Coding Style & Naming Conventions
- Language: TypeScript (strict mode enabled in both packages).
- Formatting style in current code: 2-space indentation, semicolons, single quotes, trailing commas where valid.
- Vue components: use PascalCase filenames (for example `ProductCard.vue`).
- Keep API routes explicit and path-based (for example `/api/health/db`).
- Prefer small, composable modules under each package’s `src/`.

## Testing Guidelines
There is currently no dedicated unit/integration test framework configured. CI quality gates are:

- `npm run lint`
- `npm run typecheck`
- `npm run build`

For behavior changes, include reproducible manual verification steps in the PR (commands + expected result). If you add automated tests, colocate them with source using `*.test.ts` naming and add workspace scripts.

## Security & Configuration Tips
- Never commit `.env`, `.dev.vars`, or secrets.
- Manage Worker secrets via Wrangler/GitHub Secrets, not source control.
- Confirm D1 bindings and environment targets in `packages/api/wrangler.toml` before deploy.

## Documentation discipline
- Update this @project-guidelines.md file as the project evolves.
- Update @docs/progress.md as the project evolves.
- Update @docs/plan/<phase>.md files as the project evolves.