---
description: Full pre-PR backend review — code review, compliance audit, and test-gap analysis merged into one report
argument-hint: [base-ref, defaults to main]
---

Base ref: $ARGUMENTS (if empty, use main)

Run over `git diff <base>...HEAD`:
1. **backend-code-reviewer** — full gate review
2. **compliance-auditor** — regime findings
3. **test-strategist** — coverage gaps for the changed surface

Merge into one report: verdict, blockers first, then majors, then a paste-ready PR checklist. Append a dated summary to CLAUDE_NOTES.md.
