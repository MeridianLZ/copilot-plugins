---
name: goose-preflight-checklist
description: Goose's preflight checklist - go/no-go readout before a merge, deploy, config change, or other maneuver - tests, hooks-live verification, rollback path, blast radius, sign-offs. Use before merging/deploying/shipping anything, or when the user says "preflight", "are we go", "ready to ship?". Do NOT use for a quick informal risk read — that is chewy-risk-gutcheck.
license: MIT
allowed-tools:
  - read
  - search
  - execute
argument-hint: "<maneuver to preflight: merge|deploy|config> [<target>]"
user-invocable: true
disable-model-invocation: false
---

# Goose: Preflight Checklist

Run every line; a skipped line is a NO-GO reason, not a shrug:

| # | Check | Evidence required |
|---|---|---|
| 1 | Tests green | actual run output, not "should pass" |
| 2 | Build/lint/typecheck clean | command output |
| 3 | Guards/hooks LIVE | attempted-block test (e.g. try a denied command and confirm denial) — file presence proves nothing |
| 4 | Rollback path real | the actual command/procedure, tested or previously exercised |
| 5 | Blast radius named | data, services, users, money in reach |
| 6 | Config/secrets sane | SSoT respected, no inline secrets, env diff reviewed |
| 7 | Sign-offs | required approvals present |

Verdict: **GO / NO-GO / GO-WITH-CONDITIONS** (conditions enumerated, each with an owner). Verdict + checklist land on the blackboard as a `decision` event with `agent_name: goose`.
