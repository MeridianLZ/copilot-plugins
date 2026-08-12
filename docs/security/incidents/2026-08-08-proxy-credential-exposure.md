# CRITICAL INCIDENT: Authenticated Proxy Credential Exposure

- **Incident date:** 2026-08-08
- **Severity:** Critical
- **Status:** Contained at the service credential layer; stale local copies remain to be removed
- **Classification:** Credential exposure through agent transcript and tool output
- **Affected credential:** The authenticated proxy URI shared by `HTTP_PROXY` and `HTTPS_PROXY`
- **Raw secret:** Intentionally omitted. The username/password and full authenticated URI are credentials and must not be reproduced in source control, transcripts, or a new report.
- **Evidence run:** `C:\Users\lzautke\.copilot\session-state\1fb4f57a-eb7d-44c7-908e-c6e6f96d0932\files\bootstrap-evidence\2026-08-08T13-43-32-0600_bootstrap-nonnative-01`

## Executive summary

During Docker Engine proxy configuration, a PowerShell command read the inherited
`$env:HTTP_PROXY` and `$env:HTTPS_PROXY` values, base64-encoded them, assembled a
WSL shell script, and sent that script to `wsl.exe`. A later revision used:

```powershell
[Console]::Out.Write($script) | wsl -u root -e bash -s
```

That pipeline caused the generated script to be emitted into the tool's captured
stdout. The script contained reversible base64 representations of the
authenticated proxy URI. Base64 was incorrectly treated as a protection
mechanism; it is encoding, not encryption.

The technical bootstrap succeeded, but the evidence run was correctly sealed as
failed with `terminal_reason=security_incident`. The original evidence and its
correction were preserved and must not be rewritten or deleted.

## Exact compromised credential identification

The exact raw credential is identified below without reprinting the secret:

| Property | Recorded value |
|---|---|
| Environment variables | `HTTP_PROXY` and `HTTPS_PROXY` |
| Equality | Both values were identical |
| URI scheme | `http` |
| Proxy host | `vm-mb-az035.meridianbanker.com` |
| Proxy port | `8080` |
| Userinfo | Present; authenticated proxy URI |
| Decoded URI length | 87 bytes |
| Base64 length | 116 characters for each credential-bearing encoding |
| SHA-256 fingerprint | `6bbf5140efb3dcd781d0c01d7f9331f88e4fb058766740b2727c40f8d13bbd52` |

The raw username/password is deliberately not included here. The endpoint,
length, equality, and fingerprint identify the compromised value unambiguously
for internal rotation and cleanup without creating another copy of the
credential.

The same generated script also carried a base64-encoded `NO_PROXY` value. That
third value was not the credential, but it was exposed by the same output bug.

## What accessed the credential and why

### Direct incident access

The incident command did **not** open `.env.local`, `.gitconfig`, or `.npmrc`.
It read the already-inherited process environment:

```powershell
$http = $env:HTTP_PROXY
$https = $env:HTTPS_PROXY
$no = $env:NO_PROXY
```

The values were read so Docker's systemd service in WSL could reach the
enterprise package/image registries through the corporate proxy. The command
then:

1. Converted the three values to base64.
2. Embedded the encoded values in a shell script.
3. Sent the script to WSL to create a Docker systemd drop-in.
4. Restarted Docker and checked that the daemon inherited proxy variables.
5. Accidentally wrote the generated script to stdout while also piping it to WSL.

### Exact transcript and event location

- **Transcript:** `C:\Users\lzautke\.copilot\session-state\1fb4f57a-eb7d-44c7-908e-c6e6f96d0932\events.jsonl`
- **Command event:** line 2689, tool execution start
- **Captured output:** line 2690, tool execution complete
- **Captured form:** reversible base64 strings inside the generated systemd script
- **Root bug:** `[Console]::Out.Write($script) | wsl ...` made the secret-bearing script observable to the tool-result recorder

The sealed verification record describes the incident at:

`...\bootstrap-nonnative-01\verification.json`

with verification SHA-256:

`C70E1A0460E6A99D8AAC4D55FC6C0545CDF5B70F14AAEC99B87C37C14CEEDB1F`

The append-only correction is:

`...\bootstrap-nonnative-01\verification-correction-001.json`

with SHA-256:

`E63712EA513B59EBCC07C1D155D3BBAEA33C474CA73F12536185B817592A8BBF`

## Credential provenance and plaintext locations

The direct incident command consumed process environment values. The broader
local provenance and storage chain was also identified:

| Layer | Location | Finding |
|---|---|---|
| User-facing loader | `C:\Users\lzautke\Documents\PowerShell\Scripts\Sync-ProxyConfiguration.ps1` | Loads `C:\Users\lzautke\.env.local`, then sets process `HTTP_PROXY`/`HTTPS_PROXY` |
| Dotenv declaration | `C:\Users\lzautke\.env.local` | Contains two proxy declarations that reference User-scope environment variables; it is not the raw value source |
| Raw Windows user scope | `HKCU:\Environment` | Contains the authenticated values for both variables |
| Plaintext Git sink | `C:\Users\lzautke\.gitconfig` | Contains the current proxy URI |
| Plaintext npm sink | `C:\Users\lzautke\.npmrc` | Contains the current proxy URI |
| WSL Docker sink | `/etc/systemd/system/docker.service.d/proxy.conf` | Contains proxy environment assignments; mode 600, 290 bytes at inspection |
| Durable conversation sink | `C:\Users\lzautke\.copilot\session-state\1fb4f57a-eb7d-44c7-908e-c6e6f96d0932\events.jsonl` | Contains the emitted base64 representation and must be treated as sensitive evidence |

The file directly written by the failing Docker configuration command was:

`/etc/systemd/system/docker.service.d/proxy.conf`

The file that declares how the process variables are populated is:

`C:\Users\lzautke\.env.local`

The file that actually stores the raw Windows user-scope values is the
`HKCU:\Environment` registry location, not the dotenv file.

## Post-rotation observation

The user rotated the remote enterprise credential. A verification performed in
this same long-lived process still observed the old 87-byte fingerprint in the
current process and User-scope environment. This proves that stale local copies
survived rotation; it does **not** prove that the rotated remote credential
remains valid.

A clean security state therefore requires all of the following:

- Start a new shell after rotation.
- Remove or replace the old values in `HKCU:\Environment`.
- Remove or replace the old values in `.gitconfig`, `.npmrc`, and the WSL Docker
  drop-in.
- Restrict and retain the sealed transcript as incident evidence; do not edit it
  to hide the event.
- Prove that the new fingerprint differs from the exposed fingerprint.

## Root-cause analysis

### Primary failure

Secret-bearing data was assembled into a command/script string that was allowed
to flow through a general-purpose output pipeline. The tool recorder captured
stdout as conversation content.

### Contributing failures

1. Base64 was used as if it were secret protection.
2. The command had no invariant that secret-bearing stdout must be empty.
3. The command did not separate a fixed helper script from the credential
   transport.
4. Proxy credentials were duplicated into Git, npm, Windows user scope, and a
   systemd drop-in.
5. There was no canary scan over tool arguments, tool results, process command
   lines, and durable transcripts before sealing the run.
6. A long-lived shell retained a stale pre-rotation environment after the
   remote credential was rotated.

## Required remediation plan

The plan is **B+C**: immediate sealed handoff and environment-only access,
followed by a credentialless local proxy gateway.

### Phase 0: contain and invalidate

- [x] Rotate/revoke the exposed remote credential.
- [x] Preserve the failed evidence run and its hashes.
- [ ] Restart all shells and services that inherited the old environment.
- [ ] Remove old authenticated values from `HKCU:\Environment`.
- [ ] Remove old authenticated values from `.gitconfig` and `.npmrc`.
- [ ] Replace or remove `/etc/systemd/system/docker.service.d/proxy.conf`.
- [ ] Verify the new proxy fingerprint differs from the exposed fingerprint.
- [ ] Treat the Copilot transcript and tool-result archive as restricted
  incident evidence.

### Phase 1: environment-only proxy accessor

Create one shared accessor for all local tooling. It must:

- Read only process-scope `HTTP_PROXY` and `HTTPS_PROXY`.
- Require both values to be present, identical, and valid.
- Reject unresolved expressions, newline characters, control characters, and
  unsupported schemes.
- Return an in-memory value only.
- Never print, throw, log, hash, base64-encode, or include the value in an
  exception.
- Never read `.env.local`, the registry, Git config, npm config, or arbitrary
  files at runtime.
- Emit only non-sensitive facts: variable names, endpoint host/port, length,
  and a one-way fingerprint when explicitly requested by a verifier.

### Phase 2: sealed WSL/Docker handoff

Replace command interpolation with a fixed WSL helper and a dedicated secret
channel:

- The PowerShell command line contains no credential and no encoded credential.
- The helper receives the credential through redirected stdin or an equivalent
  OS credential channel, never through command arguments.
- The helper never echoes stdin.
- PowerShell redirects helper stdout/stderr away from the agent transcript and
  returns only a status code and non-sensitive health facts.
- The Docker service consumes a root-only runtime credential, preferably a
  systemd encrypted credential (`LoadCredentialEncrypted`) or an equivalent
  protected secret store.
- No authenticated proxy URI is written to a repository, command history,
  process argument list, diagnostic output, OTel attribute, or evidence bundle.
- The helper refuses to run if it cannot prove that stdout/stderr are
  suppressed and that the target path is the expected root-owned path.

### Phase 3: remove plaintext tool configuration

- Do not write authenticated proxy URLs to Git global configuration.
- Do not write authenticated proxy URLs to npm configuration.
- Do not put authenticated proxy URLs in Docker Compose files, `.env` files,
  systemd unit text, shell profiles, or project documentation.
- Keep process variables as the only application-facing source during the
  transition.
- Add a cleanup command that reports only path, presence, permissions, and
  fingerprint mismatch; it must never print file contents.

### Phase 4: credentialless local gateway

Build a local proxy gateway that:

- Reads the two process environment variables once at startup.
- Keeps upstream authentication in memory.
- Exposes only an unauthenticated loopback/private-WSL listener to Docker,
  npm, Git, and local services.
- Gives clients a credentialless proxy URL such as
  `http://127.0.0.1:<port>`.
- Does not put upstream credentials in its command line, config, logs,
  metrics, traces, UI, or crash reports.
- Has health checks that report connectivity and endpoint identity, never
  credentials.
- Fails closed if the two environment values disagree or are absent.
- Uses a bounded allow-list for destinations and a local-only bind by default.

The gateway reduces the number of systems that ever handle the authenticated
URI. Docker and the package managers no longer need to receive the credential
at all.

## Permanent prevention controls

These are release-blocking invariants:

1. **No secret in command text.** A command containing a proxy URI, base64
   encoding, URL-encoded credential, or secret-bearing variable expansion is
   rejected before execution.
2. **No secret in output.** Any helper that receives credentials must have
   stdout and stderr redirected and tested as empty.
3. **No base64 security theater.** Encoding is prohibited as a credential
   transport unless the bytes are carried through a non-observable protected
   channel and are never printed.
4. **No plaintext persistence.** Git, npm, Docker Compose, systemd text,
   transcripts, logs, traces, screenshots, and runbooks may not contain the
   authenticated URI.
5. **Single runtime source.** Production code reads only process
   `HTTP_PROXY`/`HTTPS_PROXY`; source-file discovery belongs to an explicit
   bootstrap step and is not part of the runtime path.
6. **Fail closed.** Any inability to verify the channel, output sink, target
   path, or redaction result blocks the operation.
7. **Evidence is append-only.** Failed, aborted, and security-invalid runs are
   retained with hashes and corrections rather than relabeled.

## Verification protocol

Every future bootstrap or acceptance run must use a unique synthetic canary
credential and record only its fingerprint:

1. Set process `HTTP_PROXY` and `HTTPS_PROXY` to the canary, with no file
   source lookup.
2. Run the Docker/WSL handoff and gateway startup.
3. Capture stdout, stderr, tool arguments, tool results, process arguments,
   Windows environment snapshots, `/proc` environment snapshots, Docker state,
   systemd state, Git/npm config, collector output, UI DOM, screenshots, and
   the append-only runbook.
4. Search all captured artifacts for:
   - raw canary;
   - base64 canary;
   - percent-encoded canary;
   - username and password fragments;
   - authenticated URI;
   - command-line and shell-history variants.
5. Require zero matches.
6. Require only endpoint, length, fingerprint, and pass/fail facts in the
   resulting evidence.
7. Seal the run as pass only when technical and security checks both pass.

## Evidence handling

- Never rewrite `verification.json`.
- Never delete or sanitize the transcript in place.
- Add corrections as new append-only records.
- Keep the evidence directory access-controlled.
- Do not copy the raw credential into a new ticket, issue, commit, prompt,
  screenshot, or chat message.
- The next clean run must have a new run ID and must explicitly prove that its
  fingerprint differs from the exposed fingerprint.

## Acceptance criteria

The remediation is not complete until all of these are true:

- A clean non-native telemetry run passes with zero secret-canary matches.
- Docker reaches required registries through the sealed handoff or gateway.
- Git and npm operate without authenticated proxy URLs in their config files.
- The Docker daemon has no authenticated proxy URL in command-line-visible
  state.
- The collector, bridge, Aspire, and custom UI receive no proxy credential
  attributes or content.
- A deliberately induced failure is recorded as failed without leaking the
  canary.
- The evidence runbook contains hashes and outcomes, not secrets.
