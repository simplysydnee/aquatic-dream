

# Aquatic Dreams — Notes Fix-Up Plan

## Summary of All Changes

Your notes cover 8 areas: branding tweaks, schedule updates, enrollment constraints, page removals, QuickBooks billing integration, registration fee payment flow, admin class roster visibility, and manual enrollment/move capabilities.

---

## 1. Quick Fixes (Branding & Content)

**Navbar email**: Change `info@aquaticdreams.com` to `generalmail@aquaticdreams.com` in the top bar.

**Logo tagline**: Add "Swim, Dive, Dream" text next to or below the corner logo image in the Navbar (it already appears on the right side — this would make it visible near the logo itself).

**Swim Lessons page — lesson duration**: Add "30 minute lessons" to the blue stats block so parents know lesson length.

**Remove Safety & Community pages**: Remove both routes from `App.tsx`, remove nav links from `Navbar.tsx` and `Footer.tsx`, keep the page files but unlink them from navigation.

---

## 2. Summer Session Schedule Update

Replace the current generic time slots with the actual schedule:

**Session 1**: June 6 – June 29 (Mon/Wed), 8 lessons
**Session 2**: July 13 – August 5 (Mon/Wed), 8 lessons

**Preschool (2 classes)**: Start at 2:45 PM

**School-Age (8 time slots)**:
- 3:00, 3:30, 4:00, 4:30, 5:00, 5:45, 6:15, 6:45
- 3:00–5:00 slots: Blue and Yellow groups only
- 6:15 & 6:45 slots: Yellow and Green groups only

**Database**: Deactivate all old sessions, insert new session rows matching this exact schedule with correct age groups, swim levels, and times. Update `price_per_lesson` from $35 to $30.

---

## 3. Enrollment Constraints

**Preschool age lock**: If child is 3-5, assessment caps at Red level maximum (already works this way). Additionally, the SessionPicker must only show preschool sessions — never school-age sessions, regardless of skill assessment. This is already implemented but needs verification.

**School-age lock**: If child is 6-12, they can only see school-age sessions. Already implemented, but we should also enforce that school-age 3:00–5:00 slots only show for Blue/Yellow placements, and 6:15/6:45 only for Yellow/Green placements.

---

## 4. QuickBooks Integration (Invoicing & Payment Links)

**Yes, this is possible.** QuickBooks Online has a REST API that can:
- Create invoices programmatically
- Send invoices via email (QuickBooks sends them with a built-in "Pay Now" link)
- Track payment status

**What you'd need to provide:**
1. A QuickBooks Online account with Payments enabled
2. OAuth2 credentials (Client ID & Client Secret) from the Intuit Developer portal
3. Your QuickBooks Company ID (Realm ID)

**How it would work:**
- An Edge Function connects to QuickBooks via OAuth2
- When a parent enrolls, an invoice is created in QuickBooks for the registration fee ($45) and sent automatically to the parent's email with a payment link
- One week before lessons start, a scheduled function creates the lesson invoice (e.g., 8 lessons x $30 = $240) and emails it
- Payment status syncs back so the admin dashboard shows paid/unpaid

**Important caveat:** QuickBooks OAuth2 requires a token refresh flow (tokens expire every hour). We'd build an Edge Function that handles token storage and refresh automatically.

**Setup steps we'd implement:**
1. You create an app at developer.intuit.com and give us the Client ID, Client Secret, and Realm ID
2. We build an OAuth connect flow (one-time admin authorization)
3. We build invoice creation + email sending Edge Functions
4. We add a scheduled trigger for the "1 week before" lesson invoices

---

## 5. Registration Fee Payment Flow

**Current flow**: Parent enrolls, reg fee is noted but not collected.

**New flow**:
1. Parent completes enrollment (assessment + session pick + info + legal)
2. System automatically creates a QuickBooks invoice for $45 registration fee
3. QuickBooks emails the invoice with a "Pay Now" link
4. Admin dashboard shows payment status (paid/unpaid) pulled from QuickBooks
5. One week before Session 1 starts, system creates lesson invoice ($240 for 8 group lessons) and emails it

---

## 6. Admin — View Booked Classes

**Current state**: Admin can see all enrollments in a table, but no "by-session" roster view.

**New feature**: Add a "Class Roster" view to the admin dashboard that shows:
- Each session time slot with how many swimmers are booked vs. capacity
- Click into a slot to see the list of enrolled children with their levels
- Filter by session (Session 1 / Session 2) and age group

---

## 7. Admin — Manual Enroll & Move Swimmers

**New feature**: Add admin capabilities to:
- **Manually enroll** a swimmer into any session (bypass the public enrollment flow)
- **Move a swimmer** from one session to another (change their `session_id`)
- Both actions available from the enrollment detail view or the class roster

---

## 8. Private/Semi-Private Scheduling

**Current state**: Request form exists, goes to `lesson_requests` table.

**Enhancement**: Add guidance in the admin Lesson Requests view for how to:
- Use QuickBooks to invoice private ($65) / semi-private ($45) lessons
- The admin calendar (`pool_events`) can be used to schedule these — add a "Private Lesson" or "Semi-Private Lesson" event type option

---

## Implementation Order

1. Quick fixes (email, tagline, 30-min note, remove Safety/Community) — fast
2. Session data update (deactivate old, insert new schedule) — database work
3. Enrollment constraints (level-to-timeslot restrictions) — code update
4. Admin class roster + manual enroll/move — new admin feature
5. QuickBooks integration — requires your API credentials first, then we build it step by step

---

## Technical Detail

- Session data: ~20 new rows in `swim_sessions` (2 sessions x 10 time slots, with level assignments)
- QuickBooks: 1 new Edge Function for OAuth + invoice CRUD, 1 new secret for credentials, 1 scheduled function for weekly invoice sends
- Admin roster: New component in admin dashboard, queries `swim_enrollments` grouped by `session_id`
- Manual enrollment: New admin form that inserts directly into `swim_enrollments` + `enrollment_agreements`

