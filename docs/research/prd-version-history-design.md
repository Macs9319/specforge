# PRD Version History — Design Research

Research note, not a diff to apply. All claims are cited to `file:line` or a doc URL. The "Proposed design" and "Recommendation" sections are judgment, kept separate from sourced findings. Follow-up to the P1 item in [`docs/research/v2-feature-proposal.md`](./v2-feature-proposal.md).

## Current state (ground truth)

- **Schema**: `Prd.documentId String @unique` (`prisma/schema.prisma:58`) enforces a hard 1:1 between `Document` and `Prd` at the database level. `Prd` holds exactly one `content String? @db.Text` field (`prisma/schema.prisma:63`) plus `modelId`/`inputTokens`/`outputTokens`/`generatedAt`/`editedAt` (`prisma/schema.prisma:64-69`) — one slot, no history.
- **Regeneration overwrite**: `lib/worker/process-document-job.ts:83-97` runs a single `prisma.prd.update` on success that overwrites `content`, `modelId`, token counts, `generatedAt`, and resets `editedAt: null` — the previous content is gone the instant this commits, with no read of the old value first.
- **Regenerate route**: `app/api/documents/[id]/regenerate/route.ts:59-63` does `prisma.prd.upsert({ where: { documentId: id }, ... update: { status: "PENDING", errorMessage: null } })` before enqueueing — this doesn't touch `content` itself, but it's the point where "a new attempt that will destroy the current content" is committed to.
- **Manual edit**: `app/api/prds/[id]/route.ts:56-59` — `prisma.prd.updateMany({ where: { id, status: { notIn: ["PENDING", "PROCESSING"] } }, data: { content, editedAt: new Date() } })`. Also a direct in-place overwrite, guarded only against racing a concurrent regenerate (not against losing the pre-edit content).
- **Export**: `app/api/prds/[id]/export/route.ts:17-31` fetches one `Prd` by `id` via `findOwnedPrdWithDocument` and streams `prd.content` — no version concept, nothing to change structurally for a single "current version" export.
- **Read path that assumes singularity**:
  - `lib/documents/queries.ts:35-50` (`findOwnedDocumentWithPrd`) does `prisma.document.findUnique({ include: { prd: true } })`. Because `Prd.documentId` is `@unique`, Prisma resolves `document.prd` as a single object, not an array.
  - `app/(app)/documents/[id]/page.tsx:39-47` consumes that as `document.prd.id / .status / .errorMessage / .content / .editedAt` directly — a plain object access, confirming the singular assumption is baked into the page, not just the schema.
  - `lib/prds/queries.ts:8-37` (`findOwnedPrd`, `findOwnedPrdWithDocument`) both `findUnique({ where: { id: prdId } })` by the `Prd`'s own primary key — this part is already version-agnostic in shape (a `findUnique` by PK works the same whether or not other historical rows exist elsewhere), it's the *data* on that row that's the single current snapshot.
- **Real data at risk**: the dev database (exercised via live testing earlier in this session) already has multiple `COMPLETE` `Prd` rows with real `content` from real OpenAI calls. Any migration must not orphan or drop this data.

## Prisma migration pattern (primary source)

- Installed version: `prisma@^7.10.0`, `@prisma/client@^7.10.0`, `@prisma/adapter-pg@^7.10.0` (`package.json:36-37,67`), config via `prisma.config.ts` (driver-adapter style, not a `datasource url` in the schema file).
- Prisma's documented workflow for a migration that needs both a schema change and a hand-written data move: **`prisma migrate dev --create-only`** creates the migration SQL file without applying it, so it can be edited before running `prisma migrate dev` to apply it. Documented explicitly for the closest analogous case to this one — *"to change the direction of a 1-1 relation... without data loss, you need to move data as part of the migration - this SQL is not part of the default migration and must be written by hand"* — [Customizing migrations](https://www.prisma.io/docs/orm/prisma-migrate/workflows/customizing-migrations), confirmed live via search (the doc site's default rendering surfaces newer Prisma 8 TypeScript-migration content when fetched directly, which does **not** apply to this project's pinned `7.10.0` — the `--create-only` SQL-file workflow is the one that matches the installed version).
- Prisma's [expand-and-contract data-migration guide](https://www.prisma.io/docs/guides/data-migration) documents the same three-stage shape already used elsewhere in this repo's own process (see `to-tickets` skill's "wide refactor" handling): **expand** (add the new structure alongside the old), **migrate** (a transaction-wrapped script moving data from old shape to new), **contract** (drop the old structure once verified) — "it's crucial to ensure data consistency and avoid downtime" by keeping both forms operational during the transition.
- Net: this is exactly the documented case Prisma calls out by name (1:1 → richer relation, existing data must move), and the tool for it (`--create-only` + hand-edited SQL) is real product surface, not folklore.

## Proposed design

*(Proposal — not a diff to apply.)*

**Add a new `PrdVersion` child table; keep `Prd` as the per-document "current generation state" container, pointing at its active version.**

```prisma
model Prd {
  id           String           @id @default(cuid())
  documentId   String           @unique
  document     Document         @relation(fields: [documentId], references: [id], onDelete: Cascade)
  userId       String
  user         User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  status       ProcessingStatus @default(PENDING)
  errorMessage String?
  createdAt    DateTime         @default(now())
  updatedAt    DateTime         @updatedAt

  versions          PrdVersion[]      @relation("PrdVersions")
  currentVersionId  String?           @unique
  currentVersion    PrdVersion?       @relation("CurrentVersion", fields: [currentVersionId], references: [id])

  @@index([userId])
}

model PrdVersion {
  id            String    @id @default(cuid())
  prdId         String
  prd           Prd       @relation("PrdVersions", fields: [prdId], references: [id], onDelete: Cascade)
  versionNumber Int
  content       String    @db.Text
  modelId       String?
  inputTokens   Int?
  outputTokens  Int?
  generatedAt   DateTime?
  editedAt      DateTime?
  createdAt     DateTime  @default(now())

  currentFor    Prd?      @relation("CurrentVersion")

  @@unique([prdId, versionNumber])
  @@index([prdId])
}
```

Why this shape over the alternative (adding `version`/`isActive` columns directly on `Prd` and dropping the `documentId` unique constraint to allow multiple rows per document):

- The `Document.prd` relation (`Prd?`, singular) stays completely unchanged — `Document` still has exactly one `Prd` "container" per the existing `documentId @unique` constraint. Only `Prd`'s own internal shape gains a version list, so the blast radius on `Document`-level queries (`lib/documents/queries.ts`) is smaller.
- An `isActive`/"current" flag approach needs either a partial unique index (`CREATE UNIQUE INDEX ... WHERE "isActive"`) — not expressible in Prisma's schema DSL and would itself need hand-written migration SQL — or an unenforced convention prone to bugs (two rows both marked active). An explicit `currentVersionId` FK pointer on `Prd` is enforced by the database (`@unique` on the FK column) and is unambiguous by construction.
- `status`/`errorMessage` (the in-flight generation state machine: PENDING/PROCESSING/COMPLETE/FAILED) stays on `Prd`, not per-version — a `FAILED` attempt produces no content and shouldn't need a version row at all. Only successful generations (and edits to the current version) touch `PrdVersion`.

**Migration (expand → migrate → contract), sketched, not to apply as-is:**

```sql
-- Expand: prisma migrate dev --create-only adds the PrdVersion table
-- and the nullable Prd.currentVersionId column automatically from the
-- schema diff. Then hand-edit that generated file to append:

INSERT INTO "PrdVersion" (id, "prdId", "versionNumber", content, "modelId", "inputTokens", "outputTokens", "generatedAt", "editedAt", "createdAt")
SELECT
  -- id generation strategy is an open question, see below
  encode(gen_random_bytes(12), 'hex'),
  id, 1, content, "modelId", "inputTokens", "outputTokens", "generatedAt", "editedAt", "createdAt"
FROM "Prd"
WHERE content IS NOT NULL;

UPDATE "Prd" p
SET "currentVersionId" = pv.id
FROM "PrdVersion" pv
WHERE pv."prdId" = p.id;

-- Contract (a LATER migration, after the above is verified in prod):
-- ALTER TABLE "Prd" DROP COLUMN content, DROP COLUMN "modelId",
--   DROP COLUMN "inputTokens", DROP COLUMN "outputTokens",
--   DROP COLUMN "generatedAt", DROP COLUMN "editedAt";
```

## Call sites that would need to change

- `lib/worker/process-document-job.ts:83-97` — replace the single `prd.update` with a transaction (`prisma.$transaction`) that creates a new `PrdVersion` (next `versionNumber` = current max + 1) and updates `Prd.currentVersionId` to point at it, rather than overwriting fields on `Prd` directly.
- `app/api/prds/[id]/route.ts:56-59` (manual edit PATCH) — needs to decide (see Open questions) whether an edit mutates the current version's `content` in place, or itself creates a new version.
- `lib/documents/queries.ts:35-50` (`findOwnedDocumentWithPrd`) — `include: { prd: true }` becomes `include: { prd: { include: { currentVersion: true } } }` (or a dedicated selection) to surface content/status through the same call.
- `lib/prds/queries.ts:8-37` — `findOwnedPrd`/`findOwnedPrdWithDocument` return shape changes from "the row with the content" to "the container row" — content moves to `.currentVersion.content`; a new query (e.g. `listPrdVersions`) would be needed to power any "view history" UI.
- `app/(app)/documents/[id]/page.tsx:39-47` — every `document.prd.*` field access for content/status/errorMessage/editedAt needs to read through `.currentVersion` instead (status/errorMessage stay on `prd` itself per the design above).
- `app/api/prds/[id]/export/route.ts` — unaffected for exporting the current version as-is; a future "export a specific past version" would need a version id/number param, out of scope for the base feature.

## Open questions

*(Not resolvable from primary sources alone — product/UX decisions.)*

- Does a manual edit (PATCH) create a new version, or mutate the current version's content in place? The existing `editedAt` field's presence on `content` suggests the current behavior treats an edit as "touching" the live document rather than a new generation — carrying that same semantic forward (edit mutates current version, only *generations* create new versions) is the simpler default, but is a judgment call, not a sourced one.
- Is there a cap on retained versions per document (age-based, count-based, or unlimited)? Nothing in the spec or code addresses storage growth for this.
- Are past versions read-only in the UI, or restorable (i.e. does "restore version N" create a new current-pointing version, or actually move the `currentVersionId` pointer back)? Moving the pointer back is simpler but would make `versionNumber` non-monotonic with "most recent," which may be confusing; creating a new version with old content preserves strict monotonic ordering at the cost of an extra row.
- `id` generation for the hand-written SQL backfill: existing `id` columns use Prisma's app-side `cuid()` default, which a raw SQL `INSERT` can't call directly. The sketch above uses `encode(gen_random_bytes(12), 'hex')` as a placeholder — the actual choice (pgcrypto's `gen_random_uuid()`, a `cuid`-compatible SQL function, or running the backfill via a one-off Node script using Prisma Client instead of raw SQL) needs to be settled at implementation time, not in this research pass.

## Recommendation

*(Judgment — not sourced fact.)*

**Approach**: the `PrdVersion` child-table design above, migrated via Prisma's documented expand → migrate → contract pattern using a hand-edited `--create-only` migration for the backfill.

**Main risk/tradeoff**: this is a genuine two-phase migration (expand now, contract later) touching a table with real production-shaped data already in it from this session's live testing — the backfill INSERT/UPDATE must be tested against a copy of that data before running for real, and the "contract" phase (dropping the old columns from `Prd`) should not happen in the same release as the "expand" phase, so any code that still reads the old `Prd.content` shape during a rolling deploy keeps working. The `id`-generation gap for the raw-SQL backfill (noted above) is the one loose end worth resolving with a quick Prisma-Client-based backfill script instead of raw SQL, if simplicity is preferred over doing it all in one migration file.
