# v2 Feature Proposal

Research note. All claims below are cited to their source (GitHub issue text or `file:line`). The final "Recommendation" section is judgment, not a sourced fact — kept separate deliberately.

Prior research this proposal builds on (not re-derived here):
- [`docs/research/broader-document-input.md`](./broader-document-input.md) — accepting scanned/image-based documents via vision-LLM extraction (Anthropic's native PDF document block, OpenAI base64 image input), not classical OCR.
- [`docs/research/prd-prompt-v2-proposal.md`](./prd-prompt-v2-proposal.md) — a drafted, empirically-tested (real `gpt-5.4` call) v2 system prompt that makes the `## Process Flow` section conditional instead of mandatory, so non-process business/technical problem documents don't get forced into a flowchart shape.

## Ground truth: what v1 actually does

- **Upload formats**: PDF, DOCX, Markdown (`text/markdown`, `text/x-markdown`), plain text — `lib/documents/file-type.ts:4-17` maps exactly these 4 MIME types / 5 extensions (`.md`/`.markdown` both map to `MARKDOWN`) to a `SourceFileType` enum of `PDF | DOCX | MARKDOWN | TEXT` (`prisma/schema.prisma:10-15`). No image or scanned-document path exists today.
- **Export formats**: `.md` only. `app/api/prds/[id]/export/route.ts:22-31` streams `prd.content` verbatim as `text/markdown` with a sanitized-filename `Content-Disposition`. No PDF/DOCX/HTML export exists.
- **PRD storage/versioning**: `Prd` is 1:1 with `Document` (`documentId String @unique`, `prisma/schema.prisma:58`) with a single `content` field (`prisma/schema.prisma:63`) and no `version` column, no history table. A Regenerate overwrites `content` in place — there is no way to see or restore a prior generation once regenerated (issue #6 comment confirms Regenerate has "no specific warning" beyond a discard-confirmation added in code review, not a stored history).
- **Auth/multi-tenant model**: Credentials-only (email/password) auth via Auth.js, one `User` row per account (`prisma/schema.prisma:24-34`), no team/org/workspace model anywhere in the schema or `lib/auth/` (`register-user.ts`, `password.ts`, `require-session.ts` — all single-user scoped). Every document/PRD query is scoped to `session.user.id` alone.
- **LLM provider abstraction**: `LLMProvider.generatePrd(params): Promise<LLMGenerateResult>` (`lib/llm/types.ts:13-15`) takes only `{ documentTitle, documentText }` (`lib/llm/types.ts:1-4`) — there is **no `additionalInstructions` parameter or any other input beyond the two fields**, despite the original spec's "Further Notes" describing such a field as already present (see Gaps found, below). Two concrete adapters exist (`AnthropicLLMProvider`, `OpenAIProvider`) plus a `FakeLLMProvider`, selected via `LLM_PROVIDER` env through a factory (`lib/llm/index.ts`) — this seam is exactly as extensible as the spec intended and already proved itself by absorbing the OpenAI adapter (issue #8) with zero call-site changes.
- **Storage abstraction**: `StorageProvider` interface with an S3-compatible adapter (MinIO locally) and a fake for tests (issue #4 summary) — same clean-seam pattern as `LLMProvider`.
- **Regenerate**: no-input, single action, overwrites in place (issue #5, #6 summaries; confirmed no instructions/feedback field anywhere in the regenerate route or `LLMGenerateParams`).

## Deferred by design

Directly from spec issue #1's own "Out of Scope" and "Further Notes" sections (`gh issue view 1`):

- **Team/organization workspaces or shared/multi-tenant access.** ("Team/organization workspaces or any shared/multi-tenant access to documents and PRDs" — Out of Scope. Also named again in Further Notes as a "natural extension point... deliberately not built now: ...a team/organization layer above the current per-user model.")
- **PRD version history, diffing, or regenerate-with-feedback.** ("PRD version history, diffing, or any regenerate-with-feedback / additional-instructions input" — Out of Scope. Further Notes repeats this as a named future extension point, and specifically claims "the `additionalInstructions` field already exists on the LLM interface, unused, for exactly this future addition" — see Gaps found: this field does not actually exist in the shipped code.)
- **Email verification and password-reset flows.** (Out of Scope, no comment elsewhere suggesting priority.)
- **Real-time status delivery** (WebSockets/SSE/webhooks — polling only). (Out of Scope; "Status delivery" implementation-decision section confirms polling was the deliberate choice, not an oversight.)
- **TLS termination, reverse proxy, production domain.** (Out of Scope — "this build targets local/dev Docker Compose on `localhost`.")
- **External APM/error-tracking integration** (e.g. Sentry, Datadog). (Out of Scope; "Observability" implementation-decision section says structured logging is deliberately structured so "adding one later doesn't require reshaping log call sites" — i.e. this was left as an intentionally-easy future add, not a gap.)
- **Admin/ops dashboard or cross-user visibility.** (Out of Scope.)
- **Collaborative/simultaneous multi-user editing of the same PRD.** (Out of Scope.)
- **Internationalization/localization and a native mobile app.** (Out of Scope.)
- **`OpenAIProvider` alongside the Anthropic adapter.** (Further Notes named this explicitly as a deferred extension point — already shipped in issue #8, so this item is **done**, not open.)

## Gaps found

These are discrepancies between the spec's own narrative and the code that actually shipped — not speculative feature ideas:

- **The spec's Further Notes claims `additionalInstructions` "already exists on the LLM interface, unused."** It does not: `LLMGenerateParams` (`lib/llm/types.ts:1-4`) has exactly two fields, `documentTitle` and `documentText`. Either the spec was written slightly ahead of an interface change that was later simplified away during implementation, or the field was never added. Either way, "add a feedback/instructions input to Regenerate" is not a small wire-up of an existing unused field — it requires adding the parameter to the interface, both provider adapters, the regenerate route, and the UI.
- **The spec's implementation-decisions section claims `Prd.version` "exists as a field but isn't surfaced as a feature yet."** It does not exist either: `prisma/schema.prisma:56-74` has no `version` column on `Prd`, and there is no separate history/version table. So "PRD version history" isn't a matter of surfacing a dormant field — it's a real schema addition (most likely a new `PrdVersion` table, since the current `Prd` row is mutated in place on every regenerate and edit).
- **No file-size ceiling beyond the original 10 MB spec requirement was found to have changed** — not a gap, included here only to note nothing else drifted in the upload-limits area.

## Recommendation

*(Judgment — not sourced fact.)*

**P1 — highest leverage, most grounded:**

1. **PRD version history** (schema gap + explicitly named deferred item). This is the single highest-leverage v2 feature: today, Regenerate is a one-way door — a user who regenerates and dislikes the result has permanently lost the previous PRD, with no comment in the UI beyond a discard confirmation. A `PrdVersion` table (or equivalent) storing prior `content`/`modelId`/token-usage snapshots on each regenerate/edit, plus a simple "view previous version" / "restore" UI, directly closes both the Out-of-Scope item and the schema gap in one stroke, and every other future PRD feature (diffing, feedback-driven regenerate) is easier to build once history exists as a seam.
2. **Regenerate-with-feedback (`additionalInstructions`)** (explicitly named deferred item, natural extension of the existing `LLMProvider` interface). Adding an optional `additionalInstructions?: string` to `LLMGenerateParams`, threading it through both adapters' prompt construction, and exposing an optional text box on Regenerate is a small, well-bounded change riding directly on the seam that already absorbed the OpenAI adapter with zero friction. High user value (turns Regenerate from "reroll" into "steer") for low implementation risk.
3. **The two already-completed research proposals** (`prd-prompt-v2-proposal.md`, `broader-document-input.md`) — bundling the conditional Process Flow section and vision-LLM document intake together as one v2 ticket, since both touch the same prompt/parsing seam and were already validated (one empirically against a real API call, one against both installed SDKs' own type declarations).

**P2 — real, but larger or riskier:**

4. **Team/organization workspaces.** Explicitly deferred twice in the spec, but this is a genuinely large change (new data model layer, new authorization rules across every existing query) compared to P1's items — worth scoping as its own multi-ticket effort via `/to-spec`, not folded into a general "v2" ticket.
5. **Additional export formats** (PDF/DOCX/HTML export of a generated PRD). Not named anywhere in the spec's Out-of-Scope or Further Notes — this is *my* addition, grounded only in the observed gap that export is markdown-only today, not in any deferred-scope statement. Flagged as lower-confidence/optional for that reason.

**P3 — correctly left alone:**

6. Real-time status delivery (WebSockets/SSE), APM integration, i18n, admin dashboard, collaborative editing — all explicitly deferred with clear rationale in the spec, and none of them are blocking anything else on this list. No evidence any of them should be pulled forward.
