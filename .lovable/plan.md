# Text messages per client

Goal: every text sent to or received from a family shows up in that client's Messages tab, and staff can reply from there.

## Current state (verified)

- There is already an SMS inbox at `/admin/messages` (`sms_conversations` + `sms_messages`), with realtime updates and a reply composer.
- Only two edge functions write to those tables: `send-sms-message` (staff replies) and `receive-inbound-sms` (incoming). Every other SMS sender (reminders, payment links, hold invites, outreach, card update links, welcome texts) sends through TextMagic without recording a conversation row, so client text history is largely empty today.
- The client detail drawer has a "Messages" tab (`CommunicationsTab`), which currently shows email log rows only.

## What to build

### 1. Log every outbound text
Add conversation logging inside the shared TextMagic helper so any function that sends a text automatically:
- finds or creates the `sms_conversations` row for that phone number (matching the existing name-lookup behavior),
- inserts an outbound `sms_messages` row with the body, status, and a `kind` label (reminder, payment link, hold invite, outreach, staff reply, card update),
- updates the conversation preview and timestamp.

Then switch the remaining SMS senders over to the shared helper so nothing bypasses logging. Sends must not fail if logging fails.

### 2. Texts inside the client Messages tab
Split the client Messages tab into two sub-sections: Email (existing log, unchanged) and Texts (new).

The Texts section shows the conversation for the client's phone number as a chat thread (inbound left, outbound right, timestamps, kind label, failed-send indicator), with a reply box that sends through the existing staff-send function. It refreshes in realtime like the inbox does. If the client has no phone on file, show a short note instead. If the client has more than one phone across their records, show each thread.

### 3. Tie the inbox to clients
On `/admin/messages`, when a conversation's phone matches a known family, show the parent name and a link that opens that client's detail drawer on the Texts tab, so the standalone inbox and the client view stay in sync.

## Technical notes

- New column `kind` (text, nullable) on `sms_messages`, plus an index on `sms_messages(conversation_id, created_at)` and on `sms_conversations(parent_phone)` if not present. No renames, no RLS policy changes.
- Logging helper lives in `supabase/functions/_shared/sms-log.ts` and is called from `_shared/textmagic.ts` `sendSms`, using the service role client already available in those functions.
- Client-side phone matching reuses the existing normalization (last 10 digits, `+1` variants) already used by `receive-inbound-sms`.
- Frontend work: new `TextsThread` component under `src/components/admin/swimmer/tabs/`, wired into `CommunicationsTab`; reply path uses `supabase.functions.invoke("send-sms-message")`, no direct writes.
