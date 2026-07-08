# fintech-backend

.NET microservices plugin for enterprise banking. Enforces PCI-DSS v4.0, SOX ITGC, SOC 2 Type II, and GLBA/FFIEC.

## Agents
| Agent | Model | Purpose |
|---|---|---|
| `vertical-slice-architect` | opus | Slice structure; Wolverine vs MediatR vs plain DI; where shared logic belongs |
| `iso20022-payments-expert` | opus | pain/pacs/camt, CBPR+/HVPS+, structured addresses, Nov 2026 Swift deadline |
| `ledger-domain-modeler` | opus | Double-entry invariants, immutability, balance projections, event sourcing |
| `microservice-architect` | opus | Service boundaries, data ownership, ADRs, PCI scope impact |
| `aspnet-api-engineer` | sonnet | Endpoints, validation, authZ policies, idempotency |
| `servicebus-messaging-specialist` | sonnet | Outbox/inbox, sessions, DLQ, message versioning |
| `efcore-data-specialist` | sonnet | Entity config, migrations, query performance, encryption converters |
| `okta-auth-specialist` | sonnet | OIDC via BFF, step-up MFA, downstream policies |
| `compliance-auditor` | opus | Read-only regime audit |
| `k8s-onprem-deployer` | sonnet | Helm/Kustomize, NetworkPolicies, pod security, .NET GC limits |
| `test-strategist` | sonnet | Testcontainers, contract tests, property-based money math |
| `backend-code-reviewer` | opus | Pre-PR gate review |

## Commands
`/new-service` · `/new-slice` · `/iso20022-check` · `/ledger-review` · `/migration-safety` · `/audit-compliance` · `/review-backend` · `/threat-model`

## Skills
`backend-conventions` · `vertical-slice-architecture` · `iso20022-payments` · `ledger-modeling` · `servicebus-patterns` · `saga-orchestration` · `efcore-migration-safety` · `api-contracts` · `pci-secure-coding` · `secure-logging` · `sox-change-control` · `okta-oidc-bff` · `k8s-onprem-deploy` · `otel-observability` · `dotnet-testing`

## Hooks
- **PreToolUse[Bash]** — blocks `kubectl` mutations, `helm install/upgrade`, `dotnet ef database update`, `DROP`/`TRUNCATE`, ledger `UPDATE`/`DELETE`, force push, hard reset, recursive force delete; blocks reading `.env`/`.pem`/`.pfx`/prod appsettings, K8s secret payloads, env dumps, and outbound `curl -d`/`--upload-file`
- **PreToolUse[Write|Edit]** — denies Luhn-valid PANs, SSN patterns, inline secret literals, Service Bus connection strings, **float/double money types**, and `Database.Migrate()`
- **PostToolUse[Write|Edit]** — `dotnet format whitespace` on the touched file
- **PostToolUse[*]** — append-only JSONL audit log
- **SessionStart** — regime banner, branch state, pending migration artifacts, and an ISO 20022 warning if unstructured address fields are detected

## Architecture stance

Vertical slices by default, but with Clean-style dependency direction protecting the domain core (money, ledger, sagas). The mediator is a **decision, not a default** — plain DI unless a concrete cross-cutting concern earns MediatR or Wolverine. Generic `IRepository<T>` over EF Core is rejected on sight.

The ISO 20022 agent treats the **November 14, 2026** Swift release as active work, not a future milestone, and flags any single-column address model as a migration blocker. It also instructs verifying deadline details against live Swift publications rather than trusting the summary baked into the skill — that schedule has moved before.
