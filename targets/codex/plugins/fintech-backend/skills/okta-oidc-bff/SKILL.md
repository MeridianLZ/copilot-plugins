---
name: okta-oidc-bff
description: Okta/Auth0 OIDC via the BFF pattern — auth-code + PKCE, server-side sessions, cookie security, CSRF, step-up MFA, downstream JWT validation, logout. Consult for any login, session, token, scope, claims, or authorization work.
---

# Okta/Auth0 OIDC — BFF Pattern

## Topology (fixed)
Browser ↔ **BFF (ASP.NET Core)** ↔ downstream APIs. Tokens live server-side only.

```csharp
builder.Services.AddAuthentication(o => {
    o.DefaultScheme = CookieAuthenticationDefaults.AuthenticationScheme;
    o.DefaultChallengeScheme = OpenIdConnectDefaults.AuthenticationScheme;
})
.AddCookie(o => {
    o.Cookie.Name = "__Host-bff";
    o.Cookie.HttpOnly = true;
    o.Cookie.SameSite = SameSiteMode.Strict;
    o.Cookie.SecurePolicy = CookieSecurePolicy.Always;
    o.SlidingExpiration = true;
    o.ExpireTimeSpan = TimeSpan.FromMinutes(20);   // customer idle; operator apps use 8h absolute
})
.AddOpenIdConnect(o => {
    o.Authority = configuration["Oidc:Authority"];   // from a K8s Secret — never inline
    o.ClientId  = configuration["Oidc:ClientId"];
    o.ResponseType = "code";
    o.UsePkce = true;
    o.GetClaimsFromUserInfoEndpoint = true;
    o.SaveTokens = true;                             // into the Redis ticket store
    o.Scope.Add("offline_access");
});
```
Session tickets in Redis via `ITicketStore` — the cookie carries only a session key. Refresh rotation happens server-side.

## SPA contract
`GET /bff/user` returns auth state and a claims subset. 401 → SPA redirects to `/bff/login?returnUrl=...`. CSRF via antiforgery double-submit: BFF sets a readable `XSRF-TOKEN` cookie, the SPA echoes it as a header on mutations.

## Step-up MFA
Money movement above threshold checks `auth_time`/`amr`; stale authentication triggers re-challenge with `prompt=login&max_age=...` and tenant-appropriate `acr_values`. The downstream service enforces the same requirement independently — the BFF check is UX, the downstream check is the control. A retry after step-up reuses the original idempotency key so it cannot double-post.

## Downstream validation
Per-service audience, pinned issuer, clock skew ≤60s, scopes mapped to named policies (`payments:write`). Every new scope or claim is documented in `docs/auth-matrix.md` as SOC 2 access-control evidence.

## Logout
RP-initiated logout + destroy the Redis ticket + clear the cookie. Integration-test all three.
