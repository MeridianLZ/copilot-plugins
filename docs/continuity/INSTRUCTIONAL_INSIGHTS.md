# INSTRUCTIONAL INSIGHTS

_Append-only reusable patterns and lessons for working in this repo (and similar multi-target plugin/config-fanout repos)._

## 2026-08-10 — reduce pre-implementation overhead

- Once security/runtime and source-lane contracts have passing checks, prefer
  larger vertical slices over repeated per-file review loops. The final user
  value is the live dual-lane UI, not an accumulation of isolated parser
  commits.
- Keep dependency failures separate from implementation status. Here, native
  OTel and bridge work are complete and tested; MCP is blocked by registry
  optional-package materialization, not by missing source design.
- For corporate npm access on Windows, a new proxy window can still produce
  intermittent upstream 502/504/connection-reset failures even when the local
  proxy listener is healthy. Record the exact package-manager failure and stop
  before introducing insecure TLS or credential-bearing command workarounds.
- When a continuity refresh occurs during active implementation, record the
  current commit chain and worktree state first; older crisis/task sections
  remain durable history but must be explicitly marked superseded.

## 2026-08-06 latest (FAQ pass)

- **Answer capability questions from the installed `.d.ts` and a live probe, not docs or memory.** "Can the primary agent set effort?" resolved in one grep of `SessionConfigBase`/`session.setModel` — including the capability gate (`supports.reasoningEffort`) that docs elide.
- **When documenting a two-lane system, lead with the question each lane answers** (control vs truth), not their mechanisms — that's what makes "why keep the hook lane?" self-evident.

## 2026-08-06 late (replica takeover)

- **When a rendering looks doubled, check the capture layer before the renderer.** Every span appearing exactly twice (one clean, one "recovered 0 ms" ghost) was two hook files firing — visible in 60 seconds by grouping ledger lines on `(session, event, timestamp)`. Smoke sessions (which bypass hooks) rendering singly was the decisive control.
- **Idempotency keys must be minted from content, not by the emitter.** A per-process `randomUUID()` event_id can never dedupe across N installations; hash the payload (its ms timestamp makes it a natural identity).
- **When a UI can't show X, ask whether X was ever captured.** The replica gap was 3 layers deep: dup capture → hashed content → an event vocabulary that structurally lacks assistant prose. No renderer work could fix it; the fix was adopting the substrate that already had everything (`session-state/events.jsonl`), discovered via a `transcript_path` field the code carried but never dereferenced.
- **Browse-first, then seam-map with subagents, then design.** Click-through + live-fire produced the root-cause list in ~30 min; three parallel Explore/research agents then pinned every file:line and SOTA fact; the Plan agent caught a stale assumption (the "uncommitted" work had been committed mid-investigation by the parallel session).
- **Verify mid-implementation against the richest real dataset, not just fixtures.** Rendering 6baa (854 events, 5 subagents) between phases exposed the turn-semantics bug (83 native turn_starts vs 12 user exchanges) that unit fixtures were too small to show.

## 2026-08-06

- **When a research pass surfaces concrete defects, fix them before polishing UI.** The Docker UI miss and content-mode split-brain would have made the conversation viewer look "broken in prod" even if the static HTML was excellent. Ship the fail-path plumbing first, then the renderer.
- **Re-project the ledger for every consumer.** OTel spans, the waterfall projector, and the conversation tree are three views of one append-only JSONL truth. Keeping a pure-data projector (no SDK) makes UI/export deterministic and unit-testable without a collector.
- **Prefer server-side verbatim export for anything users will share.** Client-only markdown diverges as the UI evolves; a `/conversation.md` endpoint freezes the transcript contract and lets the UI just download it.
- **Code-block toolbars belong on hover with event delegation.** One document-level click handler for copy/line-numbers/font-size scales to every block without re-binding after live refresh.
- **Smoke tests should include at least one ERROR path.** Happy-path-only smoke left `postToolUseFailure` and `errorOccurred` unproven until coverage forced them — bake those into the default smoke.
- **Subagent teams are useful for parallel research/implementation, but the controller must integrate.** Hardening agent + UI agent + coordinator-owned conversation API avoided merge conflicts by clear file ownership; still required a final export-wiring pass on `ui/index.html`.

## 2026-08-08 — secret-channel incident

- **Never place a secret-bearing script in an output pipeline.** The command was
  intended to send a script to WSL, but `[Console]::Out.Write($script) | wsl ...`
  made the entire script a captured tool result. Redirected stdin is only safe
  when stdout/stderr are separately suppressed and the helper is fixed,
  non-echoing, and tested with a synthetic canary.
- **Base64 expands the blast radius without reducing it.** Any incident scan
  must search raw, base64, URL-encoded, and other reversible representations.
- **Trace provenance, not just the immediate command.** The direct command read
  inherited process variables, while the local chain also included
  `.env.local`, User-scope registry values, `.gitconfig`, `.npmrc`, and the WSL
  systemd drop-in. Incident reports must distinguish direct reads from source and
  sink artifacts.
- **Rotation does not clear inherited state.** A long-lived shell can retain the
  pre-rotation value; rotation acceptance requires new processes plus a fingerprint
  mismatch and cleanup of all local copies.
- **Security is part of evidence correctness.** A technically passing telemetry
  run must remain failed if its evidence handling leaks a credential.


## 2026-08-05

- **A pasted reference implementation defines intent, not architecture.** The user's Python `server.py` (FastMCP wrapping `gh copilot`) named the *goal* — copilot callable by other agents over MCP — while wrapping a deprecated substrate. Extract the requirement list from such references, then re-derive the substrate from current SOTA (`@github/copilot-sdk` here) instead of porting the reference.
- **When a requirement references a document that never arrived** ("the python at the end of the following"), exhaust local search fast (repo docs, ~/ dirs, Downloads incl. `.crdownload` partials), then ask with concrete candidate options rather than guessing — the answer here (a Gemini export) was un-findable locally by construction.
- **Verify SDK dist-tags at build start, not research time.** The "v2 beta" plan aged out mid-task — `npm view <pkg> dist-tags` showed 2.0.0 stable had shipped between the announcement blog and implementation day. One command avoided building on a superseded beta.
- **Read the installed `.d.ts`, not the docs, before writing against a fast-moving SDK.** Both SDKs diverged from their own documentation (`cliUrl` option doesn't exist → `RuntimeConnection.forUri`; permission kinds differ from the research doc's `approve`/`deny`). Grepping `dist/*.d.ts` after `pnpm install` is cheaper than a failed typecheck cycle.
- **Design watchdog/liveness as three distinct layers**: transport pong (server process answers), agent round-trip (the model must respond through the real ask path), and time-window viability (dead-man timer reset by real work via a `withCheckIn` wrapper — no dedicated heartbeat traffic). Each layer catches failures the others can't.
- **Let the dead-man switch fire once on purpose.** The organic detonation of the left-running HTTP server both proved the teardown path end-to-end and exposed a real bug (per-request expiry-hook stacking) that unit tests with a single server instance could never catch.
- **Stateless per-request MCP handlers need process-level state discipline**: anything that must survive across requests (bridge, watchdog, session registry) lives outside the server factory and is passed in; anything registered *on* shared state (callbacks) must be registered outside the factory too.
- **Cross-agent verification is one headless command**: `claude -p "<use the tool>" --allowedTools "mcp__<server>__<tool>"` exercises registration + spawn + full protocol + the wrapped agent in a single line — the strongest cheap acceptance test for any MCP server.

## 2026-08-02

- **Offline-assembled AI deliverables carry phantom dependency pins.** A research stack validated "with stubs" can pin package versions that don't exist (here `typescript@6.0.0`). The first act after adopting such a deliverable is a real `pnpm install && pnpm check` — treat its VALIDATION.md as a claim, not evidence.
- **A checksummed deliverable (`SHA256SUMS`) is a signal to fork, not edit.** Promote it wholesale to its implementation home and evolve the copy; the checksums keep the reference verifiable and diffable forever.
- **Port collisions can masquerade as auth failures.** An OTLP exporter reporting "Unauthorized" may just be talking to a different service squatting the standard-ish port (14318 here). Before debugging credentials, check who owns the port (`Get-NetTCPConnection` → `Get-Process`). Then obey the no-generic-ports rule: pick from the >10000 free range and put it in `.env` as SSoT with compose interpolation.
- **Reuse pairing logic as pure data for UIs.** Rather than teaching the UI OpenTelemetry, re-project the append-only event ledger into plain-JSON spans at read time (`trace-projector.ts` mirrors `SpanAssembler` rules without the OTel SDK). The ledger stays the single source of truth; the projector is trivially testable; the UI is a dumb renderer.
- **Browser a11y-tree reads surface `title` attributes for generic nodes** — a waterfall label can look wrong in `read_page` while `textContent` is correct. Verify with a targeted `javascript_tool` `textContent` check before "fixing" rendering.
- **Spool files are forensic gold in fail-open pipelines**: a spool entry proves the hook fired even when the bridge was down — check the spool before concluding hooks aren't installed.

## 2026-07-19

- **When auditing a "canonical → generated" repo layout**, don't trust a single source-of-truth claim in a README at face value — grep/read the actual generator script (`build/build.sh` here) to confirm which files it writes, because untracked files can accumulate outside that flow (e.g. the orphaned `guard-core.sh` copies found this session) and look canonical when they aren't.
- **When a repo centralizes a cross-cutting concern (here: compliance enforcement) into one "shared" implementation but also ships per-consumer copies of a subset of the same logic**, always check both the shared implementation and the consumer-local copies before concluding a rule change is complete. Grep for the rule's distinctive regex/string across the whole repo, not just the file you edited.
- **For bash-heavy repos with no formal test suite**, the fastest way to validate a rule/guard change is to pipe a synthetic JSON payload matching the tool's hook-input shape (`{"tool_input":{...}}`) directly into the guard script with `--dialect plain` (or whatever debug dialect exists) and check stdout + exit code. This repo's `guard-core.sh` supports exactly that pattern; look for equivalent `--dialect`/`--mode` debug affordances in other enforcement scripts before assuming you need the full agent runtime to test a hook.
- **`jCodeMunch` `get_file_content`/`get_file_outline` on JSON and shell files** returned useful `file_summary` metadata (symbol counts, function names) even for non-traditional "code" files like `hooks.json` and `.sh` scripts — worth reaching for over a raw `Read` even on config-heavy repos like this one, per the user's global code-exploration policy.
- **Continuity-file bootstrap**: when no continuity files exist yet, ground `PLANS.md`/`SESSION_LOG.md` in `git log` (commit hashes + dates) and `git status --short` rather than inventing timeline details — this repo had exactly one commit and a large uncommitted second phase, which is a useful pattern to name explicitly ("phase 1 committed, phase 2 in progress uncommitted") rather than treating all files as equally "current."
