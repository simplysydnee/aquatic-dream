## Diagnosis

All four MCP tools connect (OAuth verification succeeds — logs show `oauth.verify.ok`) but every `tools/call` fails with `outcome: "handler_error"` in the `mcp` edge function logs (e.g. `list_active_sessions` at 2026-07-23, function `85bd0d3f-...`, `durationMs: 0.49` — the handler throws almost immediately, before any DB round-trip).

### Root cause

Each tool builds its Supabase client the same way:

```ts
createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, { ... })
```

Supabase Edge Functions inject `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` — **not** `SUPABASE_PUBLISHABLE_KEY`. That variable name only exists on the Vite frontend (`VITE_SUPABASE_PUBLISHABLE_KEY`). In the function it's `undefined`, so `createClient(url, undefined, …)` throws `supabaseKey is required.` synchronously on the very first line of every handler. That's why the duration is sub-millisecond and no query error ever shows up — the client is never built.

The tools that ship in the mcp-js docs happen to use the same name, but only work in stacks where the developer has separately set that secret. On this project it's not set for the function runtime, so every tool 500s.

### Proposed fix (do not apply yet)

In all four files under `src/lib/mcp/tools/*.ts`, change the client factory to use `SUPABASE_ANON_KEY` (which is always present in the edge runtime), keeping the user's bearer token forwarded so RLS still runs as the signed-in admin:

```ts
createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!,
  { global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false } },
);
```

Then redeploy the `mcp` edge function (the Vite plugin will regenerate `supabase/functions/mcp/index.ts` from the tool sources, and `supabase--deploy_edge_functions` pushes it).

### Verification after the fix

1. `supabase--curl_edge_functions` a `tools/call` for `list_active_sessions` (fastest, no args required) and confirm it returns rows.
2. Re-check `mcp` function logs for `outcome: "ok"` instead of `handler_error`.
3. Reconnect from Claude/ChatGPT and run each of the four tools once.

### Not changing

- Auth/OAuth config (already verified working).
- Tool signatures, schemas, or the `defineMcp` entry.
- Any RLS policy or table — the anon key + user JWT combination already gives the correct per-user access.
