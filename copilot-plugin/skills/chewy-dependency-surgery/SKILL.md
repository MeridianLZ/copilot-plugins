---
name: chewy-dependency-surgery
description: Chewy's dependency surgery - untangle broken dependency trees, version conflicts, lockfile corruption, peer-dep hell, transitive CVE pins, across npm/pnpm/NuGet/pip. Use when install/build fails on resolution, "works on my machine" dependency drift, or a bump broke everything. Do NOT use for application-logic bugs — that is chewy-legacy-triage.
license: MIT
allowed-tools:
  - read
  - search
  - execute
argument-hint: "<failing install/build or conflict to untangle>"
user-invocable: true
disable-model-invocation: false
---

# Chewy: Dependency Surgery

Method — smallest cut that makes it build:
1. Reproduce the failure verbatim; capture the exact resolver error.
2. Map the conflict: who demands what (`pnpm why`, `dotnet list package --include-transitive`, `pip debug`), draw the collision.
3. Prefer, in order: align versions upward → single explicit pin/override → resolution/overrides block → vendored patch (last resort, documented as debt).
4. Rebuild clean (wipe lockfile/node_modules or obj/bin only when the diagnosis says stale state — not as a ritual).
5. Verify: clean install + build + the originally failing command, output attached.

Report: what was tangled, the one change that fixed it, debt recorded (blackboard `artifact` event), and the growl — any upstream pin that will bite again.
