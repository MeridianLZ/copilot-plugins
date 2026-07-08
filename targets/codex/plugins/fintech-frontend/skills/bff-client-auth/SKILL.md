---
name: bff-client-auth
description: Client-side auth for the BFF pattern — cookie sessions, CSRF, idle timeout UX, step-up MFA handling, 401 flows, route protection. Consult for any login, logout, session, permission-gating, or "how do I attach the token" question on the frontend.
---

# BFF Client Auth (frontend side)

## The core rule
**The SPA never handles tokens.** No access token, no refresh token, no JWT in memory, localStorage, sessionStorage, or a Redux slice. If you find yourself writing `Authorization: Bearer`, you're solving the wrong problem — the BFF holds tokens server-side and the browser carries only an `HttpOnly`, `SameSite=Strict`, `__Host-` prefixed session cookie.

## Wiring
- All API calls go to the BFF with `credentials: 'include'` (configured once in `baseApi`).
- CSRF: the BFF sets a readable `XSRF-TOKEN` cookie; the SPA echoes it as a header on every mutating request (`prepareHeaders` in `baseApi`).
- Auth state: `GET /bff/user` returns the claims subset the UI needs. Cache it in RTK Query like any other server state — it is not slice state.

## Flows
- **401 from any endpoint** → clear the RTK Query cache and redirect to `/bff/login?returnUrl=<current>`. Never attempt a silent client-side refresh; that's the BFF's job.
- **403** → render an authorization-failure state; do not redirect to login (the user is authenticated, just not permitted).
- **Logout** → navigate to the BFF logout endpoint (RP-initiated). Don't just delete client state; the server session must die.
- **Idle timeout** → BFF returns a session-expiry hint; show a warning modal before expiry with an extend action. Focus the modal and announce it (a11y).
- **Step-up MFA** → a money-movement mutation may return a step-up-required response. Route the user through the BFF re-auth challenge and resume with the **same idempotency key** so the retry can't double-post.

## Route protection
Client-side route guards are UX, not security — the BFF and downstream services enforce authorization independently. Never gate on a client-decoded claim as if it were a control.
