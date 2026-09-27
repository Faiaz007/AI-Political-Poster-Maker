# Poster Generator — Frontend

Next.js 16 (App Router) + React 19 + Tailwind CSS 4. Talks to the Express API in
`../poster-generator-backend`.

**Full setup, environment variables, and deployment instructions are in the
[root README](../README.md).** This file is a short reference only.

## Quick start

```bash
npm install
cp .env.example .env.local     # Windows: copy .env.example .env.local
npm run dev                    # http://localhost:3000
```

The backend must be running on `http://localhost:5000`, with MongoDB up and the
templates seeded, or the template picker will be empty.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |

## Environment

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_API_URL` | API origin. **No trailing `/api`** — see `.env.example`. |

Inlined into the browser bundle at build time, so a change needs a rebuild.

## Deploying to Vercel

Set the root directory to `poster-generator-frontend` and define
`NEXT_PUBLIC_API_URL` as the bare API origin. No other configuration is needed;
`next.config.ts` is intentionally empty.
