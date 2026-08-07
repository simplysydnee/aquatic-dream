# Text messages per client

Goal: every text our own system sends or receives shows up in that family's Messages tab, staff reply from there, and the team can move off the TextMagic dashboard.

## Answer to your FIRST question: does the staff reply function know who is sending?

Yes. `send-sms-message` already requires an `Authorization` bearer token, verifies the claims, and rejects anyone who is not an admin or instructor. It already writes the sender's user id into an existing `sent_by` column on `sms_messages` (that column exists today and is a user id, not a name).

So this is a logging change, not an auth change. What's missing is only a human-readable label: user ids can't be shown in the thread, and automated sends have no user at all.

## Current state (verified)

- `sms_conversations` and `sms_messages` exist and power `/admin/messages`, with realtime updates and a reply box.
- `sms_messages` columns today: direction, body, `sent_by` (user id), status, error, textmagic_message_id, created_at. There is no `kind` and no name label.
- Only `send-sms-message` (staff replies) and `receive-inbound-sms` (incoming) write to these tables. Every other sender (reminders, payment links, hold invites, outreach, card update links, welcome texts) goes straight to TextMagic and is never recorded, so client text history is nearly empty today.
- The client drawer's Messages tab (`CommunicationsTab`) shows email only.

## What to build

### 1. Log every outbound text sent through our functions
A shared logging helper, called from `sendSms`, will for each send:
- find or create the conversation for that phone number (same name lookup the inbound webhook uses),
- insert an outbound message row with body, status, error, `kind`, and `sent_by_label`,
- update the conversation preview, direction, and timestamp.

Then move every remaining SMS sender onto the shared helper so nothing bypasses logging. Logging failures are swallowed: a text never fails because the log write failed.

This covers our backend only. Anything typed into the TextMagic dashboard never touches our code and cannot be captured.

### 2. Who sent it
New `sent_by_label` (text) on `sms_messages`, always populated:
- staff reply: the logged-in admin's display name, resolved server-side from their profile (the existing `sent_by` user id stays as the machine-readable record),
- automated send: an explicit system label naming the source, for example "System — 24h reminder", "System — hold invite", "System — payment link". Never blank, never inferred.

### 3. Kind label on every message
New `kind` (text) on `sms_messages`: reminder, payment_link, hold_invite, outreach, staff_reply, card_update, welcome, inbound. Each sender passes its own value.

The thread renders everything chronologically in one list, inbound and outbound together, each row carrying its kind chip and sender name. No collapsing, no separate automated feed.

### 4. Texts in the client Messages tab
The Messages tab splits into Email (unchanged) and Texts.

Texts renders the conversation for the client's phone as a chat thread: inbound left, outbound right, timestamp, kind chip, sender name, and a clear marker on failed sends. A reply box at the bottom sends through `send-sms-message`. Realtime updates like the inbox. No phone on file shows a one-line note. Multiple phones across the family's records show one thread per phone.

No compose-new action anywhere in this tab.

### 5. Transition warning
A persistent banner at the top of the Texts section, shown every view, not dismissible:

"Messages sent directly through TextMagic may not appear here. During the transition, check TextMagic for anything sent outside this app."

Controlled by a single constant so it can be deleted in one edit once TextMagic is retired.

### 6. Inbox tied to clients
On `/admin/messages`, conversations whose phone matches a known family show the parent name plus a link that opens that client's detail drawer on the Texts tab.

## Out of scope

- Backfilling texts sent from the TextMagic dashboard before this ships.
- Any other TextMagic dashboard feature; send and read are all that's in use.

## Technical notes

- Migration: add `kind` (text, null) and `sent_by_label` (text, null) to `sms_messages`; add index on `sms_messages(conversation_id, created_at)` and on `sms_conversations(parent_phone)` if absent; add `sms_messages` to the realtime publication if it isn't already. No renames, no RLS changes.
- New `supabase/functions/_shared/sms-log.ts`, called from `_shared/textmagic.ts` `sendSms`, using the service-role client the callers already hold. `sendSms` gains an optional context argument (kind, label, admin client); callers without it still send, just unlogged, until each is switched over.
- `send-sms-message` resolves the admin's display name from their profile and passes it as `sent_by_label`.
- Phone matching reuses the existing normalization (last 10 digits, `+1` variants).
- Frontend: new `TextsThread` component under `src/components/admin/swimmer/tabs/`, wired into `CommunicationsTab`; replies go through `supabase.functions.invoke("send-sms-message")`, no direct table writes.

## Verification

- A reminder sent by any function creates or updates the right conversation with kind and sender label set.
- A staff reply from the Texts tab logs the real admin name.
- An inbound reply still logs exactly as today.
- The transition banner shows on every view of the Texts tab.
- `/admin/messages` links a matched conversation to that client's Texts tab.
- A client with no phone shows the short note instead of an empty thread.
