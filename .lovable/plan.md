# New message notifications — nav badge and toast

Two independent signals for inbound family texts only: a persistent per-staff unread badge on the Messages nav item, and an ephemeral grouped toast while the app is open.

## Where the nav item lives today

`src/components/admin/AdminSidebar.tsx` line 66 defines `{ title: "Messages", url: "/admin/messages", icon: MessageSquare, badge: 0 }`. Badge values come from `src/hooks/useAdminBadgeCounts.ts`, which today only returns new group enrollments and new private bookings and refreshes on a 60s interval.

## Per-person read tracking

New table `sms_conversation_reads`: conversation id, user id, last read at, unique on (conversation, user). Staff can read and write only their own rows.

A conversation is unread for a staff member when it has an inbound message newer than that person's last read timestamp for it, or when that person has no row for it at all.

A database function `unread_sms_conversation_count()` returns the count for the caller, so the badge is one cheap call instead of client-side joins.

## 1. Clearing on open

When the Texts sub-tab inside a specific client's Messages tab mounts (and when a new inbound arrives while it is open), upsert that staff member's read row for that conversation to now, then refresh the badge. Nothing else clears it. Opening `/admin/messages` clears nothing.

## 2. Nav badge

`useAdminBadgeCounts` gains `unreadTexts`, sourced from the new function. It recomputes on initial load, on the existing interval, and immediately on any realtime inbound insert. `AdminSidebar` renders it on the Messages item.

## 3. Toast

A new provider mounted in `src/pages/admin/AdminLayout.tsx` subscribes once for the whole admin area. On an inbound insert it buffers for 4 seconds, then:

- one message: toast titled with the family name and a short body preview
- several: one grouped toast, "3 new texts from 2 families"

Clicking the toast opens the matching client drawer on the Texts tab, which clears that conversation for that user. Matching resolves the conversation phone against the swimmer list already loaded by `SwimmerModalProvider`; if no swimmer matches, the toast navigates to `/admin/messages` instead. Outbound rows never toast, since the subscription filters to inbound.

## 4. Realtime

`sms_messages` is already in the realtime publication. One subscription filtered to `direction=eq.inbound` drives both the badge recompute and the toast buffer, torn down on unmount.

## Technical details

- Migration: create `sms_conversation_reads` with grants for authenticated and service_role, RLS restricted to `user_id = auth.uid()`, an updated-at trigger, plus `unread_sms_conversation_count()` and `mark_sms_conversation_read(conversation_id)` as security definer functions scoped to the caller and gated on the admin or instructor role.
- `SwimmerDetailDrawer` gets an optional `initialTab` prop so the drawer can open directly on Messages; `CommunicationsTab` gets an optional `initialSubTab` so it can land on Texts.
- `SwimmerModalProvider` gains an optional tab argument on `open()` and exposes a phone lookup so the toast can jump straight to the right family.
- `TextsThread` calls `mark_sms_conversation_read` on mount, on conversation change, and after each realtime inbound, then notifies the badge hook to refetch via a lightweight event.
- New files: the migration, `src/components/admin/InboundSmsNotifier.tsx`, and a small `src/hooks/useUnreadTexts.ts` if the badge logic outgrows `useAdminBadgeCounts`.

## Verification

Simulate an inbound row for a known family and confirm the badge increments and one toast appears; insert two inbound rows two seconds apart and confirm a single grouped toast; open the client's Texts tab as one user and confirm only that user's read row is written; trigger a reminder send and confirm no badge change; reload and confirm unread state persists.
