# Proposal: broaden PRD generation beyond process-flow documents ("v2" prompt)

Status: research/draft only. No code has been changed. Not implemented, not ticketed.

## 1. Current state (primary source: this repo)

The entire PRD-generation contract lives in one constant, `PRD_SYSTEM_PROMPT`, in
`lib/llm/prompts.ts:1-32`. Its opening sentence scopes the whole feature:

> "You are a senior product manager. You turn technical documents that describe a
> process flow into a clear, structured Product Requirements Document (PRD) for an
> engineering team." — `lib/llm/prompts.ts:1`

The template mandates eight `##` sections in a fixed order (`lib/llm/prompts.ts:3-27`), one
of which is unconditional:

> "## Process Flow — A short prose summary of the process described in the source
> document, followed by a Mermaid flowchart diagramming it, in a fenced \`\`\`mermaid
> code block using \`flowchart TD\` syntax." — `lib/llm/prompts.ts:20-21`

There is already a generic anti-fabrication rule that applies to every section, including
this one:

> "If the source document doesn't have enough detail for a section, say so explicitly in
> that section rather than fabricating detail." — `lib/llm/prompts.ts:31`

So today, a non-process business-problem document doesn't crash or get rejected — the
model is instructed to write something like "not applicable" under the Process Flow
heading rather than invent a flow. But the heading itself is still forced to appear every
time, which is a template mismatch for documents that were never about a process.

**Both providers pass this same prompt through unmodified** — `lib/llm/anthropic-provider.ts:31`
(as a `system` block) and `lib/llm/openai-provider.ts:33` (concatenated into the `system`
message) — confirming a single edit to `PRD_SYSTEM_PROMPT` changes behavior for both
providers with no other code changes required.

## 2. Consumers of the generated Markdown (primary source: this repo)

Checked whether anything downstream assumes the Process Flow section, or any fixed
section, exists:

- **Rendering** (`components/prd-markdown.tsx:1-32`): uses `react-markdown` +
  `remark-gfm` generically over whatever headings are present. The only special-cased
  content type is a fenced code block whose language is literally `mermaid`
  (`components/prd-markdown.tsx:12-14`), which is rendered via `MermaidDiagram`
  (`components/mermaid-diagram.tsx:1-54`). Neither component looks for a `## Process
  Flow` heading by name or assumes a fixed section count — the mermaid block is detected
  purely by its fence language, wherever it appears in the document.
- **Repo-wide check**: `grep -rl "Process Flow"` across `app/`, `lib/`, `components/`
  turns up only `lib/llm/prompts.ts`, `lib/llm/fake-llm-provider.ts` (the canned demo
  output), and `lib/parsers/text-parser.test.ts` (a parser test fixture, unrelated to PRD
  structure). No export, API, or job-processing code parses or depends on that section
  existing.

**Conclusion: omitting the section entirely when not applicable is safe.** No frontend or
backend code will break; the Mermaid renderer simply won't be invoked for a PRD that has
no `mermaid` fence.

## 3. Primary-source research: does either vendor document a "conditional section" pattern?

Checked both vendors' current official prompt-engineering docs directly (fetched
2026-08-27):

- **Anthropic** — `https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices`
  (redirect target of `docs.claude.com/.../prompt-engineering/overview`). No section named
  or aimed at "conditional output sections" exists. The closest applicable techniques are
  general ones, not a named pattern:
  - **"Be clear and direct"**: *"Claude responds well to clear, explicit instructions. Being
    specific about your desired output can help enhance results... Be specific about the
    desired output format and constraints."*
  - **"Control the format of responses" → "Tell Claude what to do instead of what not to
    do"**: recommends phrasing constraints as positive instructions (e.g. "Your response
    should be composed of X" rather than "Do not do Y"), and offers XML tags as format
    indicators for steering structure.
  - **"Structure prompts with XML tags"**: *"XML tags help Claude parse complex prompts
    unambiguously... Wrapping each type of content in its own tag... reduces
    misinterpretation."*
  None of these amount to a documented "include section X only if condition Y" recipe —
  that instruction has to be composed from these general clarity/format-control
  principles, not copied from a named technique.
- **OpenAI** — `https://developers.openai.com/api/docs/guides/prompt-engineering`
  (redirect target of `platform.openai.com/docs/guides/prompt-engineering`). Also has no
  section on conditional/dynamic output structuring. The closest relevant text is about
  constraining available context, not conditionally structuring output: *"To constrain the
  model's response to a specific set of resources that you have determined will be most
  beneficial"* (from "Include relevant context information") — not directly applicable
  here.

**Finding, stated plainly: "conditional section" is not a documented pattern from either
vendor.** The proposal below is original composition using each vendor's general
clarity/explicitness/format-control guidance, not a citation of an established recipe —
flagged here so nobody mistakes it for vendor-endorsed practice.

## 4. Proposed v2 `PRD_SYSTEM_PROMPT`

Drop-in replacement for the constant in `lib/llm/prompts.ts`. Changes from v1 are: (a) the
opening framing broadens from "process flow" documents to general business/technical
problem documents, (b) the Process Flow section becomes conditional with an explicit,
positively-phrased criterion (per the "tell it what to do" and "be specific about
constraints" guidance above) instead of an unconditional requirement papered over by the
generic anti-fabrication rule, and (c) everything else — every other section, the
anti-fabrication rule, the output-format rule — is preserved verbatim.

```ts
export const PRD_SYSTEM_PROMPT = `You are a senior product manager. You turn a document describing a business problem, business issue, or technical problem into a clear, structured Product Requirements Document (PRD) for an engineering team. The source document may or may not describe a process flow — some describe a sequence of steps or a workflow, others describe a problem, a pain point, or a set of requirements with no inherent sequence. Read the source document first and judge which kind it is before writing.

Produce the PRD as a single GitHub-flavored Markdown document with the following top-level "##" headings, in this order:

## Overview
A short summary of what this PRD covers and why it matters.

## Problem Statement
The problem being solved, from the affected users' perspective.

## Goals & Non-Goals
A bulleted list of goals, followed by a bulleted list of explicit non-goals.

## User Stories / Personas
A numbered list of user stories in the form "As a <role>, I want <capability>, so that <benefit>."

## Functional Requirements
A numbered list of concrete, testable requirements derived from the source document.

## Process Flow
Include this section only if the source document actually describes a sequence of steps, a workflow, or an operational process that a reader could follow or automate. When you include it, write a short prose summary of the process, followed by a Mermaid flowchart diagramming it, in a fenced \`\`\`mermaid code block using \`flowchart TD\` syntax. If the source document does not describe any such process or sequence, omit this section entirely — do not include the "## Process Flow" heading at all in that case.

## Success Metrics
A bulleted list of measurable metrics that would indicate this succeeded.

## Open Questions / Risks
A bulleted list of open questions, risks, or ambiguities you noticed in the source material.

Rules:
- Base every section on the actual content of the source document. Do not invent requirements or user stories that aren't supported by it.
- If the source document doesn't have enough detail for a section (other than Process Flow, which is instead included or omitted per its own instruction above), say so explicitly in that section rather than fabricating detail.
- Output only the Markdown document itself: no preamble, no commentary, no code fence wrapping the whole document.`;
```

`buildUserPrompt()` (`lib/llm/prompts.ts:34-36`) needs no change — it just tells the model
to follow "the required section structure," which is still true; the structure itself now
has one conditional member.

### Why omit the heading entirely, rather than keep it with a "not applicable" note

Two options were considered:

1. **Omit entirely** (chosen): cleaner reading document, no dangling heading over a
   one-line disclaimer, and it's the more literal application of the "tell it what to do"
   positive-instruction technique — the instruction says exactly what to do in both
   branches, rather than relying on the model to apply the generic anti-fabrication rule
   to this specific case as it does today.
2. **Always keep the heading, force a "not applicable" line under it**: this is
   effectively what happens today via the generic rule, and is the reason this proposal
   exists — it reads as an obviously templated PRD when the section says "not applicable"
   with nothing else, which is the exact symptom driving this request.

## 5. Downstream impact check

- **Token budget** (`MAX_OUTPUT_TOKENS` in `lib/llm/anthropic-provider.ts:6` = 32000,
  `lib/llm/openai-provider.ts:6` = 16000): the v2 prompt is a few sentences longer in the
  *input* (system prompt), which is negligible against either budget and doesn't touch
  `max_tokens` accounting the same way. The *output* either stays the same size (process
  document) or gets smaller (one fewer section), never larger — so neither budget needs to
  change.
- **Frontend rendering**: no change needed (§2). `PrdMarkdown` and `MermaidDiagram` are
  already agnostic to which headings are present.
- **`FakeLLMProvider`** (`lib/llm/fake-llm-provider.ts`): `FAKE_PRD_MARKDOWN` hardcodes all
  eight sections including Process Flow, used for local dev (`LLM_PROVIDER=fake`) and
  presumably some tests. It does not need to change for v2 to be safe to ship (it's just
  one canned example, and the rendering path doesn't care), but it also can't demonstrate
  the new "omitted" behavior — whoever implements this may want a second fixture or a way
  to exercise the no-process-flow path in tests. Left as an open item, not a requirement,
  since it's outside this research's scope.

## Recommendation (judgment, not a sourced fact)

Ship the v2 prompt above as a straight replacement of `PRD_SYSTEM_PROMPT`. It is
backward-compatible for every existing process-flow document (the model will still
recognize a described process and include the section, unchanged from today's behavior)
and closes the real gap for non-process business/technical problem documents. The only
implementation-time decision left open is whether to add a fixture/test exercising the
"Process Flow omitted" path — worth doing given this repo's existing test discipline
(dedicated env/provider tests, etc.), but it's a small addition, not a blocker to scoping
a ticket.
