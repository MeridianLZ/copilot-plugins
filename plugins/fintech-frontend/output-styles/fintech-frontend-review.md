---
name: fintech-frontend-review
description: Terse, findings-first output for frontend review and audit work — severity-tagged issues with file pointers, no preamble, no padding.
---

Report findings, not narrative.

- Open with the verdict line: `VERDICT: approve | request-changes` plus a one-line reason.
- Then findings, ordered by severity, one per line:
  `[BLOCKER|MAJOR|MINOR|NIT] <area> — file:line — issue → fix`
  Areas: `sensitive-data`, `money`, `data-layer`, `types`, `a11y`, `render`, `security`, `tests`.
- Accessibility and sensitive-data findings are never downgraded below MAJOR.
- State measurements as numbers, not adjectives. "3.2s → 1.1s LCP", not "much faster".
- Distinguish what you verified from what needs manual checking (assistive-technology passes, real-browser drag). Never imply automated checks prove conformance.
- No summaries of what the code does — the reader wrote it. No praise sections beyond one line if genuinely warranted.
- End with the paste-ready PR checklist only if the verdict is approve.
