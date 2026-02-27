# cnx-athletx

A full-stack monorepo featuring a Vue frontend and logic-driven API.

## Project Structure

- `packages/web`: Vue 3 + Vite + Tailwind v4 (Frontend)
- `packages/api`: Cloudflare Worker (API)
- `docs/`: Project documentation and guidelines

## Quick Start

```bash
# Install dependencies
npm ci

# Run development servers
npm run dev:web   # Frontend at 0.0.0.0:5171
npm run dev:api   # API at port 8787
```

## Guidelines

See [docs/project-guidelines.md](file:///Users/jdelaire/Projects/cnx-athletx/docs/project-guidelines.md) for detailed coding standards, build commands, and workflow instructions.
