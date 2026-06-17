# SMS Inbox — Build & Deploy

Migration and `TEXTMAGIC_INBOUND_SECRET` are already in place. Clicking **Implement plan** will execute all 8 items below and deploy both edge functions.

## Files

1. **`supabase/functions/receive-inbound-sms/index.ts`** (new)
   Public webhook. Validates `?token=` against `TEXTMAGIC_INBOUND_SECRET`. Accepts JSON or form-encoded. Normalizes phone, finds-or-creates a conversation (name lookup against `lesson_bookings` then `swim_enrollments` with `+1xxxxxxxxxx` / `xxxxxxxxxx` / E.164 variants), inserts the inbound message, updates conversation preview. Always returns 200.

2. **`supabase/functions/send-sms-message/index.ts`** (new)
   Verifies JWT in-code via `getClaims`. Allows `admin` OR `instructor` via `has_role` RPC. Zod-validates `{ conversation_id? | phone?, body (1..1000) }` (XOR). Resolves/creates conversation, sends via `sendSms()`, logs outbound row, updates conversation preview on success.

3. **`supabase/config.toml`** — add `verify_jwt = false` for both new functions (auth handled in code for `send-sms-message`).

4. **`src/components/admin/ProtectedRoute.tsx`** — keep admin-only by default, allow instructors at `/admin/messages` only.

5. **`src/pages/admin/MessagesAdmin.tsx`** (new) — two-pane inbox:
   - Left: search + conversation list ordered by `last_message_at desc`
   - Right: thread bubbles (inbound left, outbound right), sticky composer, Cmd/Ctrl+Enter to send
   - Realtime: subscribes to `sms_conversations` (all events) and `sms_messages` INSERT filtered by active conversation
   - Self-guards: hidden if not admin/instructor

6. **`src/App.tsx`** — import `MessagesAdmin`, add `<Route path="messages" />` under `/admin`.

7. **`src/components/admin/AdminSidebar.tsx`** — add **Messages** under Operations group (`MessageSquare` icon).

8. **`src/pages/instructor/InstructorLayout.tsx`** — add `NavLink` to `/admin/messages`.

## Deploy
- `receive-inbound-sms`
- `send-sms-message`

## Webhook URL (already given)
```
https://jilrijklnehbfuulykty.supabase.co/functions/v1/receive-inbound-sms?token=V2US7qk0sV1KSvLjM3_yVP14noX9VJPJ
```
POST, `application/x-www-form-urlencoded`.
