## Add 3 MCP tools to the existing Aquatic Dreams MCP server

All three tools are added to the existing `@lovable.dev/mcp-js` server that already exposes `search_swimmers`, `list_active_sessions`, etc. — same OAuth, same admin-scoped auth, no schema changes, no new admin UI.

### Files

New files:
- `src/lib/mcp/tools/list-open-private-slots.ts`
- `src/lib/mcp/tools/list-past-private-families.ts`
- `src/lib/mcp/tools/send-private-openings-sms.ts`

Edited files:
- `src/lib/mcp/index.ts` — import the three tools and add to `tools: [...]`.

After edits: run `app_mcp_server--extract_mcp_manifest`, then `supabase--deploy_edge_functions` for the `mcp` function. No other backend or frontend changes.

### Tool 1 — `list_open_private_slots`

**Purpose:** enumerate open private-lesson slots for a specific date (e.g. next Saturday) using the same public RPCs the `/book-private-lesson` picker uses.

**Input:**
- `date` (required, YYYY-MM-DD)
- `instructorIds?: string[]` (optional filter)

**Handler:** Uses the user's bearer token via the shared `client(ctx)` pattern. Calls, in parallel:
- `rpc("get_active_instructors_public")`
- `rpc("get_public_booking_blocks", { _instructor_ids })`
- `rpc("get_public_taken_occurrences", { p_from_date: date, p_to_date: date })`
- `rpc("get_active_slot_holds",       { p_from_date: date, p_to_date: date, p_session_token: null })`

Then runs the same slot-composition logic as `src/lib/privateBooking.ts::fetchOpenSlots` (weekly/date_range + break windows + blackouts + taken/holds subtraction) but scoped to the single date. Returns `{ rows: [{ instructor_id, instructor_name, slot_date, start_time, end_time }] }` sorted by `start_time` then `instructor_name`.

To avoid duplicating that ~80 lines of code, extract the pure slot-composition helper from `src/lib/privateBooking.ts` into `src/lib/privateBooking-core.ts` (no supabase imports; take blocks/taken/holds/instructors as arguments) and have both the browser flow and this MCP tool call it. The current `privateBooking.ts` keeps its network calls and imports the helper.

### Tool 2 — `list_past_private_families`

**Purpose:** dedup'd list of families who've had at least one private/semi-private lesson, with a valid phone number.

**Input:**
- `sinceDate?` (YYYY-MM-DD; default: 12 months ago) — only families with an occurrence on/after this date
- `includeSemiPrivate?: boolean` (default true)
- `limit?: number` (1–1000, default 500)

**Handler:** Selects from `lesson_bookings` joined via `lesson_booking_occurrences`:
```
select b.parent_name, b.parent_first_name, b.parent_last_name,
       b.parent_phone, b.child_first_name, b.child_name,
       max(o.occurrence_date) as last_lesson_date
  from lesson_bookings b
  join lesson_booking_occurrences o on o.booking_id = b.id
 where b.lesson_type in ('private'[,'semi-private'])
   and b.status <> 'cancelled'
   and o.status  <> 'cancelled'
   and o.occurrence_date >= :sinceDate
   and b.parent_phone is not null
 group by ...
```
Client-side: normalize phones via same rules as `_shared/textmagic.ts::normalizePhone`, dedupe by normalized phone, merge child first names into `childNames: string[]`, sort by `last_lesson_date desc`, cap to `limit`. Returns `{ rows: [{ phone, parent_name, childNames, last_lesson_date }] }`.

Runs under the admin's JWT; existing `lesson_bookings` RLS already grants admins read access.

### Tool 3 — `send_private_openings_sms`

**Purpose:** Send the outreach blast by delegating to the existing admin-only edge function `send-bulk-outreach-sms` — no new SMS wiring.

**Input:**
- `template` (5–1000 chars; may include `{{childNames}}` and `{{date}}` — resolved server-side per recipient)
- `dateLabel` (e.g. "Sat Aug 30") — passed as `startDateLabel` to the existing function
- `recipients: [{ phone: string, childNames?: string[] }]` (1–500)
- `reminderKind?: string` (default `"saturday_openings_sms"`)

**Annotations:** `readOnlyHint: false`, `destructiveHint: false`, `openWorldHint: true`. Include `needsApproval: true` semantics by requiring an explicit `confirm: true` boolean input; the tool refuses to send otherwise. This gives assistants a two-turn preview/confirm loop without adding UI.

**Handler:** POSTs to `${SUPABASE_URL}/functions/v1/send-bulk-outreach-sms` with:
- `Authorization: Bearer ${ctx.getToken()}` (admin role check happens inside the existing function)
- Body: `{ template, startDateLabel: dateLabel, recipients, reminderKind }`

Returns the function's JSON summary (`{ sent, failed, ... }`) as `structuredContent`. On non-2xx, returns `isError: true` with the response body text.

### Assistant usage flow (no in-app UI)

The user tells their connected assistant: "Show me open private slots for Sat Aug 30 and text everyone who's had a private lesson in the last 6 months."

1. Assistant calls `list_open_private_slots({ date: "2026-08-29" })`.
2. Assistant calls `list_past_private_families({ sinceDate: "2026-02-28" })`.
3. Assistant drafts a message referencing the slots and `/book-private-lesson`, shows the user for approval.
4. On confirm, assistant calls `send_private_openings_sms({ template, dateLabel, recipients, confirm: true })`.

### Post-implementation checks

- `app_mcp_server--extract_mcp_manifest` reports all 7 tools (4 existing + 3 new) without errors.
- `supabase--deploy_edge_functions` for the `mcp` function.
- Sanity check via `supabase--curl_edge_functions` on `/functions/v1/mcp` tool listing (or by reconnecting Claude/ChatGPT).