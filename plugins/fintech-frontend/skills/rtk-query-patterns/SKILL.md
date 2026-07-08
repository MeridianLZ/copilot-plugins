---
name: rtk-query-patterns
description: Redux Toolkit + RTK Query reference patterns — endpoint injection, tag invalidation, optimistic-update policy, SSE streaming caches, serializable money handling. Consult for any data-fetching, caching, mutation, or "where should this state live" question in the frontend.
---

# RTK Query Patterns

## Base API
```ts
export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: '/api',
    credentials: 'include',          // BFF session cookie; no token handling client-side
    prepareHeaders: (headers) => {
      const csrf = readCookie('XSRF-TOKEN');
      if (csrf) headers.set('X-XSRF-TOKEN', csrf);
      return headers;
    },
  }),
  tagTypes: ['Account', 'Transaction', 'Payment', 'Card', 'Payee', 'Profile'],
  endpoints: () => ({}),
});
```

## Feature injection
```ts
const paymentsApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    getPayments: b.query<Payment[], PaymentsFilter>({
      query: (f) => ({url: 'payments', params: f}),
      transformResponse: (raw: unknown) => paymentListSchema.parse(raw),
      providesTags: (r) => r
        ? [...r.map(({id}) => ({type: 'Payment' as const, id})), {type: 'Payment', id: 'LIST'}]
        : [{type: 'Payment', id: 'LIST'}],
    }),
    createPayment: b.mutation<Payment, CreatePaymentBody>({
      query: (body) => ({
        url: 'payments', method: 'POST', body,
        headers: {'Idempotency-Key': body.idempotencyKey},
      }),
      invalidatesTags: [{type: 'Payment', id: 'LIST'}, {type: 'Account', id: 'LIST'}],
    }),
  }),
});
```

## Policy
- **No optimistic updates on money movement.** Pending status comes from the server. Optimistic is correct for reversible operations (rename payee, toggle alert, reorder widgets) via `onQueryStarted` + `updateQueryData` with rollback in the `catch`.
- Money stays `string` + currency in the store; dates stay ISO strings. No `Date` objects, no class instances — the store must stay serializable.
- Server state lives only in RTK Query. Slices hold UI state (wizard step, filters, prefs). Copying query data into a slice is a review blocker.
- `keepUnusedDataFor`: 30s default, `0` for balances, `refetchOnFocus: true` for dashboards.
- Streaming: `onCacheEntryAdded` opens SSE from the BFF, `updateCachedData` applies messages, teardown awaits `cacheEntryRemoved`.
- Errors: a shared `isFetchBaseQueryError` narrowing helper + ProblemDetails parsing; never `error as any`.

## Selectors
`createSelector` for derived data; parameterized selectors created per-instance (`useMemo`) so identity is stable — this is the top cause of list re-render storms here.
