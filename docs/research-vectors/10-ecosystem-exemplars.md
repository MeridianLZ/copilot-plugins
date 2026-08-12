# Research Vector: Ecosystem Exemplars

**Collected:** 2026-08-01 to 2026-08-12  
**Confidence:** Medium; exemplars demonstrate patterns, not Copilot CLI
contracts.

## Repositories reviewed

| Repository | Useful evidence |
|---|---|
| `github/awesome-copilot` | Hook packaging and cross-platform examples |
| `github/copilot-sdk` | SDK telemetry configuration and context propagation |
| `microsoft/vscode` | Agent Host OTel, managed settings, native provider routing |
| `junhoyeo/tokscale` | Native Copilot OTel JSONL consumption and usage accounting |
| `github/copilot-cli` | Release/changelog evidence for moving hook and telemetry behavior |
| `Arize-ai/openinference` | OpenInference semantic conventions |
| `langwatch/langwatch` | Native Copilot instrumentation-scope extraction and canonicalization |

## Adopted patterns

- Separate native provider telemetry from custom lifecycle telemetry.
- Use explicit source identity and scope names.
- Treat local JSONL as a bounded ingestion surface, not an exactly-once store.
- Prefer operation and tool-call identity over timestamp-only joins.
- Keep content capture opt-in and redacted by default.

## Not adopted blindly

- Older tutorials claiming 13 events.
- Full-payload capture as a default.
- Vendor-specific OpenInference names as replacements for native `gen_ai.*`.
- Assumptions that native workspace identity is always present.
