## Goal

1. Send the existing "June Private Lessons – $50 Special" campaign to **anapaulajimenez@gmail.com** (Armani Eshaq's parent on file).
2. In the swimmer drawer **Messages** tab, add a per-email **Resend** action that pre-fills Compose, plus a dedicated **"Send fresh payment link"** action that regenerates Stripe URLs for emails that contain them (welcome / session payment / registration fee).

---

## Part 1 — Send campaign to Armani

The `send-marketing-campaign` edge function already accepts `test_email`, which renders and sends the exact campaign body to one address without touching campaign recipient state. No new template needed.

Steps (one-shot, runs in build mode):
- Invoke `send-marketing-campaign` with `{ campaign_id: "d1a373a5-2b75-4c40-bfaa-bddb2705030d", test_email: "anapaulajimenez@gmail.com" }`.
- Verify a row appears in `email_send_log` for that address.

(No code change required — this is a one-time admin action triggered from the agent.)

---

## Part 2 — Messages tab upgrades

File: `src/components/admin/swimmer/tabs/CommunicationsTab.tsx` (already lists every email sent to `swimmer.parent_email` from `email_send_log`).

### A. Resend (pre-fill Compose)
- Add a `Resend` button on each log row.
- On click: pull `metadata.subject` and `metadata.html` from the log row, strip the appended unsubscribe footer, convert the HTML body to plain text (simple `html-to-text` via regex / DOM parser), and load it into the existing Compose subject + body fields.
- Admin tweaks then clicks **Send email** — this already invokes `send-transactional-email` with the `admin-freeform` template, so it ships as a clean new send under the admin's name.

### B. "Send fresh payment link" (regenerates Stripe URL)
- Show this secondary action only when `template_name` is one of:
  - `session-welcome` → call `send-session-welcome-email`
  - `session-payment-link` → call `send-session-payment-link`
  - `registration-fee-payment-link` → call `send-registration-fee-payment-link`
- Each of those edge fns already creates a fresh Stripe Checkout URL and emails it.
- Required arg is the related `enrollment_id`. Resolve it by looking up the most recent `swim_enrollments` row for `swimmer.parent_email` + `swimmer.child_name` (the swimmer drawer already has both). If multiple, prompt admin to pick from a small dropdown.
- On success, toast and refresh the log.

### C. Small polish
- Disable the Resend button while sending.
- Add a tooltip on "Send fresh payment link" explaining it generates a new Stripe checkout URL (the old one may have expired or been completed).

---

## Out of scope

- Building a generic "regenerate any link" engine — only the three known payment templates above.
- Editing the marketing campaign content.
- Adding a new transactional template for the June $50 promo (the campaign already exists).
