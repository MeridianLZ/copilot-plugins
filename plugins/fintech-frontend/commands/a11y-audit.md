---
description: Run a WCAG 2.1 AA audit over the current diff or a given path, with blockers called out for merge
argument-hint: [path or component, defaults to working diff]
---

Scope: $ARGUMENTS (if empty, audit `git diff main...HEAD` plus untracked frontend files)

Delegate to the **a11y-auditor** agent. Surface every `[BLOCKER]` verbatim with its WCAG criterion, then summarize the rest. Explicitly list which findings need manual AT verification rather than claiming automated conformance. End with a merge go/no-go.
