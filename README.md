# SpecForge

Upload a technical document describing a process flow; SpecForge generates a structured Product Requirements Document (PRD) from it using an LLM.

## Running the whole stack (Docker Compose)

This runs everything — the app, the background worker, Postgres, Redis, and MinIO — with one command. No local Node install or `.env` file required.

By default PRD generation uses a **fake LLM provider** (canned output, no API calls or key needed) — good enough to try out the upload → process → PRD flow. To use the real Anthropic model, export `LLM_PROVIDER=anthropic` and `ANTHROPIC_API_KEY=<your key>` in your shell before `docker compose up` (they override the compose file's defaults).

```sh
docker compose up
```

Then open http://localhost:3000.

- Postgres: `localhost:5432` (user/password/db: `specforge`)
- Redis: `localhost:6379`
- MinIO API: `localhost:9000`, console: `localhost:9001` (user/password: `minioadmin`)

The `web` service runs `prisma generate` then `next dev` on start, so schema changes are picked up automatically on the next container restart.

`node_modules` is kept in a separate named volume (not the bind mount) so native dependencies match the container's Linux/musl environment instead of your host's. That volume is only populated from the image the first time it's created, so **after changing `package.json`**, rebuild it explicitly:

```sh
docker compose down
docker volume rm functionalspec_web_node_modules
docker compose up --build
```

(A stale volume shows up as a `Module not found` error for a package you just added.)

## Running the app on the host, with dependencies in Docker

Useful for faster iteration than rebuilding the `web` image on every change.

1. Start only the backing services:

   ```sh
   docker compose up -d postgres redis minio
   ```

2. Copy the env file, generate an auth secret, and install dependencies:

   ```sh
   cp .env.example .env
   # fill in AUTH_SECRET in .env:
   openssl rand -base64 32
   npm install
   ```

   `.env` defaults `LLM_PROVIDER` to `fake` (no key needed). To use the real Anthropic model instead, set `LLM_PROVIDER=anthropic` and `ANTHROPIC_API_KEY` in `.env`.

3. Run migrations, then start the dev server **and** the worker (in separate terminals — the worker is what actually parses documents and calls the LLM; without it, uploads stay stuck at "Parsing document…"):

   ```sh
   npm run prisma:migrate
   npm run dev          # terminal 1
   npm run worker:dev   # terminal 2
   ```

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Next.js dev server |
| `npm run worker` / `npm run worker:dev` | Run the background worker once / with auto-restart on change |
| `npm run build` / `npm run start` | Production build / start |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Run the test suite (Vitest) — requires `docker compose up -d postgres` (the worker's job-handler integration test runs against a real database) |
| `npm run prisma:generate` | Regenerate the Prisma client |
| `npm run prisma:migrate` | Create/apply a dev migration |
