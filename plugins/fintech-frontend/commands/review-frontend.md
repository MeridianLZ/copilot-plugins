---
description: Full pre-PR frontend review — code review, accessibility audit, and test-gap analysis merged into one report
argument-hint: [base-ref, defaults to main]
---

Base ref: $ARGUMENTS (if empty, use main)

Run over `git diff <base>...HEAD`:
1. **frontend-code-reviewer** — full gate review
2. **a11y-auditor** — WCAG findings
3. **frontend-test-engineer** — coverage gaps for the changed surface, especially revert and keyboard paths

Merge into one report: verdict, blockers first, then majors, then a checklist to paste into the PR description. Append a dated summary to CLAUDE_NOTES.md.
