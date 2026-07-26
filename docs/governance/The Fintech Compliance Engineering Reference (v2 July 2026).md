# The Fintech Compliance Engineering Reference (v2, July 2026)
### An annotated, deep-dive reference for a senior .NET engineer ramping into banking/fintech on Azure

This is a working reference that expands and formalizes the earlier primer. It covers the US/global regulatory frameworks, banking payment protocols, and — in depth — least-privilege access implementation on Azure/Microsoft for a regulated bank. Every framework, standard, protocol, and technology links inline to its primary/authoritative source. Sections: (1) Regulatory Frameworks, (2) Banking Protocols, (3) Least-Privilege on Azure, (4) Glossary, (5) Appendix, (6) References & Further Reading.

> **How to use this:** Sections 1–2 are your "what the regulators require" map; Section 3 is your day-to-day engineering playbook on Azure; the Glossary and Appendix are quick-lookup. Where a rule is contested or evolving (e.g., Regulation II litigation, CTA/BOI reporting), that's flagged explicitly — don't treat those as settled.

---

## 1. Regulatory & Compliance Frameworks

### 1.1 PCI DSS 4.0.1
The [PCI Security Standards Council (PCI SSC)](https://www.pcisecuritystandards.org/) publishes the Payment Card Industry Data Security Standard. **v4.0.1 was published June 2024 and became the sole supported version after v4.0 retired December 31, 2024.** v4.0.1 introduced *no* new requirements — it corrects formatting/typographical errors and clarifies intent. All future-dated requirements from v4.0 became mandatory **March 31, 2025**. Primary documents (the standard, ROC/AOC templates, SAQs, Summary of Changes, Prioritized Approach) live in the [PCI SSC Document Library](https://www.pcisecuritystandards.org/document_library/).

The twelve requirements group into six control objectives. The two most relevant to an access-control engineer:
- **Requirement 7** — Restrict access to system components and cardholder data by business need-to-know.
- **Requirement 8** — Identify users and authenticate access to system components.

A v4.0.1-specific clarification worth knowing: **MFA for non-administrative access into the CDE does not apply to user accounts authenticated *only* with phishing-resistant authentication factors.** Also clarified: patch/update requirement within 30 days applies to *critical* vulnerabilities only (reverting to v3.2.1 language).

### 1.2 SOC 2 (AICPA Trust Services Criteria)
[SOC 2](https://www.aicpa-cima.com/topic/audit-assurance/audit-and-assurance-greater-than-soc-2) is an attestation report against the [AICPA](https://www.aicpa-cima.com/) **Trust Services Criteria (TSC)**. The **2017 TSC remain the governing criteria**, with *Revised Points of Focus* issued in Fall 2022 (the criteria themselves were unchanged; only illustrative points of focus were updated). Security — the **Common Criteria, CC1–CC9** — is mandatory in every SOC 2; Availability, Processing Integrity, Confidentiality, and Privacy are optional and chosen based on customer commitments.
- CC1–CC5 map to the **COSO** internal-control framework.
- **CC6 (Logical and Physical Access Controls)** is where auditors report the most exceptions (missing MFA, terminated employees retaining access, shared credentials). CC6.1 = logical access security software/architecture; CC6.2 = registration/authorization and deprovisioning; **CC6.3 = authorize/modify/remove access "giving consideration to the concepts of least privilege and segregation of duties."**

Points of focus are illustrative, not a checklist — you and your auditor design the actual controls that meet each criterion.

### 1.3 GLBA Safeguards Rule
The [Gramm-Leach-Bliley Act](https://www.ftc.gov/business-guidance/privacy-security/gramm-leach-bliley-act) Safeguards Rule ([16 CFR Part 314](https://www.ftc.gov/legal-library/browse/rules/safeguards-rule)) is enforced by the [FTC](https://www.ftc.gov/) for non-banking financial institutions (fintechs, mortgage brokers, and others under FTC jurisdiction). The strengthened rule (full compliance **June 9, 2023**) requires:
- A **written information security program** led by a named **"Qualified Individual."**
- **Encryption** of customer information in transit and at rest.
- **MFA**.
- **Testing**: continuous monitoring, or annual penetration testing plus vulnerability assessments at least every six months.
- **Board reporting** and an incident response plan.

A 2023 amendment (breach-notification requirement effective **May 2024**) requires reporting a **notification event** — unauthorized acquisition of unencrypted customer information involving **at least 500 consumers** — to the FTC **within 30 days**. The revised rule closely mirrors the NYDFS Cybersecurity Regulation. (Banks proper are supervised under the interagency version of the rule rather than the FTC's, but the FTC rule is the fintech-relevant one.)

### 1.4 FFIEC IT Examination Handbook
The [FFIEC IT Examination Handbook InfoBase](https://ithandbook.ffiec.gov/) is the interagency examination guidance used by bank examiners. It comprises booklets — the [full list](https://ithandbook.ffiec.gov/it-booklets) is the primary reference — including [Information Security](https://ithandbook.ffiec.gov/it-booklets/information-security), [Management](https://ithandbook.ffiec.gov/it-booklets/management), Architecture Infrastructure & Operations, Business Continuity Management, Audit, Outsourcing Technology Services, Retail/Wholesale Payment Systems, and the renamed **Development, Acquisition, and Maintenance (DA&M)** booklet (revised **August 29, 2024**). Recent revisions follow a principles-based approach and reference NIST authoritative sources. The FFIEC has moved to an architecture allowing more frequent, as-needed updates (watch the [What's New](https://ithandbook.ffiec.gov/whats-new) page).

### 1.5 SOX / ITGC
The Sarbanes-Oxley Act established the [PCAOB](https://pcaobus.org/). **Section 404** requires management to assess Internal Control over Financial Reporting (ICFR), structured on the **COSO 2013** framework (five components: control environment, risk assessment, control activities, information & communication, monitoring). **IT General Controls (ITGCs)** are the technology foundation, in three domains:
- **Access management** — provisioning/deprovisioning, periodic access reviews, privileged-access governance, segregation of duties.
- **Change management** — dev/test/prod separation, formal approvals, documented handling of emergency changes.
- **IT operations** — backups, job scheduling, monitoring.

PCAOB's **[AS 2201](https://pcaobus.org/oversight/standards/auditing-standards/details/AS2201)** governs the integrated audit and permits **benchmarking** of fully automated application controls: if ITGCs over the underlying system (especially change management and access) are effective and control logic hasn't changed, auditors can rely on prior-year testing without re-testing. When ITGCs are weak, auditors conclude that dependent application controls are unreliable. A recent PCAOB report found nearly **39% of audits flagged for control or evidence deficiencies**, keeping ITGC testing under scrutiny.

### 1.6 GDPR / CCPA / CPRA
The [GDPR](https://gdpr-info.eu/) (EU) governs personal data of EU data subjects: lawful basis, data-subject rights, Data Processing Agreements (DPAs), and 72-hour breach notification. The [CCPA](https://oag.ca.gov/privacy/ccpa) as amended by CPRA (California) is enforced by the [California Privacy Protection Agency](https://cppa.ca.gov/). For a US bank, GLBA-covered data is generally exempt from CCPA, but marketing/website/employee data may not be — scope carefully.

### 1.7 US Financial-Crime Compliance (BSA / AML / OFAC / KYC)
The [Bank Secrecy Act (BSA)](https://www.fincen.gov/resources/statutes-and-regulations/bank-secrecy-act) — **31 U.S.C. 5311 et seq.**, implementing regulations at **31 CFR Chapter X** — is the foundational US AML statute (enacted 1970), administered by [FinCEN](https://www.fincen.gov/), a Treasury bureau. Per FinCEN, "the BSA authorizes the Department of the Treasury to impose reporting and other requirements on financial institutions and other businesses to help detect and prevent money laundering." Key obligations:

- **CTR (Currency Transaction Report)** — for cash/currency transactions **exceeding $10,000** (daily aggregate). Statutory basis 31 U.S.C. 5313; regulatory cite **31 CFR 1010.311**.
- **SAR (Suspicious Activity Report)** — filed when an institution "knows, suspects, or has reason to suspect" a transaction involves illegal activity or evasion; generally a **$5,000 aggregate** threshold for banks (**31 CFR 1020.320**). See the [FinCEN SAR FAQ](https://www.fincen.gov/resources/frequently-asked-questions-regarding-fincen-suspicious-activity-report-sar). On **October 9, 2025**, FinCEN and the federal banking agencies (FRB, FDIC, NCUA, OCC) jointly issued four FAQs *clarifying* SAR obligations to reduce unnecessary filings — confirming, e.g., that transactions near the $10,000 CTR threshold do not by themselves require a SAR, and that there is no mandatory post-SAR review cadence. These clarify existing obligations rather than create new ones.
- **OFAC (Office of Foreign Assets Control)** — [ofac.treasury.gov](https://ofac.treasury.gov/) administers and enforces economic/trade sanctions and publishes the **SDN (Specially Designated Nationals and Blocked Persons) List**, a blocking list. Institutions must screen customers/transactions against the SDN List and the Non-SDN Consolidated Sanctions List using the [Sanctions List Search tool](https://sanctionssearch.ofac.treas.gov/). US persons are generally prohibited from transacting with SDNs, and blocked persons' property under US jurisdiction is frozen.
- **CIP / KYC** — **USA PATRIOT Act Section 326** requires every bank to adopt a **Customer Identification Program** (**31 CFR 1020.220**). The **CDD (Customer Due Diligence) Beneficial Ownership Rule** (**31 CFR 1010.230**) requires banks to identify and verify beneficial owners of legal-entity customers — the **25%-or-more ownership prong** plus one **control-prong** individual. Guidance lives in the [FFIEC BSA/AML Examination Manual](https://bsaaml.ffiec.gov/) (see the [CIP](https://bsaaml.ffiec.gov/manual/AssessingComplianceWithBSARegulatoryRequirements/01) and [Beneficial Ownership](https://bsaaml.ffiec.gov/manual/AssessingComplianceWithBSARegulatoryRequirements/03) sections).
- **CTA / BOI reporting — evolving, flag this.** The Corporate Transparency Act Beneficial Ownership Information reporting rule was **significantly narrowed by a FinCEN interim final rule published March 26, 2025**, which "exempted all entities created in the United States — including those previously known as 'domestic reporting companies' — and their beneficial owners" from BOI reporting; only **foreign** reporting companies must still file, and they need not report US-person owners. Live authoritative source: [FinCEN BOI](https://www.fincen.gov/boi). **This CTA/BOI reporting change is separate from the bank-facing CDD Beneficial Ownership Rule (31 CFR 1010.230), which remains fully in effect.** Because administrative policy here could still shift (an Eleventh Circuit ruling in December 2025 upheld the CTA's constitutionality without restoring domestic reporting; FinCEN has signaled a final rule), re-check the FinCEN BOI page before relying on it.

---

## 2. Banking Payment Protocols

### 2.1 ISO 20022
[ISO 20022](https://www.iso20022.org/) is the global financial-messaging standard, first published in 2004 — **a catalog of over 800 message definitions** (per Oracle's ISO 20022 processing documentation) grouped by business area, not a single message format. Payment-relevant families:
- **pain** — *Payment Initiation* (customer↔bank): **pain.001** Customer Credit Transfer Initiation, **pain.002** Customer Payment Status Report, **pain.008** Customer Direct Debit Initiation, pain.013/pain.014 request-for-payment.
- **pacs** — *Payments Clearing and Settlement* (FI↔FI): **pacs.008** FI-to-FI Customer Credit Transfer (the MT103 successor), **pacs.009** (MT202/202COV successor), **pacs.002** status, pacs.004 payment return.
- **camt** — *Cash Management / reporting*: **camt.052** intraday report, **camt.053** end-of-day statement, **camt.054** debit/credit notification, camt.056 recall request, camt.029 resolution.

Naming convention: `businessarea.NNN.VVV.vv` (e.g., pain.001.001.09). The [ISO 20022 message definitions registry](https://www.iso20022.org/iso-20022-message-definitions) is authoritative. Note that receiving a `pacs.002` with status `ACSC` (Accepted Settlement Completed) confirms funds have *settled*, not necessarily that they've been *credited* to the beneficiary. For .NET shops, the [pyiso20022](https://pypi.org/project/pyiso20022/) library is a useful reference implementation of message structure even though it's Python.

### 2.2 SWIFT MT→MX Migration
[SWIFT's](https://www.swift.com/standards/iso-20022) **CBPR+ (Cross-Border Payments and Reporting Plus)** coexistence period **ended November 22, 2025.** As of that date, cross-border payment instruction MT messages (MT103, MT202) no longer meet CBPR+ requirements and are replaced by their ISO 20022 MX equivalents exchanged over the **FINplus** service. Coexistence had begun March 2023; the Swift Board reconfirmed the November 2025 deadline in March 2024. A **hybrid postal-address format** (structured Town Name + Country Code minimum) was introduced at the cutover; **fully unstructured postal addresses are decommissioned in November 2026.** Short-term contingency translation exists but is chargeable and not a long-term solution. Domestically, **US Fedwire went live on ISO 20022 on July 14, 2025.**

### 2.3 ACH / NACHA
[NACHA](https://www.nacha.org/) governs the US ACH network through the [Operating Rules](https://www.nacha.org/rules). Roles: **Originator**, **ODFI** (Originating Depository Financial Institution), **RDFI** (Receiving DFI), plus Third-Party Service Providers (TPSPs) and Third-Party Senders (TPSs). **SEC (Standard Entry Class) codes** classify entries — PPD (consumer), CCD (corporate), WEB (internet-authorized), TEL (telephone), ARC/BOC/POP (check conversion).

The headline **2026 change is the [risk-management / fraud-monitoring rule](https://www.nacha.org/news/breaking-down-nachas-new-risk-management-rules-odfis-and-rdfis)**, requiring risk-based processes to identify entries initiated due to fraud:
- **Phase 1 — March 20, 2026:** all ODFIs; Originators/TPSPs/TPSs with **≥6 million** 2023 origination volume; RDFIs with **≥10 million** 2023 receipt volume (credit monitoring).
- **Phase 2 — June 22, 2026** (June 19 is a federal holiday): all remaining non-consumer participants regardless of volume.

Notably, this is the **first time RDFIs have an affirmative monitoring role** alongside ODFIs. Related updates: standardized Company Entry Descriptions, R17 clarifications, and a new **R90 return code for sanctions-compliance returns effective March 2028** (two-banking-day return window). Same Day ACH per-entry limit is $1 million.

### 2.4 FedNow / RTP
The US runs **two non-interoperable instant-payment rails, both on ISO 20022**:
- **[RTP](https://www.theclearinghouse.org/payment-systems/rtp)** — The Clearing House, launched 2017; **per-transaction limit raised to $10 million in February 2025.** Per The Clearing House (Jan. 8, 2025), "more than $246 billion moved over the RTP® network in 2024, up 94% from 2023, while transaction volume jumped 38% to 343 million." The network **reaches 70% of US demand deposit accounts** through more than 850 connected financial institutions (TCH, Feb. 3, 2025). TCH's Chief Product Officer Margaret Weichert has noted "42% of transactions taking place overnight, on weekends, or holidays," underscoring the 24/7 value.
- **[FedNow](https://www.federalreserve.gov/paymentsystems/fednow_about.htm)** — Federal Reserve, launched July 2023; default credit-transfer limit **$100,000**, raisable to **$500,000** for participating banks. **FedNow topped 1,600 participating financial institutions** by January 2026 (per Digital Transactions), up from ~1,100 at end-2024, with volume up sharply year over year.

Because the networks aren't interoperable and reach different banks, whether you can pay a given counterparty instantly depends on the receiver's bank; a majority of enabled institutions now connect to both. Instant payments are **final/irrevocable** — verify the account before sending, as push-payment fraud is a top attack vector (this is exactly what the NACHA 2026 rules target on the ACH side).

### 2.5 Card Network Tokenization
[EMVCo](https://www.emvco.com/) (owned by Amex, Discover, JCB, Mastercard, UnionPay, Visa) publishes the [**EMV Payment Tokenisation Specification – Technical Framework**](https://www.emvco.com/emv-technologies/payment-tokenisation/) (Technical Framework v2.3.1; first published 2014). Tokenization replaces the **PAN** with a non-reversible surrogate. Three flavors:
- **Vault tokens** — processor/gateway-issued, processor-scoped.
- **Network tokens** — issued by [Visa Token Service (VTS)](https://developer.visa.com/capabilities/vts) and [Mastercard Digital Enablement Service (MDES)](https://developer.mastercard.com/product/mastercard-digital-enablement-service-mdes/) (plus Amex/Discover equivalents); accepted directly by issuers, yield **10–20% higher authorization rates** on recurring transactions, and auto-update when a card is reissued.
- **EMV payment tokens** — the standardized network-token format behind Apple Pay, Google Pay, Samsung Pay, and Click to Pay.

A network token is a 16–19 digit number in a reserved token BIN range accompanied by a **token cryptogram** (Visa's **TAVV** — Token Authentication Verification Value; Mastercard authentication carried via **UCAF**), a token expiry, and a **token requestor ID**. Domain control restricts where a token can be used (merchant/device/channel). Submitting a valid TAVV can satisfy Strong Customer Authentication (SCA) under PSD2.

Debit interchange is governed by **[Regulation II](https://www.federalreserve.gov/paymentsystems/regii-about.htm)** ([12 CFR Part 235](https://www.ecfr.gov/current/title-12/chapter-II/subchapter-A/part-235), implementing the Durbin Amendment): the cap for a covered issuer is **21¢ base + 0.05% ad valorem + 1¢ fraud-prevention adjustment.** **Flag this:** a North Dakota federal district court **vacated** the interchange-fee standard in August 2025 (holding the Fed improperly included certain costs), but **stayed its own ruling pending appeal**, so the existing cap remains operative for now. A 2023 Fed proposal to lower the base component to 14.4¢ is not finalized.

---

## 3. Least-Privilege Access on Azure/Microsoft for a Regulated Bank

This is the operational heart of your job. The objective: **eliminate standing privilege, enforce just-in-time and least-privilege, and generate audit evidence that maps cleanly to PCI DSS Req 7/8, SOC 2 CC6, and SOX ITGC access controls.** Microsoft frames all of this under [Zero Trust](https://learn.microsoft.com/en-us/security/zero-trust/): *verify explicitly, use least-privilege access, assume breach.*

### 3.1 Identity foundation — Entra ID, RBAC, ABAC
[Microsoft Entra ID](https://learn.microsoft.com/en-us/entra/fundamentals/whatis) (formerly Azure AD) is the identity provider. Principles:
- Use [Azure RBAC](https://learn.microsoft.com/en-us/azure/role-based-access-control/overview) with [built-in roles](https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles) scoped as **narrowly as possible** (resource / resource group, not subscription or management group). Avoid Owner; prefer specific data-plane roles.
- Add [**ABAC** role-assignment conditions](https://learn.microsoft.com/en-us/azure/role-based-access-control/conditions-overview) to constrain further (e.g., grant blob access only where a resource tag matches). ABAC lets you reduce the *number* of role assignments while tightening scope.
- Prefer [**managed identities**](https://learn.microsoft.com/en-us/entra/identity/managed-identities-azure-resources/overview) for workloads over any stored secret.

### 3.2 Privileged Identity Management (PIM)
[Entra PIM](https://learn.microsoft.com/en-us/entra/id-governance/privileged-identity-management/pim-configure) delivers **time-bound, approval-based, just-in-time (JIT) role activation**, replacing standing admin access. Requires **Entra ID P2 or Entra ID Governance** licensing. Follow the [deployment plan](https://learn.microsoft.com/en-us/entra/id-governance/privileged-identity-management/pim-deployment-plan). Concrete configuration for a regulated shop:
- Make privileged roles **Eligible**, not **Active** — activation is JIT.
- **Require MFA on activation** and **require justification**.
- **Require approval** for the highest-tier roles (Global Administrator, Privileged Role Administrator, and any role touching the CDE or financial-reporting systems).
- Set **short activation windows** (1–4 hours).
- Use **PIM for Groups** to extend JIT to resources that aren't native Entra/Azure roles — Key Vault, Intune, Azure Information Protection, and app roles.
- Only Privileged Role Administrator / Global Administrator can manage assignments; **review the [PIM audit logs](https://learn.microsoft.com/en-us/entra/id-governance/privileged-identity-management/pim-how-to-use-audit-log)** regularly for anomalous activation patterns.

PIM is the single most impactful control for the "no standing privileged access" expectation in **SOX ITGC** and **PCI Req 7**.

### 3.3 Conditional Access design for regulated environments
[Conditional Access (CA)](https://learn.microsoft.com/en-us/entra/identity/conditional-access/overview) is the signal-based policy engine. A regulated baseline:
- **Require phishing-resistant MFA** ([Authentication Strengths](https://learn.microsoft.com/en-us/entra/identity/authentication/concept-authentication-strengths) — FIDO2/passkey or certificate-based) for all administrators and for any privileged action.
- **Require compliant or Hybrid Entra-joined devices** for access to CDE-adjacent apps.
- **Block legacy authentication** (a top exception source in SOC 2 CC6).
- Constrain by **named locations** / trusted IP ranges.
- Validate every policy with the [**What If** tool](https://learn.microsoft.com/en-us/entra/identity/conditional-access/what-if-tool) before rollout, and stage via report-only mode.

Manage CA as code — the community [Maester](https://maester.dev/) test framework and [DCToolbox](https://github.com/DanielChronlund/DCToolbox) can validate that CA policies (and break-glass exclusions) haven't drifted. Note the **mandatory MFA enforcement for the Azure/Entra/Intune admin portals** (phased since 2024) is applied at the *client application* level and is **separate from** Conditional Access — it applies even to accounts excluded from CA policies.

### 3.4 Break-glass / emergency access accounts
Per [Microsoft's emergency-access guidance](https://learn.microsoft.com/en-us/entra/identity/role-based-access-control/security-emergency-access):
- Create **at least two cloud-only Global Administrator accounts**, **not tied to any individual** or to any employee device/phone.
- **Exclude at least one from all Conditional Access policies** (including Microsoft-managed policies) — that's the entire point: prevent tenant lockout from a misconfigured CA policy. A common pattern is one account fully excluded and a second with location/device constraints as a "less emergency" fallback.
- Use **FIDO2 or certificate-based** credentials; because portal MFA enforcement now applies even to break-glass accounts, they must have strong auth methods registered. Split any password and store it in a physical safe.
- **Alert on every sign-in** via Azure Monitor / Microsoft Sentinel (KQL rule). Break-glass usage should be rare, logged, and reviewed — this is your SOX **emergency-change** audit trail.

### 3.5 CIEM / Permissions Management — important 2025 change
**Microsoft retired standalone Microsoft Entra Permissions Management (MEPM) on November 1, 2025** (extended from the originally announced October 1; new sales stopped April/May 2025). CIEM capabilities now live inside [**Microsoft Defender for Cloud CSPM**](https://learn.microsoft.com/en-us/azure/defender-for-cloud/permissions-management-overview) for identity discovery, permissions visibility, and entitlement right-sizing. For full standalone multicloud (Azure/AWS/GCP) CIEM, Microsoft points customers to third-party ISVs (it named **Delinea's Privilege Control for Cloud Entitlements** as a recommended alternative; SailPoint, Palo Alto Cortex Cloud, and others also compete here). **Action:** if the prior primer referenced MEPM as a live product, update that — use Defender CSPM's permissions capabilities, and evaluate a vendor-neutral CIEM only if you have material AWS/GCP footprint.

### 3.6 Just-in-time VM access
[Defender for Cloud JIT VM access](https://learn.microsoft.com/en-us/azure/defender-for-cloud/just-in-time-access-overview) keeps inbound management ports (RDP 3389 / SSH 22) closed by default and opens them on-demand, for a specified source IP and time-limited window, after an authorized request. This shrinks brute-force exposure and supports least-privilege *network* access — complementary to identity-plane JIT via PIM.

### 3.7 Access review automation & policy governance
- [**Entra Access Reviews**](https://learn.microsoft.com/en-us/entra/id-governance/access-reviews-overview) recertify group, role, and app assignments on a schedule (**quarterly** is the norm auditors expect). Reviewers approve/deny in the My Access portal; you can auto-apply removals. This *is* your SOC 2 CC6.2 / SOX access-recertification evidence.
- **Automate** via [Microsoft Graph / PowerShell](https://learn.microsoft.com/en-us/entra/id-governance/identity-governance-automation) — e.g., `New-MgIdentityGovernanceAccessReviewDefinition` run from an Azure Automation runbook using certificate-based app auth (no user context). Requires `AccessReview.ReadWrite.All` and Entra ID P2/Governance.
- Use [**Azure Policy**](https://learn.microsoft.com/en-us/azure/governance/policy/overview) for access-governance guardrails (deny/audit effects), and assign the built-in [**PCI DSS v4 Regulatory Compliance initiative**](https://learn.microsoft.com/en-us/azure/governance/policy/samples/pci-dss-4-0). Manage policy as code with Bicep/Terraform; the initiative definitions live in [Azure/azure-policy](https://github.com/Azure/azure-policy/blob/master/built-in-policies/policySetDefinitions/Regulatory%20Compliance/PCI_DSS_V4.0.json). **Caveat Microsoft states explicitly:** "Compliant in Azure Policy refers only to the policy definitions themselves; this doesn't ensure you're fully compliant with all requirements of a control" — it's a partial, assessment aid, not an attestation.

### 3.8 Key & secret management
Use [**managed identities + Azure Key Vault**](https://learn.microsoft.com/en-us/azure/key-vault/general/overview) so no secret ever lands in code or config. Tiers/options (see the [key-management choice guide](https://learn.microsoft.com/en-us/azure/security/fundamentals/key-management-choose)):
- **Key Vault Standard** — FIPS 140-2 Level 1, software-protected, multitenant.
- **Key Vault Premium** — **FIPS 140-3 Level 3** HSM-backed (Marvell LiquidSecurity), PCI-compliant, multitenant.
- **[Managed HSM](https://learn.microsoft.com/en-us/azure/key-vault/managed-hsm/overview)** — **single-tenant, FIPS 140-3 Level 3** dedicated HSM pool; the right choice for banking **key sovereignty** and single-tenancy compliance requirements. In 2025 Microsoft upgraded both Managed HSM and Key Vault Premium firmware to **FIPS 140-3 Level 3** across public regions.
- **Azure Payment HSM** and the newer **Azure Integrated HSM** (embedded on AMD v7 VM hardware) exist for specialized payment/low-latency workloads.

Crypto key hierarchy concepts to internalize: **CMK** (customer-managed key), **KEK** (key-encryption key wrapping a **DEK** data-encryption key — *envelope encryption*), and separation of key custody from data custody.

### 3.9 .NET code pattern (Azure.Identity)
Use the [Azure.Identity](https://www.nuget.org/packages/Azure.Identity/) SDK (`dotnet add package Azure.Identity`) with [Azure.Security.KeyVault.Secrets](https://www.nuget.org/packages/Azure.Security.KeyVault.Secrets/). `DefaultAzureCredential` chains local-dev credentials (Azure CLI, Visual Studio) and cloud credentials (managed identity, workload identity) so the **same code works locally and in production with no changes**. However, Microsoft's explicit guidance is that "in production, it's better to use something else" — **pin to `ManagedIdentityCredential` explicitly in production** (or set `AZURE_TOKEN_CREDENTIALS`) for deterministic, resilient, secretless authentication. Canonical pattern:

```csharp
using Azure.Identity;
using Azure.Security.KeyVault.Secrets;

var client = new SecretClient(new Uri(kvUri), new DefaultAzureCredential());
// Production: new ManagedIdentityCredential(userAssignedClientId)
KeyVaultSecret secret = await client.GetSecretAsync("Db-ConnectionString");
```

See the [Key Vault .NET quickstart](https://learn.microsoft.com/en-us/azure/key-vault/secrets/quick-create-net) and the [Azure.Identity for .NET README](https://learn.microsoft.com/en-us/dotnet/api/overview/azure/identity-readme). When deployed to Azure App Service / Container Apps, the managed identity is discovered automatically.

### 3.10 Landing Zone architecture for regulated industries
- [**Azure Landing Zones / Enterprise-Scale**](https://github.com/Azure/Enterprise-Scale) — the authoritative multi-subscription reference (identity, security, networking, governance, logging critical design areas).
- [**Microsoft FSI (Financial Services Industry) Landing Zones**](https://github.com/microsoft/industry/blob/main/fsi/readme.md) — a **secure-by-default reference implementation specifically for financial services**, shipping prescriptive policy assignments per Azure service and using **AzOps** for GitOps-style policy deployment across Azure DevOps/GitHub/GitLab. This is your closest-to-turnkey regulated-bank starting point on Azure.
- [**CAF Landing Zone Accelerator**](https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ready/landing-zone/) — deploys the management-group hierarchy (Platform / Landing Zones / Sandbox / Decommissioned), platform subscriptions (Management / Identity / Connectivity), Azure Policy guardrails, hub networking with Azure Firewall, Log Analytics, and Defender for Cloud, via Portal, Bicep, or Terraform.
- For public-sector/sovereign patterns worth studying (both being reworked in 2026): [Azure/sovereign-landing-zone](https://github.com/Azure/sovereign-landing-zone) and [Azure/CanadaPubSecALZ](https://github.com/Azure/CanadaPubSecALZ) (NIST 800-53-based).

### 3.11 Control mapping (keep this on your desk)
| Regulatory requirement | Azure/Microsoft control |
|---|---|
| **PCI DSS Req 7** (need-to-know) | Narrow RBAC scoping + ABAC conditions + PIM eligibility (JIT) |
| **PCI DSS Req 8** (identify/authenticate) | Entra ID + Conditional Access MFA + phishing-resistant Authentication Strengths |
| **SOC 2 CC6.1** (logical access) | Entra ID, Key Vault, network segmentation, encryption |
| **SOC 2 CC6.2** (provisioning/deprovisioning) | Lifecycle Workflows + timely deprovisioning + access reviews |
| **SOC 2 CC6.3** (least privilege + SoD) | PIM + Access Reviews + Azure Policy guardrails |
| **SOX ITGC – access** | PIM (no standing privilege) + quarterly Access Reviews (recertification evidence) |
| **SOX ITGC – change / emergency** | Break-glass sign-in alerting + audited PIM activations |
| **GLBA Safeguards / FFIEC InfoSec** | Managed HSM/Key Vault encryption, MFA, Defender for Cloud monitoring |

---

## 4. Comprehensive Glossary

- **ABAC** — Attribute-Based Access Control; access decisions based on attributes/conditions (e.g., resource tags) layered on top of roles.
- **ACH** — Automated Clearing House; US batch electronic funds transfer network governed by NACHA.
- **AES** — Advanced Encryption Standard; symmetric block cipher (commonly AES-256).
- **AICPA** — American Institute of Certified Public Accountants; owns the SOC/Trust Services Criteria framework.
- **AML** — Anti-Money Laundering; controls to detect and prevent money laundering.
- **AoC** — Attestation of Compliance; the signed PCI compliance summary accompanying an RoC/SAQ.
- **API** — Application Programming Interface.
- **ASV** — Approved Scanning Vendor; a PCI-authorized vendor performing external vulnerability scans.
- **BSA** — Bank Secrecy Act (31 U.S.C. 5311 et seq.); foundational US AML statute.
- **CAB** — Change Advisory Board; body that reviews/approves IT changes (ITIL).
- **CCPA / CPRA** — California Consumer Privacy Act / California Privacy Rights Act (amending statute).
- **CDC** — Change Data Capture; database technique to track and stream row-level changes.
- **CDE** — Cardholder Data Environment; the PCI-scoped systems that store/process/transmit card data.
- **CDD** — Customer Due Diligence; the BSA process including beneficial-ownership identification (31 CFR 1010.230).
- **CEK** — Column/Content Encryption Key (e.g., SQL Always Encrypted column key); context-dependent.
- **CHD** — Cardholder Data; the PAN plus cardholder name, expiration date, and service code.
- **CI/CD** — Continuous Integration / Continuous Delivery.
- **CIEM** — Cloud Infrastructure Entitlement Management; discovering/right-sizing cloud permissions.
- **CIP** — Customer Identification Program (USA PATRIOT Act §326; 31 CFR 1020.220).
- **CMK** — Customer-Managed Key; encryption key the customer controls in Key Vault/Managed HSM.
- **COSO** — Committee of Sponsoring Organizations; the internal-control framework underpinning SOX ICFR.
- **CPA** — Certified Public Accountant.
- **CSF** — Cybersecurity Framework (NIST) or HITRUST CSF; context-dependent.
- **CTA / BOI** — Corporate Transparency Act / Beneficial Ownership Information reporting (narrowed for domestic entities in 2025).
- **CTR** — Currency Transaction Report; filed for cash transactions exceeding $10,000 (31 CFR 1010.311).
- **CVV / CVC** — Card Verification Value / Code; the card security code (part of SAD; never stored post-authorization).
- **DAST** — Dynamic Application Security Testing (running-app testing).
- **DEK** — Data Encryption Key; the key that encrypts data, itself wrapped by a KEK (envelope encryption).
- **DPA** — Data Processing Agreement (GDPR) or Data Protection Authority; context-dependent.
- **EF Core** — Entity Framework Core; the .NET object-relational mapper.
- **EMVCo** — Standards body (Amex, Discover, JCB, Mastercard, UnionPay, Visa) for chip and payment-token specs.
- **FDIC** — Federal Deposit Insurance Corporation.
- **FFIEC** — Federal Financial Institutions Examination Council; issues the interagency IT and BSA/AML exam manuals.
- **FinCEN** — Financial Crimes Enforcement Network; Treasury bureau administering the BSA.
- **FIPS** — Federal Information Processing Standard (e.g., FIPS 140-3 for cryptographic modules).
- **FRB** — Federal Reserve Board.
- **GCM** — Galois/Counter Mode; an authenticated-encryption mode for AES.
- **GDPR** — General Data Protection Regulation (EU 2016/679).
- **GLBA** — Gramm-Leach-Bliley Act (Financial Services Modernization Act).
- **HITRUST** — Health Information Trust Alliance; owns the HITRUST CSF certification.
- **HSM** — Hardware Security Module; tamper-resistant hardware for key storage/crypto operations.
- **IaC** — Infrastructure as Code (Bicep, Terraform, ARM).
- **ISO 20022** — Global financial-messaging standard (pain/pacs/camt families).
- **ITGC** — IT General Controls (access, change, operations) underpinning SOX ICFR.
- **ITIL** — IT Infrastructure Library; IT service-management framework.
- **JIT** — Just-in-Time; time-limited, on-demand access (PIM roles, VM ports).
- **KEK** — Key Encryption Key; wraps DEKs in envelope encryption.
- **KYC** — Know Your Customer; identity-verification obligations under the BSA/CIP.
- **LEI** — Legal Entity Identifier; the ISO 17442 global 20-character entity identifier.
- **MDES** — Mastercard Digital Enablement Service; Mastercard's tokenization service.
- **MT / MX** — SWIFT legacy message types (FIN) / ISO 20022 XML messages.
- **mTLS** — Mutual TLS; both client and server present certificates.
- **NACHA** — National Automated Clearing House Association; ACH rule-maker.
- **NCUA** — National Credit Union Administration.
- **NPI** — Nonpublic Personal Information (the GLBA-protected data category).
- **OCC** — Office of the Comptroller of the Currency.
- **ODFI / RDFI** — Originating / Receiving Depository Financial Institution (ACH roles).
- **OFAC** — Office of Foreign Assets Control; administers US sanctions and the SDN List.
- **OSS** — Open-Source Software.
- **pain / pacs / camt** — ISO 20022 payment-initiation / clearing-settlement / cash-management message families.
- **PAN** — Primary Account Number; the full card number.
- **PCAOB** — Public Company Accounting Oversight Board; oversees public-company auditors under SOX.
- **PCI DSS** — Payment Card Industry Data Security Standard.
- **PHI** — Protected Health Information (HIPAA term; your prior domain).
- **PII** — Personally Identifiable Information.
- **PIM** — Privileged Identity Management (Entra JIT privileged access).
- **PIN** — Personal Identification Number.
- **QSA** — Qualified Security Assessor; PCI-certified assessor who performs RoC audits.
- **RBAC** — Role-Based Access Control.
- **RoC** — Report on Compliance; the QSA-produced PCI audit report (Level 1 merchants/service providers).
- **RSA** — Rivest-Shamir-Adleman; asymmetric public-key cryptosystem.
- **RTP** — Real-Time Payments network (The Clearing House).
- **SAD** — Sensitive Authentication Data (full track data, CVV, PIN); must never be stored post-authorization.
- **SAQ** — Self-Assessment Questionnaire; the PCI validation method for eligible smaller merchants.
- **SAR** — Suspicious Activity Report (FinCEN; ~$5,000 bank threshold).
- **SAST** — Static Application Security Testing (source-code analysis).
- **SBOM** — Software Bill of Materials.
- **SCA** — Software Composition Analysis (dependency scanning) or Strong Customer Authentication (PSD2); context-dependent.
- **SDLC** — Software Development Life Cycle.
- **SDN** — Specially Designated Nationals and Blocked Persons List (OFAC blocking list).
- **SEC** — Securities and Exchange Commission, or Standard Entry Class code (ACH); context-dependent.
- **SGX** — Intel Software Guard Extensions; confidential-computing enclaves.
- **SIEM** — Security Information and Event Management (e.g., Microsoft Sentinel).
- **SoD** — Segregation of Duties.
- **SOC 2** — System and Organization Controls 2 (AICPA attestation).
- **SOX** — Sarbanes-Oxley Act of 2002.
- **SWIFT** — Society for Worldwide Interbank Financial Telecommunication.
- **TAVV** — Token Authentication Verification Value; Visa network-token cryptogram.
- **TLS** — Transport Layer Security.
- **TPSP / TPS** — Third-Party Service Provider / Third-Party Sender (PCI and ACH contexts).
- **TSC** — Trust Services Criteria (SOC 2).
- **UCAF** — Universal Cardholder Authentication Field; Mastercard authentication data carrier.
- **VBS** — Virtualization-Based Security (Windows hardware-isolated security).
- **VTS** — Visa Token Service.
- **WORM** — Write Once Read Many; immutable storage (relevant to SOX §802 record retention).

---

## 5. Appendix

### 5.1 Framework comparison table
| Framework | Type | Owner / Regulator | Scope | Primary Source |
|---|---|---|---|---|
| PCI DSS 4.0.1 | Contractual standard | [PCI SSC](https://www.pcisecuritystandards.org/) | Card data (CDE) | [Document Library](https://www.pcisecuritystandards.org/document_library/) |
| SOC 2 | Attestation | [AICPA](https://www.aicpa-cima.com/) | Service-org controls (TSC) | [Trust Services Criteria](https://www.aicpa-cima.com/resources/download/2017-trust-services-criteria-with-revised-points-of-focus-2022) |
| GLBA Safeguards | Regulation | [FTC](https://www.ftc.gov/) | Customer financial info (NPI) | [16 CFR 314](https://www.ftc.gov/legal-library/browse/rules/safeguards-rule) |
| FFIEC IT Handbook | Exam guidance | FFIEC member agencies | Bank IT risk | [ithandbook.ffiec.gov](https://ithandbook.ffiec.gov/) |
| SOX (§404/§302/§802) | Federal law | [SEC](https://www.sec.gov/) / [PCAOB](https://pcaobus.org/) | Public-company ICFR | [PCAOB AS 2201](https://pcaobus.org/oversight/standards/auditing-standards/details/AS2201) |
| GDPR | Regulation | EU DPAs | EU personal data | [gdpr-info.eu](https://gdpr-info.eu/) |
| CCPA/CPRA | State law | [CPPA](https://cppa.ca.gov/) | CA personal data | [oag.ca.gov/privacy/ccpa](https://oag.ca.gov/privacy/ccpa) |
| BSA / AML | Federal law | [FinCEN](https://www.fincen.gov/) | Money laundering / sanctions | [31 U.S.C. 5311+](https://www.fincen.gov/resources/statutes-and-regulations/bank-secrecy-act) |
| Regulation II | Regulation | [Federal Reserve](https://www.federalreserve.gov/) | Debit interchange/routing | [12 CFR 235](https://www.ecfr.gov/current/title-12/chapter-II/subchapter-A/part-235) |

### 5.2 "Which SAQ applies?" decision tree (narrative)
Start at the top; the first match governs. **Always confirm eligibility with your acquirer** — they can require a stricter SAQ or a full RoC.
1. **Are you a service provider, or a merchant that stores/processes/transmits card data electronically and doesn't fit any category below?** → **SAQ D** (the most comprehensive) — and Level 1 volumes require a QSA-signed **RoC**, not an SAQ.
2. **Card-not-present e-commerce, ALL card functions fully outsourced to PCI-validated third parties, no card data touches your systems/servers (full redirect or hosted fields where you never receive the data)?** → **SAQ A**.
3. **E-commerce where your site partially controls how payment data is captured (e.g., direct-post, or an iframe/JS setup where your server *could* affect the payment page)?** → **SAQ A-EP**.
4. **Face-to-face or mail/telephone-order (MOTO) using only standalone, PTS-approved dial-out terminals, no electronic cardholder-data storage?** → **SAQ B** (or **B-IP** for IP-connected terminals).
5. **Using hardware terminals in a PCI-listed P2PE (point-to-point encryption) solution?** → **SAQ P2PE**.
6. **A payment application/system connected to the internet (e.g., an integrated POS), no e-commerce?** → **SAQ C**; virtual terminal only, one device, no storage → **SAQ C-VT**.

### 5.3 Key-dates timeline
- **2004** — ISO 20022 first published by ISO.
- **March 2022** — PCI DSS v4.0 released.
- **March 2023** — SWIFT CBPR+ MT/MX coexistence begins.
- **June 9, 2023** — GLBA Safeguards Rule (strengthened) full-compliance deadline.
- **July 2023** — FedNow Service launches.
- **May 2024** — GLBA Safeguards breach-notification requirement takes effect.
- **June 2024** — PCI DSS v4.0.1 published.
- **December 31, 2024** — PCI DSS v4.0 retired; v4.0.1 becomes sole version.
- **February 2025** — RTP per-transaction limit raised to $10M.
- **March 26, 2025** — FinCEN interim final rule narrows CTA/BOI reporting to foreign entities.
- **March 31, 2025** — PCI DSS v4.0 future-dated requirements become mandatory.
- **July 14, 2025** — Fedwire ISO 20022 go-live.
- **August 2025** — ND district court vacates (but stays) Regulation II interchange standard.
- **October 9, 2025** — FinCEN + banking agencies issue SAR-clarification FAQs.
- **November 1, 2025** — Microsoft Entra Permissions Management (MEPM) retired.
- **November 22, 2025** — SWIFT CBPR+ MT/MX coexistence ends (MT103/MT202 retired cross-border).
- **March 20, 2026** — NACHA fraud-monitoring rule Phase 1.
- **June 22, 2026** — NACHA fraud-monitoring rule Phase 2.
- **November 2026** — SWIFT unstructured postal addresses decommissioned in CBPR+.
- **March 2028** — NACHA R90 sanctions-compliance return code takes effect.

### 5.4 OSS & compliance-as-code tools (Azure-relevant)
- [**Azure/Enterprise-Scale**](https://github.com/Azure/Enterprise-Scale) — enterprise-scale landing zone reference.
- [**microsoft/industry** (FSI folder)](https://github.com/microsoft/industry/tree/main/fsi) — financial-services landing zone with secure-by-default policy assignments + AzOps.
- [**Azure/azure-policy**](https://github.com/Azure/azure-policy) — built-in policy/initiative definitions including the [PCI DSS v4 initiative JSON](https://github.com/Azure/azure-policy/blob/master/built-in-policies/policySetDefinitions/Regulatory%20Compliance/PCI_DSS_V4.0.json).
- [**MicrosoftDocs/entra-docs**](https://github.com/MicrosoftDocs/entra-docs) — source for PIM, access-review, and identity-governance docs and sample scripts.
- [**Maester**](https://maester.dev/) / [DCToolbox](https://github.com/DanielChronlund/DCToolbox) — automated Conditional Access / emergency-access configuration tests (CIS-aligned).
- [**pyiso20022**](https://pypi.org/project/pyiso20022/) — ISO 20022 (pain/pacs/camt) message parser/generator; a useful structural reference even for .NET teams.
- [**Azure/sovereign-landing-zone**](https://github.com/Azure/sovereign-landing-zone) and [**Azure/CanadaPubSecALZ**](https://github.com/Azure/CanadaPubSecALZ) — regulated/sovereign reference implementations to study (both being reworked in 2026).

---

## 6. References & Further Reading

**Regulatory bodies & primary standards**
- PCI Security Standards Council — https://www.pcisecuritystandards.org/ ; Document Library — https://www.pcisecuritystandards.org/document_library/
- AICPA (SOC 2 / Trust Services Criteria) — https://www.aicpa-cima.com/
- FTC Safeguards Rule — https://www.ftc.gov/legal-library/browse/rules/safeguards-rule
- FFIEC IT Examination Handbook InfoBase — https://ithandbook.ffiec.gov/
- FFIEC BSA/AML Examination Manual — https://bsaaml.ffiec.gov/
- PCAOB (SOX auditing standards) — https://pcaobus.org/
- SEC — https://www.sec.gov/
- FinCEN — https://www.fincen.gov/ ; BSA — https://www.fincen.gov/resources/statutes-and-regulations/bank-secrecy-act ; BOI — https://www.fincen.gov/boi
- OFAC (Treasury) — https://ofac.treasury.gov/ ; Sanctions List Search — https://sanctionssearch.ofac.treas.gov/
- Federal Reserve Regulation II — https://www.federalreserve.gov/paymentsystems/regii-about.htm ; 12 CFR 235 (eCFR) — https://www.ecfr.gov/current/title-12/chapter-II/subchapter-A/part-235
- GDPR — https://gdpr-info.eu/ ; California CCPA — https://oag.ca.gov/privacy/ccpa ; CPPA — https://cppa.ca.gov/

**Azure / Microsoft technical documentation**
- Entra PIM — https://learn.microsoft.com/en-us/entra/id-governance/privileged-identity-management/pim-configure ; deployment plan — https://learn.microsoft.com/en-us/entra/id-governance/privileged-identity-management/pim-deployment-plan
- Conditional Access — https://learn.microsoft.com/en-us/entra/identity/conditional-access/overview
- Emergency/break-glass access — https://learn.microsoft.com/en-us/entra/identity/role-based-access-control/security-emergency-access
- Access Reviews — https://learn.microsoft.com/en-us/entra/id-governance/access-reviews-overview ; ID Governance automation — https://learn.microsoft.com/en-us/entra/id-governance/identity-governance-automation
- Azure RBAC — https://learn.microsoft.com/en-us/azure/role-based-access-control/overview ; ABAC conditions — https://learn.microsoft.com/en-us/azure/role-based-access-control/conditions-overview
- Defender for Cloud CIEM/permissions — https://learn.microsoft.com/en-us/azure/defender-for-cloud/permissions-management-overview ; JIT VM access — https://learn.microsoft.com/en-us/azure/defender-for-cloud/just-in-time-access-overview
- Key management in Azure — https://learn.microsoft.com/en-us/azure/security/fundamentals/key-management ; choose the right solution — https://learn.microsoft.com/en-us/azure/security/fundamentals/key-management-choose ; Managed HSM — https://learn.microsoft.com/en-us/azure/key-vault/managed-hsm/overview
- Azure Policy PCI DSS v4 initiative — https://learn.microsoft.com/en-us/azure/governance/policy/samples/pci-dss-4-0
- Azure.Identity for .NET — https://learn.microsoft.com/en-us/dotnet/api/overview/azure/identity-readme ; Key Vault .NET quickstart — https://learn.microsoft.com/en-us/azure/key-vault/secrets/quick-create-net
- CAF Landing Zone — https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ready/landing-zone/ ; Zero Trust — https://learn.microsoft.com/en-us/security/zero-trust/

**Banking-protocol standards bodies**
- ISO 20022 — https://www.iso20022.org/ ; message definitions — https://www.iso20022.org/iso-20022-message-definitions
- SWIFT ISO 20022 — https://www.swift.com/standards/iso-20022
- NACHA — https://www.nacha.org/ ; Operating Rules / new rules — https://www.nacha.org/rules
- The Clearing House RTP — https://www.theclearinghouse.org/payment-systems/rtp
- FedNow (Federal Reserve) — https://www.federalreserve.gov/paymentsystems/fednow_about.htm ; FedNow explorer — https://explore.fednow.org/
- EMVCo — https://www.emvco.com/ ; Payment Tokenisation — https://www.emvco.com/emv-technologies/payment-tokenisation/
- Visa Token Service — https://developer.visa.com/capabilities/vts ; Mastercard MDES — https://developer.mastercard.com/product/mastercard-digital-enablement-service-mdes/

**OSS & reference implementations**
- Azure Enterprise-Scale — https://github.com/Azure/Enterprise-Scale
- Microsoft FSI landing zone — https://github.com/microsoft/industry/tree/main/fsi
- Azure Policy repo — https://github.com/Azure/azure-policy
- Entra docs repo — https://github.com/MicrosoftDocs/entra-docs
- Maester (CA/emergency-access testing) — https://maester.dev/

**Books, courses & certifications relevant to fintech compliance engineering**
- **Microsoft SC-300** (Identity and Access Administrator) — directly maps to Section 3 of this doc.
- **Microsoft SC-100** (Cybersecurity Architect) and **AZ-500** (Azure Security Engineer).
- **ISACA CISA** — the audit certification most aligned to ITGC/SOX work; **CRISC** for risk.
- **(ISC)² CISSP** — broad security foundation respected in banking.
- **PCI SSC training / ISA (Internal Security Assessor)** program — if you'll own PCI evidence internally.
- FFIEC IT Handbook booklets and the FFIEC BSA/AML Manual are free and are, in practice, the most valuable "textbooks" for a US bank engineer.

---

### Bottom line
As a HIPAA-experienced engineer, you already understand written security programs, access minimization, audit evidence, and encryption — the *mechanics* transfer directly. What's new is (a) **payment-specific standards** (PCI DSS Req 7/8, card tokenization, ISO 20022/SWIFT/ACH/instant rails) and (b) **financial-crime controls** (BSA/AML/OFAC/KYC) that have no healthcare analog. On the Azure side, your fastest wins are **PIM (kill standing privilege), Conditional Access with phishing-resistant MFA, quarterly automated Access Reviews, and Managed HSM for key sovereignty** — those four alone satisfy the bulk of PCI Req 7/8, SOC 2 CC6, and SOX ITGC access controls, and produce the audit artifacts examiners will ask for. Two things to correct if they appear in older notes: **Entra Permissions Management is retired (use Defender CSPM)**, and **Regulation II's interchange cap is under active litigation**.