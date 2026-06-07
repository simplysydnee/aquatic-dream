---
name: Session Full Waitlist
description: Friendly "session full" fallback during enrollment — saves waitlist_requests row, emails parent + owner, offers $50 private lesson CTA
type: feature
---
When a parent tries to enroll in a swim session that is full:
- SwimEnrollment.tsx routes to step="full" instead of bouncing back with a toast.
- SessionFullFallback auto-invokes `submit-waitlist-request` edge fn.
- That fn inserts into `waitlist_requests` and fires two app emails via send-transactional-email:
  - `waitlist-confirmation` to parent (with $50 June private-lesson CTA)
  - `waitlist-owner-alert` to info@aquaticdreamsswim.com
- EnrollmentCheckout also intercepts 409 "is full" from create-checkout and calls onSessionFull so parents never see Stripe's generic "merchant" error.
- Admin tab: SwimEnrollmentsAdmin > Waitlist tab (WaitlistPanel.tsx) — status: new/contacted/enrolled/closed.
