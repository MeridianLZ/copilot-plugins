# Repository Guidelines

## Project Structure & Module Organization

This repository distributes two fintech plugins. Treat `plugins/fintech-frontend/` and `plugins/fintech-backend/` as canonical sources; each contains plugin metadata, agents, commands, skills, hooks, and shell helpers. Shared compliance logic belongs in `shared/guards/`. `build/build.sh` translates canonical content into `targets/codex/`, `targets/cursor/`, and `targets/copilot/`. Never hand-edit generated `targets/` files. Marketplace metadata lives in `.claude-plugin/marketplace.json`; project orientation and installation notes live in `README.md`.

## Build, Test, and Development Commands

- `jq --version` confirms the required JSON processor is available.
- `bash build/build.sh` regenerates every target, validates JSON with `jq`, and syntax-checks all shell scripts with `bash -n`.
- `/plugin marketplace add /absolute/path/to/fintech-marketplace` registers this checkout in Claude Code.
- `/reload-plugins` reloads changed hooks, Model Context Protocol (MCP) settings, Language Server Protocol (LSP) settings, and agents during local development.

Run the build after changing canonical plugin content or shared guards. Inspect generated diffs before committing.

## Coding Style & Naming Conventions

Use two-space indentation for JSON, YAML, and shell control-flow bodies. Shell scripts start with `#!/usr/bin/env bash` and `set -euo pipefail`; quote expansions and prefer small, direct functions. Use kebab-case for agent files, commands, skills, and scripts (for example, `ledger-domain-modeler.md`). Keep plugin-specific behavior under its plugin and reusable enforcement in `shared/`.

## Testing Guidelines

There is no separate unit-test suite. The required regression check is `bash build/build.sh`. For guard changes, exercise at least one allowed and one denied input in addition to the build, and verify both output dialect and exit status. Name future test fixtures after the behavior they cover.

## Commit & Pull Request Guidelines

History is currently minimal (`Initial prototype`), so follow repository policy: use Conventional Commit messages with useful scopes, such as `fix(guards): reject unmasked PAN output`. Keep commits focused. Pull requests should explain the affected plugin or target, compliance impact, generated files, and verification performed; link relevant issues and include screenshots only when rendered output changes.

## Security & Configuration

Do not commit credentials, audit logs, or customer data. Review `.mcp.json` changes carefully because configured servers start when a plugin is enabled. Keep enforcement fail-closed, preserve audit behavior, and document any platform fidelity limitation.
