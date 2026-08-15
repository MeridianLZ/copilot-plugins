# RAW RESEARCH — GitHub Copilot Coding Agent (a.k.a. "Copilot cloud agent") Modality

**Compiled 2026-07-25**

**Research method summary:** This is Research Stream 3 of 3 in a parallel fan-out. Method used, per the task brief, ALL of the following, with no method skipped:

1. **Web search** (`WebSearch` tool) — official `docs.github.com/copilot` pages, `github.blog` changelog/blog posts, third-party writeups, Stack Overflow, security research blogs. ~14 distinct search queries run.
2. **Context7** (`GetMcpTools` on `user-context7` → `resolve-library-id` → `query-docs`) — resolved library ID `/websites/github_en_copilot` (10,889 snippets, High source reputation, benchmark 74.19) and queried it directly for billing/quota and MCP-configuration topics, cross-verifying the web-search findings against a second independently-indexed source.
3. **GitHub code search** (`user-github` MCP server, `search_code` tool) — searched `filename:copilot-setup-steps.yml` across all of github.com (4,024 total hits at time of search), inspected real-world examples including `microsoft/playwright`, `github/copilot-sdk`, `microsoft/hve-core`.
4. **Local reference check** — read `/Users/derp/.agents/docs/reference/kitchen-sink-plugins-compare-contrast.md` in full. Confirmed: this document covers Copilot **CLI** only (plugins, hooks, skills, agents-as-markdown) and contains **zero** mentions of the coding-agent/cloud-agent (issue-assignment, async, GitHub Actions–hosted) modality. This research fills that gap; it is intentionally *not* a diff against that doc since there is nothing there to diff against.

**⚠️ CRITICAL FRAMING NOTE — READ FIRST:** The product this stream was asked to research under the name "**GitHub Copilot coding agent**" was **officially renamed to "Copilot cloud agent" by GitHub on approximately 2026-04-01** (see Q1 and the terminology section below). As of the check date (2026-07-25), **current official documentation uses "Copilot cloud agent" almost exclusively**; "coding agent" now survives mainly (a) in URL path segments that haven't been fully migrated (`/coding-agent/` still resolves and 200s alongside newer `/cloud-agent/` paths), (b) in the literal bot/branch identifiers (`copilot-swe-agent[bot]`, `copilot/` branch prefix), (c) in API/schema field names retained for backward compatibility (`used_copilot_coding_agent`), and (d) in older blog posts, third-party tutorials, and code comments written before April 2026. This document uses **"Copilot cloud agent"** as the primary/current term throughout, and calls out "coding agent" explicitly wherever it is the historically- or currently-attested alternate name, since the user's original request used the older name and both terms are load-bearing for search/recognition purposes.

---

## 1. Product identity & invocation

**Confidence: high — checked: 2026-07-25**

### 1.1 What it is, and its name(s)

- Officially, as of 2026-04-01, the product is **"Copilot cloud agent"** ([github/docs commit 0ec7a69](https://github.com/github/docs/commit/0ec7a69530a490750c64b163b6cdfc9fb35d1e9b), commit message: `Rename "Copilot coding agent" to "Copilot cloud agent" and "CCA can now research, plan and code without creating a PR"`). GitHub's own changelog entry confirms this explicitly: *"We've recently renamed Copilot coding agent to Copilot cloud agent. We will be updating our data schema for all existing coding agent fields to reflect this change in the coming weeks."* ([GitHub Changelog, 2026-04-10](https://github.blog/changelog/2026-04-10-copilot-usage-metrics-now-aggregate-copilot-cloud-agent-active-user-counts/)).
- It was originally launched (GA'd mid-2025) and marketed through most of 2025 as **"Copilot coding agent"** — an *"asynchronous software engineering agent... built on GitHub Actions"* ([GitHub Blog, 2025-07-31, "Onboarding your AI peer programmer"](https://github.blog/ai-and-ml/github-copilot/onboarding-your-ai-peer-programmer-setting-up-github-copilot-coding-agent-for-success/)).
- **Conceptually it is distinct from "agent mode"** in the IDE/CLI: agent mode makes autonomous edits synchronously in your local environment; Copilot cloud agent works **asynchronously, in the cloud**, on a GitHub Actions–hosted ephemeral environment, and (optionally, as of April 2026) without even requiring a pull request to be opened ([about-cloud-agent](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent), checked 2026-07-25).
- The literal execution identity/bot account is `Copilot` (GitHub user ID `198982749`, `type: Bot`), and its legacy internal/commit-author name is `copilot-swe-agent[bot]` — this name is **not searchable via GitHub's user/author search index** (`author:copilot-swe-agent` returns 0 results; you must search by the `copilot/` branch prefix, or the literal PR-body signature string `"START COPILOT CODING AGENT"`, or `author:copilot`/`author:"@copilot"`) ([github/gh-aw PR #1972](https://github.com/github/gh-aw/pull/1972), [PR #2763](https://github.com/github/gh-aw/pull/2763), [PR #2028](https://github.com/github/gh-aw/pull/2028), checked 2026-07-25). A 2026-05-22 gh-aw PR ([#34026](https://github.com/github/gh-aw/pull/34026)) shows the canonical set of "Copilot bot" identities as **three**: `copilot-swe-agent[bot]` (the coding/cloud agent), `Copilot` (the interactive `@Copilot` mention-bot), and `copilot[bot]` (base form) — useful if you need to allowlist/recognize the agent's actions in your own automation.

### 1.2 How it's triggered today

Multiple trigger surfaces exist, confirmed across docs + blog + API changelogs:

1. **Assigning a GitHub issue to Copilot** (via the Assignees sidebar on github.com, GitHub Mobile, or the GitHub CLI) — the classic/default trigger. Always creates a pull request. Copilot adds a 👀 reaction, then opens a branch + draft PR ([kick-off-a-task](https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/kick-off-a-task), [GitHub Blog, "Assigning and completing issues..."](https://github.blog/ai-and-ml/github-copilot/assigning-and-completing-issues-with-coding-agent-in-github-copilot/)).
2. **"Starting with a prompt"** in the Agents tab/panel at `github.com/copilot/agents` — works on a branch by default, letting you review/steer before a PR is opened. As of the April 2026 "research, plan, and code" update, this no longer requires a PR to exist at all ([kick-off-a-task](https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/kick-off-a-task); [Changelog 2026-04-01](https://github.blog/changelog/2026-04-01-research-plan-and-code-with-copilot-cloud-agent/)).
3. **"Seeding a repository"** — creates a draft PR with scaffolded code from a prompt (documented alongside #1/#2 in `kick-off-a-task`).
4. **@-mentioning `@copilot` in a PR review comment** to ask it to iterate on an existing PR based on feedback — this is the "respond to review comments" loop: *"Leave review comments or request changes by using @copilot, @claude, or @codex"* ([GitHub Changelog 2026-02-04](https://github.blog/changelog/2026-02-04-claude-and-codex-are-now-available-in-public-preview-on-github/)).
5. **REST API and GraphQL API** (GA'd 2025-12-03) — you can assign issues to Copilot programmatically. GraphQL requires the request header `GraphQL-Features: issues_copilot_assignment_api_support` and the mutation `assignCopilotAgentToAssignable(input: {assignableId, agentId})`; REST support is via the standard "Add assignees to an issue" / "Create an issue" / "Update an issue" endpoints ([GitHub Changelog, 2025-12-03](https://github.blog/changelog/2025-12-03-assign-issues-to-copilot-using-the-api/)). Note from a corroborating Stack Overflow thread (checked 2026-07-25): this requires **"Copilot for Pull Requests and Issues"** to be enabled in repo settings, or the mutation fails with an opaque internal error ([Stack Overflow](https://stackoverflow.com/questions/79791527/assigning-github-issue-to-copilot-fails-using-graphql)).
6. **GitHub CLI**, via the `gh agent-task` command suite, added in `gh` 2.80.0 (2025-09-25): `gh agent-task create "prompt"`, `gh agent-task list`, `gh agent-task view <id>`, `gh agent-task view <id> --log --follow`; aliases `gh agent-tasks`, `gh agent`, `gh agents` ([GitHub Changelog, 2025-09-25](https://github.blog/changelog/2025-09-25-kick-off-and-track-copilot-coding-agent-sessions-from-the-github-cli/)). **Gotcha:** `gh agent-task create` currently requires an interactive **OAuth token**, not a plain `GITHUB_TOKEN`/PAT injected in CI — there is an open, unresolved `cli/cli` issue (#11845) asking for this restriction to be lifted for automation use cases ([cli/cli#11845](https://github.com/cli/cli/issues/11845), checked 2026-07-25). A workaround mentioned in that thread: driving the agent via the GitHub **remote MCP server**'s "create a pull request" tool, authenticated with a PAT, instead of `gh agent-task`.
7. There is **no evidence** of a distinct "`copilot-swe-agent`" CLI trigger command or config flag as its own product surface — that string is purely the bot's legacy internal actor name, not a user-facing invocation mechanism (contradicts a plausible-sounding assumption in the original task prompt; see also §1.1 above and the "Open questions" section).
8. GitHub Actions integration: the coding/cloud agent **runs on top of GitHub Actions** as its execution substrate (see §5), but there is no separate "GitHub Actions integration" trigger beyond the setup-steps workflow — the Actions relationship is about environment provisioning, not invocation.

### 1.3 Plans/licensing tiers required

- Requires **any paid Copilot plan**: Pro, Pro+, Business, or Enterprise ([troubleshoot-cloud-agent](https://docs.github.com/en/enterprise-cloud@latest/copilot/how-tos/use-copilot-agents/cloud-agent/troubleshoot-cloud-agent); [GitHub Copilot Plans & Pricing](https://github.com/features/copilot/plans)). **Not available on the free Copilot plan.**
- For **Business/Enterprise**, an administrator must explicitly enable Copilot cloud agent for the org/enterprise (policy-gated) — see §7 below and [Enabling GitHub Copilot cloud agent in your enterprise](https://docs.github.com/en/enterprise-cloud@latest/copilot/how-tos/administer-copilot/manage-for-enterprise/manage-agents/enable-copilot-cloud-agent).
- For **personal/individual repos**, it's toggled per-account at `github.com/settings/copilot/features`.
- Pricing/tier snapshot (from a third-party 2026 roundup, cross-checked against the official pricing page — **medium confidence** on exact dollar figures since third-party pricing summaries can drift, **high confidence** on the tier-gating logic itself which matches official docs): Pro $10/mo, Pro+ $39/mo, Business $19/user/mo, Enterprise $39/user/mo, all include coding/cloud agent access ([PinkLime blog, 2026](https://pinklime.io/blog/github-copilot-agent-mode-2026), cross-referenced with [github.com/features/copilot/plans](https://github.com/features/copilot/plans)). There is also a **"Copilot Max"** tier mentioned on the official pricing page as *"built for heavy Copilot usage, including sustained agent-driven workflows, and includes $100/month in GitHub AI Credits"* — this appears to be new/recent as of the 2026-07-25 check and is not covered in the third-party roundup.

### 1.4 Current capability scope

Confirmed capabilities, per official docs and blog:

- Opens draft PRs from an issue or prompt; iterates on PR review feedback via commits; **responds to human review comments** ("Copilot works on the task and requests your review when it finishes... if you leave feedback, it'll revise the PR and keep going until you approve") ([GitHub Blog, "Assigning and completing issues..."](https://github.blog/ai-and-ml/github-copilot/assigning-and-completing-issues-with-coding-agent-in-github-copilot/)).
- Runs in a **sandboxed, ephemeral GitHub Actions–powered dev environment** — clones the repo, installs deps, runs tests/linters ([about-cloud-agent](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent)).
- As of April 2026: can **"research a repository, create a plan, and make code changes on a branch — all before opening a pull request"**, i.e. it is no longer PR-first; you can let it work purely on a branch ([about-cloud-agent](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent); [Changelog, 2026-04-01](https://github.blog/changelog/2026-04-01-research-plan-and-code-with-copilot-cloud-agent/)).
- Runs **security validation on its own generated code** ("gets a second opinion... with Copilot code review") before finalizing the PR, catching hardcoded secrets/insecure deps — and this does **not require** a GitHub Advanced Security / Code Security / Secret Protection license ([risks-and-mitigations](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/risks-and-mitigations)).
- Hard constraint: **only works with repositories hosted on GitHub itself** — no support for mirrored/externally-hosted repos ([about-cloud-agent](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent)).
- Since 2026-02-04, **"third-party coding agents"** — Anthropic Claude and OpenAI Codex — are available *alongside* (not replacing) Copilot cloud agent, assignable via the same Assignees dropdown or `@claude`/`@codex` mentions, and consuming the same Copilot subscription's premium-request pool ([GitHub Changelog, 2026-02-04](https://github.blog/changelog/2026-02-04-claude-and-codex-are-now-available-in-public-preview-on-github/); [about-third-party-coding-agents](https://docs.github.com/en/copilot/concepts/agents/about-third-party-coding-agents)). As of 2026-04-14, model selection is available for these too (Claude Sonnet/Opus 4.5/4.6, GPT-5.2/5.3-Codex, GPT-5.4) ([Changelog, 2026-04-14](https://github.blog/changelog/2026-04-14-model-selection-for-claude-and-codex-agents-on-github-com/)).

---

## 2. Configuration

**Confidence: high — checked: 2026-07-25**

### 2.1 `.github/workflows/copilot-setup-steps.yml` — exact schema/conventions

This is a **special-cased GitHub Actions workflow file** that GitHub's agent runner looks for and runs *before* Copilot cloud agent starts work, to provision its ephemeral dev environment (install deps, cache toolchains, etc.) ([customize-the-agent-environment](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/customize-the-agent-environment); mirrored at the newer path [.../coding-agent/customize-the-agent-environment](https://docs.github.com/copilot/how-tos/use-copilot-agents/coding-agent/customize-the-agent-environment) — both paths resolve as of 2026-07-25, evidence of the in-progress coding-agent → cloud-agent doc migration).

**Hard requirements:**
- Path **must** be exactly `.github/workflows/copilot-setup-steps.yml`.
- Must contain **exactly one job**, and that job's key **must** be literally `copilot-setup-steps` — "The job MUST be called `copilot-setup-steps` or it will not be picked up by Copilot." If misnamed, it is silently ignored.
- Must exist **on the repository's default branch** to take effect.
- **Only these job-level keys are honored** — anything else you add is *silently ignored* by the coding-agent runner (though the file will still run as a normal Actions workflow on its own triggers):
  - `steps`
  - `permissions`
  - `runs-on`
  - `services`
  - `snapshot`
  - `timeout-minutes` (**hard max value: 59** — see also §5's 59-minute session cap)
- If you **do not** include a checkout step, Copilot checks out the code for you automatically after your steps complete.
- Recommended/canonical trigger block (appears verbatim across docs, GitHub's own `copilot-sdk` repo, and the `github/awesome-copilot` skill template) — so that the file is *also* validatable as a normal CI check on PRs that touch it:

```yaml
name: "Copilot Setup Steps"
on:
  workflow_dispatch:
  push:
    paths:
      - .github/workflows/copilot-setup-steps.yml
  pull_request:
    paths:
      - .github/workflows/copilot-setup-steps.yml

jobs:
  # The job MUST be called `copilot-setup-steps` or it will not be picked up by Copilot.
  copilot-setup-steps:
    runs-on: ubuntu-latest
    permissions:
      contents: read   # only needed if you check out the repo yourself in setup steps
    steps:
      - name: Checkout code
        uses: actions/checkout@v6
      - name: Install dependencies
        run: npm ci
```

(Sources: [customize-the-agent-environment](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/customize-the-agent-environment); [improve-a-project tutorial](https://docs.github.com/en/enterprise-cloud@latest/copilot/tutorials/cloud-agent/improve-a-project); [give-access-to-resources](https://docs.github.com/en/copilot/tutorials/cloud-agent/give-access-to-resources); [GitHub Blog 2025-07-31](https://github.blog/ai-and-ml/github-copilot/onboarding-your-ai-peer-programmer-setting-up-github-copilot-coding-agent-for-success/); real-world examples below.)

**Real-world examples found via GitHub code search** (`filename:copilot-setup-steps.yml`, 4,024 total hits at check time, confidence: high — these are live, in-production files, not doc snippets):

- [`microsoft/playwright/packages/playwright/src/agents/copilot-setup-steps.yml`](https://github.com/microsoft/playwright/blob/3827650d171cc1b035cbefb7e00bf5948d6809df/packages/playwright/src/agents/copilot-setup-steps.yml) — Playwright ships a **template** copy of this file as part of their agent-scaffolding tooling (interesting: this means Playwright generates/recommends this file for *downstream* users' repos, not just its own).
- [`github/copilot-sdk/.github/workflows/copilot-setup-steps.yml`](https://github.com/github/copilot-sdk/blob/f2e846929ce61a509c6e8841a0feacb2dd1bec96/.github/workflows/copilot-setup-steps.yml) — GitHub's own SDK repo; notably multi-language (Node.js, Python, .NET, Java, Go via `just`), uses `if: github.event.repository.fork == false` to skip running on forks, and pins `actions/checkout@v6.0.2`, `actions/setup-node@...`. Also installs the `gh-aw` CLI extension in setup steps — direct evidence of the coding-agent / gh-aw ecosystem overlap (see §3).
- [`microsoft/hve-core/.github/workflows/copilot-setup-steps.yml`](https://github.com/microsoft/hve-core/blob/main/.github/workflows/copilot-setup-steps.yml) — comments explicitly cite the docs URL, confirming doc-driven convention adoption in the wild.
- [`github/awesome-copilot/skills/github-copilot-starter/SKILL.md`](https://github.com/github/awesome-copilot/blob/8395dce14cce763504aab2197effcc62c730a0f6/skills/github-copilot-starter/SKILL.md) — a **Copilot-authored skill whose entire purpose is scaffolding this exact file** for new repos, with per-language templates (Node/Python/Java) and the instruction "**KEEP WORKFLOWS SIMPLE**". This is strong evidence for the *idiomatic* minimal-steps convention (checkout + one language setup action + maybe lint/test), rather than replicating full CI.

**Azure-specific extension pattern:** the Azure Developer CLI ships an `azd cloud-agent config` command that **auto-generates** a `copilot-setup-steps.yml` (with an OIDC `azure/login` step) plus the required Copilot secrets, then opens a PR with it — a vendor-provided scaffolding tool for this exact file ([configure-mcp-servers, "Example: Azure"](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/configure-mcp-servers)).

### 2.2 `.github/copilot-instructions.md` applicability to this modality

**Yes, fully applicable**, and it is one of **multiple layered instruction sources** the coding/cloud agent reads. Per the authoritative support matrix ([custom-instructions-support](https://docs.github.com/en/copilot/reference/custom-instructions-support), checked 2026-07-25), **Copilot cloud agent** supports all of:

- 📦 Repository-wide instructions (`.github/copilot-instructions.md`)
- 📂 Path-specific instructions (`.github/instructions/**/*.instructions.md`, with an `applyTo` glob-pattern frontmatter key)
- 🤖 Agent instructions (`AGENTS.md`, `CLAUDE.md`, or `GEMINI.md` files — note: this is a genuinely interesting finding, the cloud agent reads **competitor-agent-format files too**, i.e. `CLAUDE.md`/`GEMINI.md`, not just GitHub's own format)
- 🏢 Organization-level instructions

This exactly matches the set supported by **Copilot code review** (minus the AGENTS.md/CLAUDE.md/GEMINI.md line, which the matrix lists separately for code review vs. cloud agent — re-verify if precision matters) and is a **superset** of what plain Copilot Chat supports (Chat only gets 👤 personal + 📦 repo-wide + 🏢 org, no path-specific or agent-format files).

- Files use the **`applyTo`** YAML-frontmatter glob key for path-specific instructions, e.g.:
  ```yaml
  ---
  applyTo: **/games/*.py
  ---
  ```
  ([GitHub Blog 2025-07-31](https://github.blog/ai-and-ml/github-copilot/onboarding-your-ai-peer-programmer-setting-up-github-copilot-coding-agent-for-success/)).
- **Important nuance for code review specifically** (a closely related but distinct feature, sharing config): *"When reviewing a pull request, Copilot reads repository custom instructions, agent instructions, and agent skills from the **head branch** (the branch with your changes), **not the base branch**"* — so you can test instruction-file changes in the same PR that needs them ([copilot-code-review docs](https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/copilot-code-review)).
- There is an **`excludeAgent`** frontmatter keyword (found via the Copilot CLI custom-instructions docs, applies to instruction files broadly) that lets you scope an instructions file **away from** a specific agent target, with `"cloud-agent"` cited as one of the valid values in that list ([add-custom-instructions](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-custom-instructions)) — **confidence: medium**, the exact full syntax/allowed-values list for `excludeAgent` was truncated in the fetched excerpt and should be re-verified directly against the live doc page if this is load-bearing.

### 2.3 Repo-level policy/allowlist files (network firewall, allowed domains, allowed MCP servers)

There is **no single YAML/JSON file in the repo** for firewall/allowlist config — **it is entirely configured through the GitHub.com repository/org/enterprise **Settings UI**, not committed files**. This is a meaningful contrast with the CLI/VS Code modalities, which use committed config files (`.mcp.json`, hooks.json, etc.). Specifics:

- **Firewall/network allowlist**: Repository Settings → Copilot → **Coding agent** (older label) / **Cloud agent** (current label). Toggle: **Enable firewall** = Enabled / Disabled / "Let repositories decide" (org-level default). Sub-toggles: enable/disable the **recommended allowlist**, and manage a **custom allowlist** of domains or full URLs ([customize-the-firewall](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-the-firewall); [copilot-allowlist-reference](https://docs.github.com/en/copilot/reference/copilot-allowlist-reference)).
  - Domain entries allow all subdomains (`packages.contoso.corp` → also matches `prod.packages.contoso.corp`).
  - Full-URL entries restrict to scheme+host+path-prefix (`https://packages.contoso.corp/project-1/` does **not** match `ftp://` or a sibling path).
  - Org owners can lock down whether repos are even allowed to add custom rules ("Allow repository custom rules" toggle at the org level).
  - **The firewall only applies to processes started by the agent via its Bash tool** — it explicitly does **not** apply to (a) MCP servers, or (b) processes started during the `copilot-setup-steps.yml` setup steps. This is a critical, easy-to-miss scoping detail: **your setup-steps workflow has unrestricted network access; the agent's own shell commands during the task do not.**
  - The **recommended allowlist** (on by default) covers: common OS package repos (Debian/Ubuntu/RedHat), common container registries (Docker Hub, ACR, ECR, GHCR, Quay, GCR, MCR), language package registries (C#, Dart, Go, Haskell, Java, JS, Perl, PHP, Python, Ruby, Rust, Swift), common CAs, and Playwright's browser-download hosts.
- **MCP server config**: Repository Settings → Copilot → **MCP servers** (as of the current UI; older docs described this as living under the "Coding agent" settings tab before the shared-with-code-review consolidation — see §3 for the merge history).
- **Firewall self-hosted-runner caveat**: the integrated firewall is **not compatible with self-hosted runners or Windows runners** — if using self-hosted runners you must disable the built-in firewall and implement your own network egress controls, and separately allowlist the standard [self-hosted-runner hosts](https://docs.github.com/en/actions/reference/runners/self-hosted-runners#accessible-domains-by-function) plus Copilot-specific upload/API hosts ([customize-the-agent-environment](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/customize-the-agent-environment)).
- **Org/enterprise policy layer for MCP** (distinct from per-repo MCP *tool configuration* in §3): admins can set an **MCP registry URL** and an access policy of **"Allow all"** vs **"Registry only"** at the org or enterprise level ([Configure MCP server access for your organization or enterprise](https://docs.github.com/en/copilot/how-tos/administer-copilot/manage-mcp-usage/configure-mcp-server-access); [mcp-management](https://docs.github.com/en/copilot/concepts/mcp-management)). **Known limitation, documented by GitHub itself**: *"Enforcement is based only on server name/ID matching, which can be bypassed by editing configuration files"* and *"Strict enforcement that prevents installation of non-registry servers is not yet available"* ([MCP allowlist enforcement](https://docs.github.com/en/copilot/reference/mcp-allowlist-enforcement)) — GitHub's own explicit recommendation for the highest security bar today is to **disable MCP servers in Copilot entirely** until strict enforcement ships.
  - Policy resolution precedence when a user has multiple seats: (1) enterprise policy overrides org policy, (2) stricter setting ("Registry only") always wins over "Allow all" regardless of scope, (3) tie-break by most-recently-uploaded registry.

---

## 3. MCP support

**Confidence: high — checked: 2026-07-25**

**Yes**, Copilot cloud agent supports MCP servers, with configuration **specific to and separate from** the CLI/VS Code MCP config surface (though there is a documented interop/import path).

### 3.1 Defaults

Two MCP servers are **enabled by default, with no configuration required**:
- **GitHub MCP server** — scoped to a specially-issued, **read-only-by-default** token limited to the current repo (can be widened with your own PAT, see below).
- **Playwright MCP server** — for generating/running Playwright browser tests.

(Source: [GitHub Blog 2025-07-31](https://github.blog/ai-and-ml/github-copilot/onboarding-your-ai-peer-programmer-setting-up-github-copilot-coding-agent-for-success/); [configure-mcp-servers](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/configure-mcp-servers).)

### 3.2 Where/how it's configured — this modality's distinctive mechanism

Unlike CLI (`~/.copilot/mcp-config.json` or similar) or VS Code (`.vscode/mcp.json`), **the primary configuration surface for Copilot cloud agent's MCP servers is a JSON blob pasted directly into the GitHub.com repository Settings UI**, at **Settings → Copilot → MCP servers** (this settings page is explicitly **shared** between Copilot cloud agent and Copilot code review — configuring it once wires both features; there is a separate toggle to opt code review *out* of using MCP if desired) ([configure-mcp-servers](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/configure-mcp-servers)). A note in the doc source confirms this is a *recent consolidation*: "Existing repository MCP configurations that were previously managed under Copilot cloud agent settings were automatically moved to the new shared MCP settings page. No migration action is required."

**JSON schema** (top-level `mcpServers` object, keyed by server name):

| Key | Required? | Notes |
|---|---|---|
| `type` | required | One of `"local"`, `"stdio"`, `"http"`, or `"sse"` |
| `tools` | **required** | Array of tool names to allow, or `["*"]` for all. GitHub explicitly recommends allowlisting specific read-only tools since **the agent uses MCP tools autonomously with no per-call approval prompt** |
| `command` | required for local | Executable to run the server |
| `args` | required for local | Args array |
| `env` | optional (local) | Map of env-var-name → literal string OR a `$COPILOT_MCP_*`/`${COPILOT_MCP_*}` substitution reference |
| `url` | required for remote | Server URL |
| `headers` | optional (remote) | Map of header-name → literal or `$COPILOT_MCP_*` substitution |

- **Secrets naming convention is mandatory and load-bearing**: any secret/variable referenced from the MCP JSON **must** be named with the prefix `COPILOT_MCP_` and stored as an "Agents secret/variable" (org or repo level) — *"Only Agents secrets and variables with names prefixed with `COPILOT_MCP_` will be available to your MCP configuration."* Supported substitution syntaxes: `$VAR`, `${VAR}`, `${VAR:-default}`.
- **Known limitations, stated explicitly by GitHub**: Copilot cloud agent (and code review) MCP support (a) **only supports MCP tools**, not resources or prompts from the server, and (b) **does not currently support remote MCP servers using OAuth** for auth (only static header/env-based auth).
- **Setup-step dependency**: if an MCP server needs runtime deps not present on the default Actions runner image (GitHub's own example: `uv`, `pipx`), you must install them via `copilot-setup-steps.yml` — tying §2's setup-steps file and MCP config together.
- **Interop with VS Code config**: *"If your team is already using MCP servers for the project in VS Code, the existing `.vscode/mcp.json` file in your project can be used by Copilot to identify MCP servers!"* — however, adapting it for the repo-settings JSON requires manual changes: (1) add a `tools` allowlist per server (not required in `.vscode/mcp.json`), (2) if you used VS Code's `inputs` mechanism, switch to `env` directly, (3) same for `envFile`, (4) update `args` references to `inputs` to instead reference `env` vars.
- **Custom, per-custom-agent MCP servers**: beyond the repo-wide MCP config, individual **custom agent profiles** (see §4) can declare their *own* `mcp-servers` property in YAML frontmatter, scoping specific MCP servers to only that agent persona (see [Custom agents configuration](https://docs.github.com/en/copilot/reference/custom-agents-configuration#mcp-server-configuration-details)).
- **Validation/observability**: to confirm an MCP server started correctly, open the PR's "View session" logs, then the ellipsis menu → Copilot → "Start MCP Servers" step, which lists the tools that successfully registered.
- **Real-world vendor examples documented officially**: Sentry, Notion, Azure (`@azure/mcp`), Cloudflare (remote `sse`), Azure DevOps (with a required `azure/login` OIDC step in `copilot-setup-steps.yml`), Atlassian/Rovo (via `mcp-remote`). All shown with full JSON in the [configure-mcp-servers](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/configure-mcp-servers) doc.
- **Org/enterprise-level MCP governance** is a separate, higher layer described in §2.3 (registry + allow-all/registry-only policy) — that layer constrains *which servers can even be configured*, while the repo-level JSON above configures *how a specific allowed server runs*.

### 3.3 Relationship to `gh-aw` (GitHub Agentic Workflows) — a closely-related but distinct product

Worth flagging explicitly since it surfaced repeatedly during research and could be confused with the coding/cloud agent: **GitHub Agentic Workflows (`gh-aw`)** is a **separate, newer (technical preview as of 2026-02-13) product** — a `gh` CLI extension that compiles Markdown-authored automation workflows into GitHub Actions YAML, and can invoke **any of several AI engines** (Copilot CLI is the default, but also supports Claude, Codex, Gemini) as its execution engine, with its own "Agent Workflow Firewall (AWF)" sandbox, its own `network`/`sandbox` YAML frontmatter fields, and its own "safe outputs" allowlist model (e.g., `assign-to-agent` as a safe-output specifically **hands off to Copilot cloud/coding agent**, and `create-agent-session` creates Copilot cloud-agent sessions) ([github/gh-aw FAQ](https://github.github.com/gh-aw/reference/faq/); [GitHub Changelog 2026-02-13](https://github.blog/changelog/2026-02-13-github-agentic-workflows-are-now-in-technical-preview/); [Safe Outputs reference](https://github.github.com/gh-aw/reference/safe-outputs/)). **In short: gh-aw is an orchestration/authoring layer that can *trigger* Copilot cloud agent as one of its safe-output actions, but is not itself the coding/cloud agent** — do not conflate the two. `gh-aw`'s own default execution engine is Copilot **CLI**, not the cloud/coding agent.

---

## 4. Custom agents/personas

**Confidence: high — checked: 2026-07-25**

**Yes** — this modality has a first-class, well-documented "custom agent" / persona concept, called an **agent profile**.

### 4.1 What it is

An **agent profile** is a Markdown file with YAML frontmatter (max 30,000-character prompt body) that defines: name, description, tool access, MCP server access, and free-text behavioral instructions — conceptually and structurally very close to `.claude/agents/*.md` or Codex's persona concept, but GitHub's version is explicitly **shared across three surfaces**: Copilot cloud agent on GitHub.com, Copilot cloud agent in supported IDEs (VS Code, JetBrains, Eclipse, Xcode), and Copilot CLI ([about-custom-agents](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-custom-agents)).

### 4.2 File locations / scoping levels

| Level | Path | Notes |
|---|---|---|
| Repository | `.github/agents/CUSTOM-AGENT-NAME.md` | Project-specific |
| Organization | `/agents/CUSTOM-AGENT-NAME.md` in the org's `.github` or `.github-private` repo | Available org-wide |
| Enterprise | `/agents/CUSTOM-AGENT-NAME.md` in the `.github-private` repo of an org designated in enterprise settings | Available across the whole enterprise |

Filename (minus `.md`/`.agent.md`) doubles as the dedup key across levels — a repo-level agent with the same filename as an org-level one takes precedence (lowest level wins).

### 4.3 YAML frontmatter schema

Per the authoritative reference ([custom-agents-configuration.md source](https://github.com/github/docs/blob/main/content/copilot/reference/custom-agents-configuration.md), cross-checked against [create-custom-agents](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/create-custom-agents) and VS Code's own [custom-agents doc](https://code.visualstudio.com/docs/agent-customization/custom-agents)):

| Property | Type | Notes |
|---|---|---|
| `name` | string, optional | Display name; defaults to filename |
| `description` | string, **required** | Purpose/capabilities summary |
| `tools` | array | Tool names/aliases, can reference MCP tools as `server-name/tool-name`; omit for "all tools" |
| `mcp-servers` | object | MCP servers scoped **only to this agent** (distinct from repo-wide MCP config in §3) |
| `model` | string | IDE/CLI contexts only per the how-to steps (not usable to pin a model for the GitHub.com cloud-agent surface directly, per step 5 of the how-to: *"If you are creating and using the agent profile in VS Code, JetBrains IDEs, Eclipse, or Xcode, you can also use the `model` property"*) |
| `target` | `"vscode"` \| `"github-copilot"` | Restricts the agent to one environment; unset = both |
| `disable-model-invocation` | boolean | Prevents Copilot from auto-selecting this agent based on task context; must be manually selected. Equivalent to `infer: false`; if both set, `disable-model-invocation` wins |
| `user-invocable` | boolean, default `true` | If `false`, agent can only be invoked programmatically, not manually selected |
| (body) | markdown, max 30,000 chars | The actual behavioral prompt/instructions |

VS Code's own custom-agent doc additionally documents `argument-hint`, `agents` (sub-agent allowlist for nesting), and `handoffs` (suggested next-agent transitions) — **these may be VS Code-surface–specific extensions rather than guaranteed to work identically on the GitHub.com cloud-agent surface**; confidence: medium on cross-surface parity for these three fields specifically.

### 4.4 How you invoke a custom agent for a cloud-agent task

At `github.com/copilot/agents`: pick target repo (+ optionally branch) from the prompt-box dropdown → open the **agent dropdown** in the prompt area → either pick an existing custom agent, or click **"Create an agent"** to scaffold a new `my-agent.agent.md` template directly into `.github/agents/` on your chosen branch ([create-custom-agents](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/create-custom-agents); [use-cloud-agent-on-github](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/use-cloud-agent-on-github); worked example in [Your first custom agent tutorial](https://docs.github.com/en/copilot/tutorials/customization-library/custom-agents/your-first-custom-agent) — a `readme-specialist` agent with `tools: ['read', 'search', 'edit']`). Same dropdown is available when **assigning an issue** — step 5 of `kick-off-a-task` explicitly says you can "assign an agent or a custom agent with specialized behavior and tools" from the same Assignees flow, and this dropdown is also where you'd pick the **third-party agents** (Claude/Codex) discussed in §1.4.

### 4.5 Org/enterprise readiness prerequisites

Org-level custom agents require org admins to have completed a "**Preparing to use custom agents in your organization**" setup step, and similarly for enterprise-level ([create-custom-agents](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/create-custom-agents) links to `manage-for-organization/prepare-for-custom-agents` and the enterprise equivalent) — **confidence: medium** on the exact content of that prep step since it wasn't independently fetched in this research pass; flagged in Open Questions.

---

## 5. Environment/sandbox model

**Confidence: high — checked: 2026-07-25**

### 5.1 Execution substrate

- Runs inside a **container powered by GitHub Actions** — *"Coding agent uses a container running inside GitHub Actions"* ([GitHub Blog 2025-07-31](https://github.blog/ai-and-ml/github-copilot/onboarding-your-ai-peer-programmer-setting-up-github-copilot-coding-agent-for-success/)).
- **Default base OS: Ubuntu Linux** — *"By default, Copilot uses an Ubuntu Linux-based development environment"* ([customize-the-agent-environment](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/customize-the-agent-environment)). No further detail found on the exact base image/tag (e.g. `ubuntu-latest` equivalent, or a bespoke Copilot image) — flagged in Open Questions.
- Each session gets its own **ephemeral development environment** — described as isolated per-task, torn down after ([about-cloud-agent](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent)).
- The agent, once running, performs the standard loop: creates a branch → creates a PR (or, since April 2026, may skip the PR and just work on the branch) → creates its container → reads the issue/prompt → explores the codebase (reads READMEs, greps for related code) → iterates → finalizes and requests review ([GitHub Blog 2025-07-31](https://github.blog/ai-and-ml/github-copilot/onboarding-your-ai-peer-programmer-setting-up-github-copilot-coding-agent-for-success/)).

### 5.2 Time limits

- **Hard cap: 59 minutes per session, "cannot be extended or bypassed."** If exceeded, the session **times out and stops**. Official recommendation for long tasks: break into smaller focused tasks ([about-cloud-agent](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent)).
- You can set a **shorter** timeout via `timeout-minutes` in `copilot-setup-steps.yml` (per §2.1, max value accepted there is also 59).
- **Caveat / possible confusion source**: the related-but-distinct `gh-aw` product's sandbox docs mention a **default 20-minute job timeout** for *its own* agentic-workflow jobs, separately configurable via its own `timeout-minutes` frontmatter field, plus a separate `tools.timeout` (per-tool-call budget, in seconds) for individual bash/MCP calls ([github/gh-aw sandbox reference](https://github.com/github/gh-aw/blob/main/docs/src/content/docs/reference/sandbox.md)) — **this is gh-aw's own workflow-job timeout, not Copilot cloud agent's 59-minute session cap; do not conflate the two numbers.** Confidence: high that these are two separate systems; medium on whether gh-aw's AWF firewall/timeout model is used *internally* by Copilot cloud agent itself vs. being purely gh-aw's own independent implementation — not conclusively established in this research pass (see Open Questions).

### 5.3 Network/firewall

Covered in detail in §2.3; summary restated here for completeness: default-on firewall + recommended allowlist, customizable per-repo (domains or full URLs) and lockable at org/enterprise level, only applies to the agent's own Bash-tool-launched processes (not MCP servers, not setup steps), incompatible with self-hosted/Windows runners.

### 5.4 Available tools

- A `Bash` tool (subject to the firewall).
- File read/edit tools.
- Whatever MCP tools are configured (§3) — GitHub + Playwright by default.
- Ability to run the repo's own test/lint commands (as configured via `copilot-setup-steps.yml` or auto-detected).
- Copilot's own **built-in code-review/security-scan pass** on its generated diff before finalizing (§1.4).

### 5.5 How a repo customizes the environment

Exactly `copilot-setup-steps.yml`, per §2.1 — this is the **only** sanctioned environment-customization surface; there is no separate "Dockerfile for Copilot" or devcontainer-equivalent mechanism documented. (Compare/contrast: this is a notably different model from e.g. a generic "devcontainer.json"-style approach — GitHub deliberately reuses the Actions-workflow mental model instead of inventing a new container-spec format.)

---

## 6. Relationship to CLI/VS Code modalities

**Confidence: high — checked: 2026-07-25**

This is a **partially shared, partially separate** configuration surface — more shared than a naive reading of "cloud agent = totally separate product" would suggest, but with real, documented gaps and modality-specific quirks.

### 6.1 Shared across all three (or more) surfaces

| Config surface | Copilot cloud agent (GitHub.com) | Copilot CLI | VS Code |
|---|---|---|---|
| `.github/copilot-instructions.md` (repo-wide) | ✅ | ✅ | ✅ |
| `.github/instructions/**/*.instructions.md` (path-specific, `applyTo`) | ✅ | ✅ | ✅ |
| Agent-format files: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` | ✅ | ✅ | ✅ (per VS Code's own custom-instructions doc) |
| Org-level instructions | ✅ | ✅ | ✅ |
| Custom agent profiles (`.agent.md` files, `.github/agents/`) | ✅ (via `target: github-copilot` or unset) | ✅ | ✅ (via `target: vscode` or unset) |
| `excludeAgent` frontmatter scoping | Applies to `"cloud-agent"` value per CLI docs | ✅ (documents the mechanism) | Presumed shared (not independently confirmed) |

(Sources: [custom-instructions-support](https://docs.github.com/en/copilot/reference/custom-instructions-support); [custom-agents-configuration.md](https://github.com/github/docs/blob/main/content/copilot/reference/custom-agents-configuration.md); [about-custom-agents](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-custom-agents).)

**Personal/user-level instructions are CLI/VS-Code-only, not applicable to cloud agent**: Copilot CLI supports `$HOME/.copilot/copilot-instructions.md` and `$HOME/.copilot/instructions/**/*.instructions.md` for cross-repo personal preferences ([add-custom-instructions](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-custom-instructions)) — there is **no equivalent "personal instructions that follow you into the cloud agent's ephemeral container"** concept, since the cloud agent's environment has no persistent per-user home directory across sessions. Copilot Chat on GitHub.com does support "👤 Personal instructions" per the support-matrix table, but that is Chat, not the cloud agent specifically.

### 6.2 MCP config: NOT shared by default, but has a documented one-way import path

As detailed in §3.2: cloud agent's MCP config lives in **repo Settings UI JSON**, while VS Code's lives in `.vscode/mcp.json` (a committed file) or user `settings.json`. GitHub explicitly documents a **manual adaptation path** from `.vscode/mcp.json` → the Settings-UI JSON (add `tools` allowlist, replace `inputs`/`envFile` with `env`) — but this is a one-time manual copy-and-transform, **not a live shared file**. Changing `.vscode/mcp.json` does not automatically update what the cloud agent can use, and vice versa.

The **org/enterprise MCP registry + allow/deny policy** layer (§2.3) is genuinely shared/global — it constrains Copilot CLI, JetBrains, VS Code, Eclipse, Visual Studio, and Xcode discovery *and* (per the enforcement matrix in [mcp-management](https://docs.github.com/en/copilot/concepts/mcp-management)) has allowlist-enforcement version gates per surface (e.g. VS Code v1.109.3+, Copilot CLI v1.0.11+) — but notably the matrix's own table appears to show **Copilot cloud agent's own enforcement-version cell as unspecified/blank** in the fetched table (rendering artifact obscured the value) — flagged as an item to re-verify directly (Open Questions).

### 6.3 Firewall/network config: cloud-agent-specific, not applicable to CLI/VS Code

The Actions-appliance-scoped firewall (§2.3, §5.3) is a cloud-agent-only concept — it doesn't exist for the CLI (which runs on the developer's own machine/network) or for VS Code's local agent mode.

### 6.4 `copilot-setup-steps.yml`: cloud-agent-only

This file has **no equivalent or applicability to CLI or VS Code** — it is purely about provisioning the cloud agent's ephemeral GitHub Actions container. CLI and VS Code agent-mode run on the developer's existing local machine/toolchain, which needs no equivalent bootstrap step.

### 6.5 Code review as the connective tissue

**Copilot code review** (a related but technically distinct feature — automated PR review, not task-execution) shares its instruction-file support and MCP-server config with cloud agent (both draw from the same repo Settings MCP JSON and largely the same instruction-file matrix), making it the closest sibling surface, more so than CLI or VS Code.

---

## 7. Hard constraints / gotchas

**Confidence: high — checked: 2026-07-25**

### 7.1 Review/approval gates before merge

- **Copilot cloud agent PRs are always drafts requiring human review/approval before merge** — there's no auto-merge-without-review path implied anywhere in the docs; the standard flow explicitly ends with "requests your review."
- **Copilot code review's own PR reviews are structurally inert for branch-protection purposes**: *"Copilot always leaves a 'Comment' review, not an 'Approve' or 'Request changes' review... Its reviews do not count toward required approvals and will not block merging."* ([copilot-code-review docs](https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/copilot-code-review)). A third-party deep-dive ([postil.dev](https://postil.dev/blog/why-copilot-cant-block-your-merge)) explains the GitHub review-state mechanics precisely: only `APPROVE` counts toward required-approval counts, only `REQUEST_CHANGES` actively blocks; `COMMENT` (Copilot's only possible state) is inert on both axes, **by design**, not as a bug. To actually gate merges on Copilot's findings, teams build **custom automation** that watches the review/check-run and posts a separate required status check — real-world implementations found: [`zyplux/.github/apps/copilot-review-gate`](https://github.com/zyplux/.github/blob/main/apps/copilot-review-gate/README.md) (documents a subtle **race condition**: Copilot's check-run reports `completed`/`success` **1-2 seconds before** its review comments are actually posted, so naively gating on the check-run conclusion alone can let a PR merge in the gap before comments land — the watcher must wait for the actual review submission event, not just the check-run conclusion).
- Note: **third-party agents (Claude/Codex) integrate into this same review flow** — you can `@mention` any of `@copilot`, `@claude`, `@codex` to request changes, and each agent iterates independently.

### 7.2 Cost/quota model

- **Copilot cloud agent consumes two separate budgets simultaneously**: (1) **GitHub Actions minutes** from your account/org's included allowance, and (2) **premium requests / AI credits** from your Copilot license allowance. *"Each cloud agent session, initiated by prompting a task or assigning an issue, consumes one premium request."* If either budget is exhausted and no additional billing is configured, the agent **cannot run** ([Context7-sourced, from `github-copilot-premium-requests` doc](https://docs.github.com/en/copilot/reference/copilot-billing/request-based-billing-legacy/github-copilot-premium-requests)).
- AI-credit consumption additionally varies by **which model is selected** and **token volume processed** ([about-cloud-agent](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent)).
- Third-party agents (Claude/Codex) currently **also** consume "one premium request" per session during their public preview, at no extra subscription cost beyond the existing Copilot plan.
- **Billing change effective 2026-06-01**: Copilot **code review** workflows began also consuming GitHub Actions minutes as of that date (a change specifically flagged on the pricing page, separate from cloud agent's cost model which already worked this way) ([github.com/features/copilot/plans](https://github.com/features/copilot/plans)).
- Org-level: administrators can now enable non-Copilot-licensed users to trigger Copilot code review, billed to the org as **GitHub AI Credits** rather than requiring a seat — gated behind two separate policies that must both be explicitly enabled.

### 7.3 Security model / prompt-injection risk — this is the single most load-bearing "gotcha" finding

Multiple independent, dated security disclosures (checked 2026-07-25) establish that **prompt injection against the coding/cloud agent via issue/PR/comment text is a live, actively-researched, and at-least-partially-exploited attack surface**:

- **GitHub's own docs acknowledge the risk directly** and describe specific mitigations ([risks-and-mitigations](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/risks-and-mitigations)):
  - **Hidden-character/HTML-comment filtering**: *"GitHub filters hidden characters before passing user input to Copilot cloud agent: For example, text entered as an HTML comment in an issue or pull request comment is not passed to Copilot cloud agent."*
  - Work is attributed to whoever *triggered* the agent (accountability trail).
  - You control which tools an automation/agent can use, limiting blast radius.
  - Events from users **without write access** to the repo are **ignored by default** (opt-in only) — an important default-safe posture for public/OSS repos.
  - Chained-automation protection: a PR/issue opened *by* an automation doesn't itself auto-trigger a workflow without a human-with-write-access approval step, breaking a naive injection→auto-trigger→auto-trigger chain.
- **However, independent security researchers have demonstrated bypasses of exactly these mitigations**:
  - **Trail of Bits (2025-08-06)** ([blog post](https://blog.trailofbits.com/2025/08/06/prompt-injection-engineering-for-attackers-exploiting-github-copilot/)): confirms HTML `<!-- -->` comments *are* stripped as GitHub claims, but found that certain other tag pairs (their write-up cites markdown constructs that render as visually blank/invisible, e.g. empty-alt-text image padding tricks) are **not** stripped and remain readable by the LLM while invisible to a human reviewer in the rendered GitHub UI. Demonstrated an end-to-end attack: hidden instructions → Copilot inserts a backdoored dependency URL into a `uv.lock` file (a file humans "rarely review... even more rarely review each URL in") → supply-chain backdoor survives human PR review.
  - **"Comment and Control" research (disclosed 2026-04-15)** by Aonan Guan, Zhengyu Liu, Gavin Zhong — a **cross-vendor** disclosure covering Claude Code Security Review, Gemini CLI Action, **and** GitHub Copilot Agent simultaneously ([oddguan.com writeup](https://oddguan.com/blog/comment-and-control-prompt-injection-credential-theft-claude-code-gemini-cli-github-copilot/); [CSA research note PDF, 2026-04-17](https://labs.cloudsecurityalliance.org/wp-content/uploads/2026/04/CSA_research_note_comment_control_github_prompt_injection_20260417-csa-styled.pdf)). Key finding specific to Copilot: the author states they *"bypassed all"* of GitHub's three defense layers (environment filtering, secret scanning, network firewall) via a **hidden HTML-comment payload combined with an indirect trigger** — i.e., the attacker never directly invokes the agent; a victim maintainer unknowingly assigns a booby-trapped issue to Copilot. Confirmed exfiltration targets across the three affected agents include `GITHUB_TOKEN`, `GITHUB_COPILOT_API_TOKEN`, `GITHUB_PERSONAL_ACCESS_TOKEN`, among others (note: this claims the mitigation described by GitHub's own docs — HTML comment stripping — was *itself* bypassed, which is a **direct contradiction** worth flagging prominently; possibly explained by a stripping-then-patched timeline, or by the researchers finding an edge case in the stripping logic; **confidence: medium** on the precise mechanism since the full PDF wasn't fully parsed, high confidence that credible researchers claim a successful bypass occurred).
  - **Orca Security "RoguePilot"** ([blog](https://orca.security/resources/blog/roguepilot-github-copilot-vulnerability/)) — a related but distinct vector via **Codespaces** (not the cloud agent specifically): a crafted issue + a checked-out PR containing a symlink + a remote-fetched JSON `$schema` chain, leading to `GITHUB_TOKEN` exfiltration and "full repository takeover." This is Codespaces-agent-mode, adjacent to but not identical to the async cloud-agent flow — flagged for precision.
- **Practical implication for anyone deploying this modality**: treat the "hidden-content filtering" defense as a **partial, bypassable mitigation, not a guarantee** — require human review of all cloud-agent-authored PRs (already true by default per §7.1, but doubly important given this research), and be specifically suspicious of PRs that touch lockfiles, CI config, or `copilot-setup-steps.yml` itself.

### 7.4 Other hard constraints

- **GitHub-hosted repos only** — no cross-platform/self-hosted-git support (§1.4).
- **59-minute hard session cap**, non-negotiable (§5.2).
- The **coding-agent → cloud-agent rename is actively in-flight** as of the check date: expect **inconsistent terminology** across docs pages, blog posts, third-party tutorials, and even GitHub's own API field names (`used_copilot_coding_agent` vs `used_copilot_cloud_agent`, the former retained for backward compat only **until 2026-08-01** — i.e., **about a week after this research was compiled**, this legacy field name may be actively deprecated). Any downstream documentation/tooling referencing "coding agent" terminology should be updated with this in mind.
- `gh agent-task create` (the CLI trigger) **cannot currently be driven by a plain `GITHUB_TOKEN`/PAT in CI** — requires an OAuth-flow token; an open, unresolved CLI issue tracks this as a known automation gap (§1.2).
- MCP tools run **fully autonomously with no per-call human approval** once configured — explicit GitHub warning: *"Once you've configured an MCP server, Copilot will be able to use the tools provided by the server autonomously, and will not ask for your approval before using them."* This elevates the importance of tight `tools: [...]` allowlisting (never blanket `["*"]` for anything with write/destructive capability).
- MCP org-policy enforcement is **known-bypassable today** by editing config files directly (§2.3) — not a robust security boundary yet, per GitHub's own docs.

---

## Open questions / could not verify

1. **Precise base container image** for the cloud agent's Ubuntu environment — is it a bespoke GitHub-maintained image, or effectively `ubuntu-latest` (i.e., the standard GitHub-hosted Actions runner image)? Docs only say "Ubuntu Linux-based," no image name/tag/Dockerfile reference found.
2. **Exact relationship between gh-aw's "Agent Workflow Firewall (AWF)"** and the firewall Copilot cloud agent itself uses — are these literally the same underlying implementation (gh-aw reusing Copilot's firewall tech) or two independently-built systems that happen to share a similar design (domain-allowlist egress control)? The gh-aw docs describe AWF as "the coding agent sandbox," which is suggestive of a shared lineage, but this was not conclusively confirmed against an authoritative single source.
3. **`excludeAgent` frontmatter key** — full list of valid values and exact matching semantics against "cloud-agent" as one of them; the source excerpt fetched was truncated mid-list. Needs a direct fetch of the live `add-custom-instructions` doc page (not just the search-snippet) to confirm precisely.
4. **MCP allowlist-enforcement version-gate for the "Copilot cloud agent" row specifically** in the `mcp-management` support matrix — the fetched table rendering left this cell ambiguous/blank; unclear whether that means "not yet enforced for this surface" or a rendering artifact.
5. **Exact content of the "Preparing to use custom agents in your organization/enterprise" prerequisite docs** (§4.5) — linked but not independently fetched; unclear if there are non-obvious gotchas (e.g., a specific `.github-private` repo naming/creation requirement) beyond what's summarized.
6. **Whether the "Comment and Control" (2026-04-15) disclosure's claimed bypass of GitHub's HTML-comment-stripping mitigation** represents (a) a since-patched gap, (b) a distinct payload-encoding technique that evades the stripping logic specifically (as opposed to disproving it outright), or (c) a mischaracterization in secondary reporting of GitHub's mitigation scope. The primary CSA PDF was fetched but not fully parsed line-by-line; recommend a follow-up direct read of the full PDF plus a check of any GitHub Security Lab / GHSA advisory response to this disclosure.
7. **Exact wording/scope of the official "Copilot Max" plan** mentioned once on the pricing page (`$100/month in GitHub AI Credits`, "sustained agent-driven workflows") — appears to be a newer/possibly still-rolling-out tier as of 2026-07-25; not cross-verified against a second independent source, and not clear if it changes coding/cloud-agent-specific quotas versus general Copilot usage.
8. **Whether "third-party coding agents" (Claude, Codex) can use `copilot-setup-steps.yml` and the repo's MCP-server JSON config identically to Copilot's own cloud agent**, or whether they have their own separate environment-provisioning and MCP-scoping mechanisms. Docs describe them as using "the same repositories that Copilot cloud agent has been enabled in" and the same Assignees/mention triggers, which is suggestive of a shared environment/config model, but this was not explicitly confirmed for the setup-steps file or MCP JSON specifically.
9. **The original task prompt's "`copilot-swe-agent`" as a distinct invocation mechanism** — research strongly suggests this term refers only to the agent's legacy bot/commit-author identity, not a separate trigger surface or config file; flagged as a likely misconception in the original brief rather than a gap in this research, but noted for completeness since it was explicitly named in the requirements.

---

## Sources

### Official GitHub documentation
- https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/customize-the-agent-environment
- https://docs.github.com/copilot/how-tos/use-copilot-agents/coding-agent/customize-the-agent-environment
- https://docs.github.com/en/enterprise-cloud@latest/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/customize-the-agent-environment
- https://docs.github.com/en/enterprise-cloud@latest/copilot/tutorials/cloud-agent/improve-a-project
- https://docs.github.com/en/copilot/tutorials/cloud-agent/give-access-to-resources
- https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/configure-mcp-servers
- https://github.com/github/docs/blob/main/content/copilot/how-tos/copilot-on-github/customize-copilot/configure-mcp-servers.md
- https://docs.github.com/en/copilot/concepts/context/mcp
- https://docs.github.com/en/copilot/concepts/agents/cloud-agent/mcp-and-cloud-agent
- https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/kick-off-a-task
- https://docs.github.com/en/enterprise-cloud@latest/copilot/how-tos/use-copilot-agents/cloud-agent/troubleshoot-cloud-agent
- https://github.com/features/copilot/plans
- https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-the-firewall
- https://docs.github.com/en/copilot/reference/copilot-allowlist-reference
- https://github.com/github/docs/blob/main/content/copilot/how-tos/use-copilot-agents/coding-agent/customize-the-agent-firewall.md
- https://github.com/github/docs/blob/main/content/copilot/how-tos/use-copilot-agents/cloud-agent/customize-the-agent-firewall.md
- https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/create-custom-agents
- https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/create-custom-agents-in-your-ide
- https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-custom-agents
- https://github.com/github/docs/blob/main/content/copilot/reference/custom-agents-configuration.md
- https://docs.github.com/en/copilot/tutorials/customization-library/custom-agents/your-first-custom-agent
- https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/use-cloud-agent-on-github
- https://docs.github.com/en/enterprise-cloud@latest/copilot/concepts/agents/cloud-agent/about-custom-agents
- https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent
- https://docs.github.com/en/copilot/concepts/agents/cloud-agent/risks-and-mitigations
- https://docs.github.com/en/copilot/reference/custom-instructions-support
- https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-custom-instructions
- https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/copilot-code-review
- https://docs.github.com/copilot/using-github-copilot/code-review/using-copilot-code-review
- https://docs.github.com/en/copilot/concepts/agents/code-review
- https://docs.github.com/en/copilot/how-tos/use-copilot-agents/request-a-code-review/use-code-review
- https://docs.github.com/en/copilot/reference/copilot-billing/request-based-billing-legacy/github-copilot-premium-requests
- https://docs.github.com/en/copilot/tutorials/cloud-agent/pilot-cloud-agent
- https://docs.github.com/en/copilot/tutorials/cloud-agent/get-the-best-results
- https://docs.github.com/en/copilot/how-tos/administer-copilot/manage-mcp-usage/configure-mcp-server-access
- https://docs.github.com/en/copilot/concepts/mcp-management
- https://docs.github.com/en/copilot/concepts/policies
- https://docs.github.com/en/copilot/reference/mcp-allowlist-enforcement
- https://docs.github.com/en/copilot/how-tos/administer-copilot/manage-for-organization/manage-policies
- https://docs.github.com/en/copilot/concepts/agents/about-third-party-coding-agents
- https://github.com/github/docs/blob/main/content/copilot/reference/copilot-usage-metrics/copilot-usage-metrics.md

### GitHub changelog / blog
- https://github.blog/ai-and-ml/github-copilot/onboarding-your-ai-peer-programmer-setting-up-github-copilot-coding-agent-for-success/
- https://github.blog/ai-and-ml/github-copilot/assigning-and-completing-issues-with-coding-agent-in-github-copilot/
- https://github.blog/news-insights/product-news/from-pair-to-peer-programmer-our-vision-for-agentic-workflows-in-github-copilot/
- https://github.blog/changelog/2025-07-15-configure-internet-access-for-copilot-coding-agent/
- https://github.blog/changelog/2025-09-25-kick-off-and-track-copilot-coding-agent-sessions-from-the-github-cli/
- https://github.blog/changelog/2025-12-03-assign-issues-to-copilot-using-the-api/
- https://github.blog/changelog/2026-02-04-claude-and-codex-are-now-available-in-public-preview-on-github/
- https://github.blog/changelog/2026-02-13-github-agentic-workflows-are-now-in-technical-preview/
- https://github.blog/changelog/2026-04-01-research-plan-and-code-with-copilot-cloud-agent/
- https://github.blog/changelog/2026-04-10-copilot-usage-metrics-now-aggregate-copilot-cloud-agent-active-user-counts/
- https://github.blog/changelog/2026-04-14-model-selection-for-claude-and-codex-agents-on-github-com/
- https://github.blog/changelog/2026-04-23-copilot-cloud-agent-fields-added-to-usage-metrics/
- https://github.com/github/docs/commit/0ec7a69530a490750c64b163b6cdfc9fb35d1e9b

### GitHub Agentic Workflows (gh-aw) — related but distinct product
- https://github.github.com/gh-aw/reference/faq/
- https://github.github.com/gh-aw/reference/safe-outputs/
- https://github.com/github/gh-aw/blob/main/docs/src/content/docs/reference/sandbox.md
- https://github.com/github/gh-aw/issues/2728
- https://github.com/github/gh-aw/pull/1972
- https://github.com/github/gh-aw/pull/2763
- https://github.com/github/gh-aw/pull/2028
- https://github.com/github/gh-aw/pull/34026

### Real-world code examples (GitHub code search)
- https://github.com/microsoft/playwright/blob/3827650d171cc1b035cbefb7e00bf5948d6809df/packages/playwright/src/agents/copilot-setup-steps.yml
- https://github.com/github/copilot-sdk/blob/f2e846929ce61a509c6e8841a0feacb2dd1bec96/.github/workflows/copilot-setup-steps.yml
- https://github.com/microsoft/hve-core/blob/main/.github/workflows/copilot-setup-steps.yml
- https://github.com/github/awesome-copilot/blob/8395dce14cce763504aab2197effcc62c730a0f6/skills/github-copilot-starter/SKILL.md
- https://github.com/nicsuzor/academicOps/blob/48ed4f26e6de13376774bbafcb95e9138721afae/templates/github-agent/copilot-setup-steps.yml.template
- https://github.com/xavierxmorris/ghcp-demo-06-coding-agent-and-review
- https://github.com/zyplux/.github/blob/main/apps/copilot-review-gate/README.md
- https://github.com/yonatangross/orchestkit/blob/main/plugins/ork/skills/github-operations/SKILL.md
- https://github.com/cli/cli/issues/11845

### VS Code documentation (relationship/comparison context)
- https://code.visualstudio.com/docs/agent-customization/custom-agents
- https://code.visualstudio.com/docs/agent-customization/custom-instructions
- https://code.visualstudio.com/docs/agent-customization/overview
- https://github.com/microsoft/vscode-docs/blob/main/docs/copilot/customization/custom-instructions.md
- https://github.com/microsoft/vscode-docs/blob/main/docs/copilot/agents/third-party-agents.md

### Third-party writeups / case studies
- https://pinklime.io/blog/github-copilot-agent-mode-2026
- https://postil.dev/blog/why-copilot-cant-block-your-merge
- https://tessl.io/blog/github-brings-claude-and-codex-agents-directly-into-copilot/
- https://zenn.dev/korosuke613/scraps/0f119dc92d9d83
- https://stackoverflow.com/questions/79791527/assigning-github-issue-to-copilot-fails-using-graphql

### Security research (prompt injection / risks)
- https://oddguan.com/blog/comment-and-control-prompt-injection-credential-theft-claude-code-gemini-cli-github-copilot/
- https://orca.security/resources/blog/roguepilot-github-copilot-vulnerability/
- https://labs.cloudsecurityalliance.org/wp-content/uploads/2026/04/CSA_research_note_comment_control_github_prompt_injection_20260417-csa-styled.pdf
- https://blog.trailofbits.com/2025/08/06/prompt-injection-engineering-for-attackers-exploiting-github-copilot/

### Context7 (secondary cross-verification source)
- Library ID `/websites/github_en_copilot` (10,889 code snippets, High source reputation, benchmark score 74.19) — queried directly for billing/quota and MCP-configuration cross-verification.

### Local repository context (gap analysis)
- `/Users/derp/.agents/docs/reference/kitchen-sink-plugins-compare-contrast.md` — confirmed as covering Copilot **CLI** only; contains no coverage of this modality, which this document now fills.
