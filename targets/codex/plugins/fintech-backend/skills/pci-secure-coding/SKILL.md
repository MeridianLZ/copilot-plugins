---
name: pci-secure-coding
description: PCI-DSS v4.0 secure coding rules for cardholder data. MUST be consulted whenever code touches card numbers, payment forms, tokenization, card display, or anything in the cardholder data environment — even test fixtures, even a demo. Triggers on PAN, CVV, card entry, BIN, wallet.
---

# PCI-DSS Secure Coding

## Data classification
- **PAN** — may cross the tokenization boundary only. Storage means a vault token (`tok_...`). Never in the app database, logs, messages, URLs, or analytics.
- **CVV/CVC** — never stored in any form, encrypted or not (Req 3.3.2). Write-only to the processor.
- **Expiry and cardholder name** — storable, but treated as NPI and encrypted at rest.

## Display (Req 3.4.1)
Mask to at most first 6 + last 4; the product default is last4 only (`•••• 4242`). Full-PAN reveal is role-gated, requires step-up MFA, emits an audit event, and is never cached.

## Backend rules
- Endpoints taking tokens validate the token format and **reject anything Luhn-plausible with a 422 plus an alert** — a raw PAN arriving means an upstream component is out of compliance.
- Only the payment-gateway service talks to processors, over mTLS. No other service calls a processor directly.
- Any new component touching PAN **expands the CDE audit scope** — flag it to security before building, don't discover it at audit time.

## Fixtures
Approved: `tok_test_visa`, `tok_test_mc_decline`, display strings like `4111-TEST-MASK`. The write hook Luhn-checks candidates and rejects real-shaped PANs — including the classic `4111111111111111`.

## Logging
See `secure-logging`. Redaction is defense-in-depth, not permission to log card data.
