# Broadening document intake beyond clean, text-native process docs

**Question:** SpecForge today accepts "a technical document about a process flow." What would it take to broaden intake to a general "business problem or business issue document" — with two concrete examples given: a manual process document pulled from a production site, and a manual form? The "manual form" case implies source material that may not be a clean, text-native document (a scanned/photographed form, tables, checkboxes, handwriting) — a shape the current text-extraction pipeline isn't built for.

No code was changed for this research. Findings only.

## 1. Current state (primary source: this repo's code)

Accepted file types are gated in two places that must agree:

- Client-side validation: `components/upload-dropzone.tsx:8-16` rejects on `detectSourceFileType()` and a 10 MB size cap; the file picker itself is restricted via `accept=".pdf,.docx,.md,.markdown,.txt"` (`components/upload-dropzone.tsx:92`).
- Server-side validation: `lib/documents/upload-document.ts:35-42` re-checks size (`MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024`, `lib/documents/upload-document.ts:7`) and `detectSourceFileType()` again — the server never trusts the client.
- Type detection: `lib/documents/file-type.ts:3-18` maps MIME type or (as a fallback) file extension to one of `PDF | DOCX | MARKDOWN | TEXT`. Anything else returns `null` and is rejected.

Parsing, dispatched by `fileType` (call site: `lib/worker/process-document-job.ts:50`, via `parseDocument()` — not shown here but re-exported from `lib/parsers/`):

- PDF: `lib/parsers/pdf-parser.ts` — `pdf-parse` v2.4.5's `PDFParse.getText()`. **Text-layer extraction only.** This library's own README documents that it also exposes `getScreenshot()` (rasterize pages to PNG) and `getImage()` (pull embedded raster images out of a PDF) as *separate* methods — `getText()` does not fall back to either automatically (`node_modules/pdf-parse/README.md:53-56, 170-226`). A scanned/image-only PDF (no text layer) will return an empty or near-empty string.
- DOCX: `lib/parsers/docx-parser.ts` — `mammoth.extractRawText()`. Extracts the document's text content only; embedded images/scans inside a DOCX are not handled specially.
- Markdown/TEXT: `lib/parsers/text-parser.ts` — a straight UTF-8 buffer decode.

The worker already anticipates the failure mode this question is about. `lib/worker/process-document-job.ts:39-41` has a comment distinguishing "never parsed" (`null`) from "parsed to an empty string (a scanned/image-only PDF, an empty upload)" — i.e., the current code already treats a scanned document as a known, already-observed edge case that silently produces empty text today, not a hypothetical.

Whatever text comes out of parsing is handed as a plain string to the LLM via `LLMGenerateParams.documentText` (`lib/worker/process-document-job.ts:78-81`), which both providers (`lib/llm/anthropic-provider.ts`, `lib/llm/openai-provider.ts`) embed into a system-prompt string. There is no image/vision content anywhere in the current LLM request construction.

**Conclusion:** today's pipeline is 100% text-in, text-out. A scanned form, a photographed process document, or a DOCX that's mostly a table of checkboxes will either extract to near-nothing (scanned PDF/DOCX-with-images) or extract to garbled/unstructured text (complex tables via `mammoth.extractRawText()`, which discards all formatting/structure — this is documented behavior of that method, not a bug: it's the "raw text" extractor, distinct from `mammoth.convertToHtml()` which preserves structure but was not chosen here).

## 2. Options for non-text-native input

### Option A — OCR library (Tesseract.js)

Per Tesseract.js's own README (fetched from `github.com/naptha/tesseract.js`, the project's official repo — this package is **not currently installed** in this repo, so no local type declarations to cite):

- API model: `createWorker(lang)` then `worker.recognize(image)`, reusing one worker across recognitions rather than creating/destroying per file.
- **Tesseract.js does not support PDF files directly** — the README states this explicitly and points to a separate project (Scribe.js) for PDF+improved-model support. To OCR a PDF with Tesseract.js, each page must first be rasterized to an image.
- License: Apache 2.0.
- No accuracy claims for handwriting are made in the README; Tesseract (the underlying engine, not just the JS port) is historically weak on handwritten text and messy/skewed scans compared to modern ML-based OCR — this is a general/well-known limitation of the classical Tesseract engine, not a claim sourced from the README fetched here, so treat it as lower-confidence than the cited facts above.

Useful integration detail specific to this repo: `pdf-parse` (already a dependency, `lib/parsers/pdf-parser.ts`) exposes `getScreenshot({ scale, desiredWidth, partial, first, last })`, which renders PDF pages to PNG buffers (`node_modules/pdf-parse/README.md:170-200`) — this is exactly the missing "rasterize a PDF page to an image" step Tesseract.js needs, and it's already in the dependency tree. No new PDF-rasterization dependency would be needed to feed Tesseract.js.

### Option B — Vision-capable LLM extraction (skip OCR, let the model read the image/PDF directly)

Both LLM SDKs already installed in this repo support image/document input in their request shape today (verified against the installed type declarations, not docs):

- **Anthropic** (`@anthropic-ai/sdk`, used in `lib/llm/anthropic-provider.ts`): `ContentBlockParam` includes `ImageBlockParam` (`type: 'image'`, source `Base64ImageSource { media_type: 'image/jpeg'|'image/png'|'image/gif'|'image/webp', data, type: 'base64' }` or a URL/file source) **and** `DocumentBlockParam` (`type: 'document'`), whose source can be `Base64PDFSource { media_type: 'application/pdf', data, type: 'base64' }` — i.e., Claude models can ingest a **raw PDF directly as a document content block**, including scanned/image-only PDFs, without any client-side text extraction or rasterization at all. (`node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts:95-104, 1774-1815`.)
- **OpenAI** (`openai`, used in `lib/llm/openai-provider.ts`): Chat Completions' `ChatCompletionContentPart` union includes `ChatCompletionContentPartImage` (`type: 'image_url'`), whose `image_url.url` field accepts "either a URL of the image or the base64 encoded image data" (`node_modules/openai/resources/chat/completions/completions.d.ts:995-1019`) — i.e., a data URL works, no separate upload step required. There is also a `ChatCompletionContentPart.File` variant in the same union (`completions.d.ts:944`) for direct file input; its exact shape wasn't inspected further here since the image path already covers the scanned-form case.

Practical implication: **Anthropic's native PDF document-block support is the more direct fit for "scanned production-site document" and "manual form"** — no rasterization needed even for multi-page scanned PDFs, since Claude handles that internally. For OpenAI, or for non-PDF images (a photographed form, a JPEG/PNG scan), the image would need to be rasterized/loaded as image bytes first — for a PDF, `pdf-parse`'s existing `getScreenshot()` covers that; for an already-image file, no conversion is needed at all, it's just base64-encoded and sent.

This also means "vision extraction" doesn't have to be a separate pipeline stage that outputs plain text before generation — it can be the *same* `generatePrd()` call, with the source content block being an image/document instead of (or alongside) `documentText`. That's a meaningfully different shape than Option A, where OCR output text still flows through the existing `documentText: string` field unchanged.

### Option C — Cloud document-intelligence service (e.g. AWS Textract)

Per AWS's own Textract documentation (`docs.aws.amazon.com/textract/latest/dg/what-is.html`):

- Purpose-built for exactly this case: "detect typed **and handwritten** text," extract "text, forms, and tables from documents with structured data" via the Document Analysis API, and there's a dedicated `AnalyzeExpense`/`AnalyzeID`/Queries feature set for structured extraction from forms specifically.
- Accepts both image files and PDF files directly (no separate rasterization step needed, similar to Anthropic's native PDF support).
- Synchronous API for single-page/low-latency use, asynchronous operations for multi-page documents.
- Pay-per-document pricing, no upfront commitment (exact rates not fetched here — see AWS Textract pricing page for current numbers, not reproduced here since pricing pages change independently of this research and a stale number would mislead more than help).
- This is the only option of the three that is a dedicated, purpose-built forms/handwriting extraction product — both Tesseract.js and general vision-LLM prompting are general-purpose tools being pointed at this problem, not built for it specifically. AWS's own docs frame form/table extraction as a first-class feature (`AnalyzeDocument`, `AnalyzeExpense`), not a side effect of general OCR.

## 3. Rough tradeoffs

| | Tesseract.js (OCR) | Vision LLM (Anthropic native PDF / OpenAI image) | AWS Textract |
|---|---|---|---|
| Handwriting accuracy | Weak (classical OCR engine; not ML-based handwriting recognition) | Generally strong — modern vision-LLMs handle handwriting/messy layouts materially better than classical OCR, though no benchmark was fetched here to cite | Explicitly supported and marketed as a capability |
| Forms/tables/checkboxes | No structural understanding — flat text out | Good — the LLM can reason about layout/structure directly, and this repo's downstream step (PRD generation) is itself LLM reasoning, so structure-aware extraction and generation could even collapse into one call | Purpose-built (`AnalyzeDocument` Forms/Tables features) |
| New infra dependency | New npm package only; runs in-process (worker or web via WASM) | None — both LLM SDKs are already dependencies, already have API keys configured (`OPENAI_API_KEY`/`ANTHROPIC_API_KEY`, see `lib/env.ts`) | New AWS account/credentials, new SDK, new IAM permissions, a genuinely new external dependency this project doesn't have today (current storage is S3-*compatible*/MinIO, not AWS-specific; this would be the first hard AWS-specific dependency) |
| PDF handling | Needs rasterization first (via `pdf-parse`'s `getScreenshot()`, already available) | Anthropic: native, no rasterization. OpenAI: needs rasterization like Tesseract.js | Native |
| Cost per document | Free (compute only) | Per-request LLM cost, scaled by image/document tokens — likely comparable to or cheaper than a second network hop to a dedicated OCR service, since generation already requires an LLM call | Per-page, metered (see AWS pricing page) |
| Latency | Local, but classical OCR is slow at high accuracy settings | One LLM call — potentially *replaces* the parse step entirely rather than adding to it | Extra network round-trip to AWS before the existing LLM call |
| Where it plugs in | Would slot into `lib/parsers/` as a new parser producing `documentText: string`, same seam as `pdf-parser.ts`/`docx-parser.ts` today — `parseDocument()`'s existing dispatch-by-`fileType` seam in `lib/worker/process-document-job.ts:50` doesn't need to change shape | Doesn't fit the `documentText: string` seam as naturally — would need `LLMGenerateParams` (`lib/llm/types.ts`) to grow an image/document-content variant, since the value-add is skipping text extraction and handing the model the source directly | Same seam as Option A: a new `lib/parsers/` entry producing text, plus a new external-service client (comparable in shape to `StorageProvider`'s existing abstraction pattern, but for a document-intelligence call instead of storage) |

## Recommendation (opinion, not a sourced fact)

Vision-LLM extraction — specifically leaning on Anthropic's native PDF document-block support first, since it needs zero new infrastructure and zero rasterization step for the messiest case (a multi-page scanned PDF) — looks like the best first move: it reuses dependencies and API keys already in this project, and for a "manual form" or "process document from a production site," letting the model reason about layout/structure directly is likely to beat flat OCR text on exactly the kind of document these examples describe (forms, checkboxes, non-linear layout). Tesseract.js is the cheapest to run but weakest on the handwriting/messy-form case that's explicitly called out in the question. AWS Textract is the most purpose-built but the only option that adds a genuinely new cloud dependency to a project that has otherwise stayed storage/LLM-provider-agnostic (S3-compatible, pluggable `LLMProvider`) — worth it only if vision-LLM extraction proves insufficiently accurate in practice. This is not a proposal for how to shape the abstraction (that's `to-spec`/`to-tickets` territory); it's a read on which direction is worth prototyping first.
