---
description: Audit the current diff against PCI-DSS, SOX, SOC 2, and GLBA/FFIEC with a merge-blocking findings report
argument-hint: [path or ref, defaults to working diff vs main]
---

Scope: $ARGUMENTS (if empty, use `git diff main...HEAD` plus untracked files)

Delegate to **compliance-auditor**. Surface every Critical and High finding verbatim with its regime and file pointer; summarize Medium and Low. End with a go/no-go verdict and the exact merge-blocking list. Mark suspected false positives `[ACCEPTED-RISK-CANDIDATE]` for a human — do not drop findings.
