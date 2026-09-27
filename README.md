# Political Poster Generator

A web platform for local political workers, committee members, and publicity agents to
generate ready-to-print political posters. Users supply the text (headline, name,
designation, party) and a photo; the system composes a layout and exports a
print-resolution image with correct Bangla typography.

The repo is two independent packages with no root `package.json` and no npm
workspaces. Install, run, and deploy each one separately.

```
poster-generator-backend/    Express + TypeScript API, MongoDB, Puppeteer renderer
poster-generator-frontend/   Next.js 16 (App Router) + Tailwind CSS 4 + React 19
```

---

## Table of contents

- [How poster generation works](#how-poster-generation-works)
- [Prerequisites](#prerequisites)
- [Local setup](#local-setup)
- [Environment variables](#environment-variables)
- [Running the app](#running-the-app)
- [Tests and verification](#tests-and-verification)
- [Deployment](#deployment)
- [Configuration pitfalls](#configuration-pitfalls)
- [Troubleshooting](#troubleshooting)
- [API reference](#api-reference)
- [Project layout](#project-layout)

---

## How poster generation works

Templates are **data, not code**. The three built-in templates are rasterised SVG
generated at seed time and stored as documents in MongoDB. This is the single most
important thing to understand when deploying: a fresh database has zero templates and
the picker will be empty until you run the seed.

The pipeline is deliberately hybrid — AI plans the layout, deterministic code draws it.
This avoids the two failure modes of letting a model render text directly: hallucinated
spelling and broken Bangla shaping.

1. **User request** — copy, template slug, and uploaded photo IDs.
2. **Layout planning** — Gemini returns a validated JSON layout (palette, photo
   placement, headline style, decorations). Every field is checked against a Zod
   schema *and* re-checked against the template's own allowed list, so a bad model
   reply degrades to a deterministic fallback instead of producing a broken poster.
3. **HTML build** — the backend renders an HTML document containing the user's exact
   text, CSS layout, and the inlined photos.
4. **Puppeteer export** — headless Chromium screenshots the document at the template's
   canvas size (e.g. 1800×2400). Because Chromium does the text layout, Bangla
   conjuncts shape correctly and the spelling is guaranteed to match the input.

Generation is asynchronous. `POST /api/posters` returns `status: "processing"` and the
client polls `GET /api/posters/:id` until it reaches `completed` or `failed`.

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | **>= 20** | `package.json` declares `engines.node >= 20` |
| npm | 10+ | ships with Node 20/22 |
| MongoDB | 6+ | local install, Docker, or MongoDB Atlas |
| Chrome/Chromium | any recent | only needed for Puppeteer; downloaded automatically by `npm install` |

Puppeteer downloads its own Chromium on install (~150 MB), so no separate browser
install is needed for local development.

---

## Local setup

### 1. Install dependencies

Run in **both** directories — there is no root install:

```bash
cd poster-generator-backend  && npm install
cd poster-generator-frontend && npm install
```

### 2. Start MongoDB

Any MongoDB works. The simplest option that needs no install is the `mongod` binary
that `mongodb-memory-server` already downloaded into the backend's cache during the
first `npm install` or `npm test`:

```bash
# macOS / Linux
./poster-generator-backend/node_modules/.cache/mongodb-memory-server/mongod-*-linux-*/mongod \
  --dbpath "$PWD/.mongo-data" --bind_ip 127.0.0.1 --port 27017
```

```powershell
# Windows PowerShell
$exe = "F:\AI-Political-Poster-Maker\poster-generator-backend\node_modules\.cache\mongodb-memory-server\mongod-x64-win32-*.exe"
Start-Process $exe -ArgumentList "--dbpath","$env:TEMP\mongo-data","--bind_ip","127.0.0.1","--port","27017" -WindowStyle Hidden
```

Alternatively use a normal MongoDB install, `docker run -p 27017:27017 mongo:7`, or a
free [MongoDB Atlas](https://www.mongodb.com/atlas/register) cluster.

### 3. Configure environment files

```bash
cd poster-generator-backend
cp .env.example .env          # Windows: copy .env.example .env
```

Generate a JWT secret — it must be **at least 32 characters** or the backend refuses
to boot:

```bash
openssl rand -hex 32
```

```bash
cd poster-generator-frontend
cp .env.example .env.local    # Windows: copy .env.example .env.local
```

See [Environment variables](#environment-variables) for every setting.

### 4. Seed the templates

**Required.** Without this the template picker is empty and poster creation returns 404.

```bash
cd poster-generator-backend
npm run seed
```

Expected output ends with `"Seed complete","templatesInDatabase":3`. The seed is
idempotent — templates are upserted by slug, so re-running never duplicates them.

### 5. Run both servers

Two terminals:

```bash
# terminal 1
cd poster-generator-backend
npm run dev          # http://localhost:5000
```

```bash
# terminal 2
cd poster-generator-frontend
npm run dev          # http://localhost:3000
```

Open <http://localhost:3000>, register an account, and generate a poster. Uploaded
photos must be **at least 200×200 pixels**; anything smaller is rejected with 422.

---

## Environment variables

### Backend — `poster-generator-backend/.env`

Validated at boot by a Zod schema (`src/config/env.ts`). An invalid value throws with a
list of problems rather than failing later at the first request.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `MONGODB_URI` | **yes** | — | Connection string. **Must include a database name.** |
| `JWT_SECRET` | **yes** | — | Signing key, minimum 32 characters. |
| `PORT` | no | `5000` | Listen port. Render sets `10000` automatically. |
| `NODE_ENV` | no | `production` | `development` also returns stack traces to clients. |
| `JWT_EXPIRES_IN` | no | `7d` | Token lifetime. |
| `GEMINI_API_KEY` | no | — | Enables AI layouts. Blank or unset → deterministic fallback. |
| `GEMINI_MODEL` | no | `gemini-2.5-flash` | Must be a real model ID. |
| `FRONTEND_URL` | no | `http://localhost:3000` | Comma-separated CORS allowlist of bare origins. |
| `STORAGE_DRIVER` | no | `local` | `local`, `cloudinary`, or `datauri` — see below. |
| `CLOUDINARY_*` | conditional | — | Required when `STORAGE_DRIVER=cloudinary`. |
| `LOCAL_STORAGE_DIR` | no | `uploads` | Where the `local` driver writes. |
| `PUBLIC_BASE_URL` | no | `http://localhost:5000` | Absolute origin Chromium uses to fetch assets. |

#### Storage drivers

| Driver | Behaviour | Use when |
|---|---|---|
| `local` | Writes to `./uploads`, served by `express.static` | Local development only |
| `cloudinary` | Uploads to Cloudinary | Production with real user uploads |
| `datauri` | Inlines each asset into the referencing document as a `data:` URI | Seeded template artwork on hosts that wipe the filesystem |

> **`local` is unsafe on Render, Railway, and Fly.** Those platforms discard the
> container filesystem on every deploy, so uploaded photos and generated posters 404
> afterwards. Use `cloudinary`, attach a persistent disk, or use `datauri` for template
> artwork.

> **`datauri` stores the bytes in MongoDB.** Ideal for the small, fixed set of seeded
> template images; not a good fit for unbounded user uploads.

#### `MONGODB_URI` must name a database

```bash
# correct — database named, so data lands in the app's own database
mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/poster_generator?retryWrites=true&w=majority

# wrong — no database name, so Mongoose silently falls back to a database called "test"
mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/?appName=Cluster0
```

The second form connects successfully, so it fails quietly. Confirm the target with
`GET /health`, which reports the environment, or inspect the cluster directly.

### Frontend — `poster-generator-frontend/.env.local`

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | production | `http://localhost:5000` | API origin. **Must NOT end in `/api`.** |

`NEXT_PUBLIC_*` values are inlined into the browser bundle **at build time**, so
changing one requires a rebuild/redeploy, not just a restart.

---

## Running the app

| Command | Directory | Description |
|---|---|---|
| `npm run dev` | backend | Watch-mode API on `PORT` |
| `npm run build` | backend | Compile TypeScript to `dist/` |
| `npm start` | backend | Run the compiled server |
| `npm run seed` | backend | Upsert template documents |
| `npm test` | backend | Jest suite (needs MongoDB running) |
| `npm run render:sample` | backend | Render one poster to `render-samples/` |
| `npm run render:verify` | backend | 12 assertions about real rendered output |
| `npm run verify` | backend | typecheck + test + render:verify |
| `npm run dev` | frontend | Next.js dev server on 3000 |
| `npm run build` | frontend | Production build |
| `npm run start` | frontend | Serve the production build |
| `npm run lint` | frontend | ESLint |

---

## Tests and verification

```bash
cd poster-generator-backend
npm test                # 55 tests across 3 suites
npm run render:verify   # 12 checks on real Puppeteer output
```

Three suites:

- `html.builder.test.ts` — escaping, slot rendering, colour resolution
- `gemini.service.test.ts` — schema validation, retry, fallback, decoration filtering
- `poster.service.integration.test.ts` — the real pipeline against a real MongoDB,
  including ownership checks and a live Puppeteer render

`render:verify` is the interesting one. It renders actual posters and asserts on the
pixels: correct canvas size, glyph ink present in the headline band, Bangla genuinely
shaped rather than falling back to tofu, photos composited into slots, different
layouts producing visibly different output, and byte-identical output for identical
input.

### Two environment quirks that make tests fail

**1. `GEMINI_API_KEY` must be non-empty in `.env`.** `tests/setupEnv.ts` deletes the
variable, but `src/config/env.ts` loads `.env` afterwards and dotenv repopulates it.
A blank value therefore leaves `isGeminiConfigured` false, and
`gemini.service.ts` returns a fallback layout before ever reaching the stubbed model
call — the 8 Gemini tests then fail with `expected "gemini", received "fallback"`. Put
a placeholder in `.env`; the tests stub the network call. To genuinely disable AI,
comment the line out instead of blanking it.

**2. The integration suite needs a real MongoDB.** It does not use
`mongodb-memory-server`; it connects to `MONGODB_URI` and runs `deleteMany` cleanup
against it. Without MongoDB running you get
`MongooseServerSelectionError: connect ECONNREFUSED 127.0.0.1:27017`.

### One render check is platform-dependent

`headline ink coverage differs between the Bangla and Latin fonts` compares the real
font against a `'DejaVu Sans'` control. On Windows, DejaVu has no Bengali glyphs, so
Chromium falls back to an installed Bangla font and both render identically — the check
cannot pass. Installing DejaVu helps but does not fix it. The meaningful assertion is
the adjacent one, `Bangla font genuinely shapes the headline`, which passes. Expect
11/12 on Windows and 12/12 in the Linux container.

---

## Deployment

Frontend to **Vercel**, backend to **Render** (or any Docker host).

### 1. Database

Create a free [MongoDB Atlas](https://www.mongodb.com/atlas/register) cluster, add a
database user, and under **Network Access** allow `0.0.0.0/0` so Render can reach it.
Copy the **SRV** connection string, insert the database name, and URL-encode the
password if it contains special characters.

### 2. Backend on Render

Create a **Web Service** pointed at a Docker deploy:

| Setting | Value |
|---|---|
| Root directory | `poster-generator-backend` |
| Runtime / deploy | Docker |
| Health check path | `/health` |

Environment variables:

| Variable | Value |
|---|---|
| `MONGODB_URI` | `mongodb+srv://…/poster_generator?retryWrites=true&w=majority` |
| `JWT_SECRET` | 32+ random characters |
| `NODE_ENV` | `production` |
| `GEMINI_API_KEY` | your key, or omit to use fallback layouts |
| `GEMINI_MODEL` | `gemini-2.5-flash` |
| `FRONTEND_URL` | `https://<your-app>.vercel.app` |
| `PUBLIC_BASE_URL` | `https://<your-service>.onrender.com` |
| `STORAGE_DRIVER` | `cloudinary` in production |

Then seed the production database. Easiest is a one-off: temporarily set the start
command to `npm run seed && npm start`, deploy, confirm
`GET /api/templates` returns 3, then revert to `npm start`. Alternatively run the seed
from your machine against the same URI.

The bundled `Dockerfile` installs Chrome and the font packages needed for Bangla
rendering, sets `PUPPETEER_EXECUTABLE_PATH`, and builds TypeScript.

### 3. Frontend on Vercel

| Setting | Value |
|---|---|
| Root directory | `poster-generator-frontend` |
| Framework preset | Next.js |
| Build command | `npm run build` |
| Output directory | `.next` |

Environment variable:

```
NEXT_PUBLIC_API_URL=https://<your-service>.onrender.com
```

Do **not** append `/api`. Every request path in `src/lib/api.ts` already starts with
`/api`, so including it produces doubled paths like `/api/api/auth/register` and every
request 404s at the Express router.

### 4. Verify

```bash
curl https://<your-service>.onrender.com/health          # {"status":"ok"}
curl https://<your-service>.onrender.com/api/templates  # must list 3
```

A successful `register`/`login` does **not** prove the database is reachable for
templates — they live in separate documents. Check `/api/templates` explicitly.

---

## Configuration pitfalls

These all produce confusing symptoms, so they are worth checking first.

| Symptom | Cause | Fix |
|---|---|---|
| `Route not found: POST /api/api/auth/register` | `NEXT_PUBLIC_API_URL` ends in `/api` | Remove the `/api` suffix, then rebuild |
| Template picker empty, poster creation 404s | Seed never ran against that database | `npm run seed` |
| Templates visible but images broken | `local` driver; disk wiped on redeploy | Switch to `cloudinary` or `datauri` |
| Data appears in a database named `test` | `MONGODB_URI` has no database name | Add `/poster_generator` |
| AI layouts never used, everything looks generic | `GEMINI_MODEL` is not a real model ID | Use `gemini-2.5-flash` |
| Renders fail to load uploaded photos | `PUBLIC_BASE_URL` unset, so it points at `localhost` | Set it to the public origin |
| 8 Gemini tests fail with `"fallback"` | `GEMINI_API_KEY` blank in `.env` | Use a non-empty placeholder |
| Stack traces returned to clients | `NODE_ENV=development` in production | Set `production` |
| `EADDRINUSE :::5000` | A previous dev server is still running | Kill the process on the port |

---

## Troubleshooting

**`MongooseServerSelectionError: connect ECONNREFUSED`**
MongoDB is not running. Start it, or check that `MONGODB_URI` is correct and that
Atlas Network Access permits Render's IPs.

**`EADDRINUSE :::5000`**
```powershell
Get-NetTCPConnection -LocalPort 5000 -State Listen |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { Stop-Process -Id $_ -Force }
```

**Poster stuck on `processing`**
Renders happen in-process. A crashed or restarted worker leaves posters in
`processing`; a failed render records a reason in the poster's `errorMessage` field,
which is `select: false` and must be queried explicitly.

**`Route not found: GET /` in the Render logs**
Expected. The service exposes `/health`, not `/`. Set Render's health check path to
`/health` to silence it.

**Bangla renders as empty boxes**
The container is missing the fonts. The bundled `Dockerfile` installs the required
packages; a custom image needs equivalent Bengali font coverage.

---

## API reference

All responses are `{ success, data }` on success and `{ success: false, message, requestId }`
on failure. Authenticated routes take `Authorization: Bearer <token>`.

| Method | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | no | Liveness, uptime, environment |
| `POST` | `/api/auth/register` | no | Create an account, returns a JWT |
| `POST` | `/api/auth/login` | no | Exchange credentials for a JWT |
| `GET` | `/api/auth/me` | yes | Current identity |
| `GET` | `/api/templates` | no | List templates, optional `?occasion=` |
| `GET` | `/api/templates/:id` | no | One template |
| `POST` | `/api/upload` | yes | Multipart photos, field `photos`, min 200×200 |
| `POST` | `/api/posters` | yes | Queue a poster; returns `processing` |
| `GET` | `/api/posters` | yes | Paginated list, caller's posters only |
| `GET` | `/api/posters/:id` | yes | Poll status and fetch `outputUrl` |
| `POST` | `/api/posters/:id/regenerate` | yes | Re-render, bumps `version` |
| `DELETE` | `/api/posters/:id` | yes | Delete the poster and its output |

---

## Project layout

```
poster-generator-backend/
  src/
    config/       env validation (Zod) and Mongo connection
    controllers/  thin HTTP handlers
    middleware/   auth, CORS-friendly errors, rate limits, uploads, validation
    models/       Mongoose schemas: User, Template, Poster, UploadedPhoto
    renderers/    HTML builder, theme resolution, decorations
    routes/       Express routers
    schemas/      request and Gemini response validation
    services/     business logic: auth, poster, gemini, renderer, storage drivers
    templates/    seeded template definitions, artwork generation
  tests/          Jest suites plus render sample/verification scripts
  Dockerfile      Chrome + fonts + TypeScript build, for Render/Railway

poster-generator-frontend/
  src/
    app/          App Router pages: /, /login, /register, /dashboard, /posters/*
    components/   auth form, photo uploader, header, auth guard
    lib/          API client, auth context, hooks, shared types
```

---

## License

MIT
