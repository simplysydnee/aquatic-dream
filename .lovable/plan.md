## Update june-lesson-email.html to match standard email branding

Rebuild `/mnt/documents/june-lesson-email.html` so its header and footer match the existing transactional email templates (e.g. `lesson-booking-confirmation.tsx`) used for all booking/payment emails.

### Header (match standard)
- Centered Aquatic Dreams logo image: `https://jilrijklnehbfuulykty.supabase.co/storage/v1/object/public/email-assets/aqd-email-logo.jpg` (80×80)
- "Aquatic Dreams" wordmark in Playfair Display 24px, color `#0f2343`
- Horizontal rule in `#5badcb`, 2px

### Body (keep current content)
- June schedule live announcement
- Lesson details ($65, 30-min, recurring option, schedule window)
- Coral "Book Your Lessons" CTA → `https://aquaticdreamsswim.com/book-private-lesson`
- Payment / cancellation policy block (use `policyBox` light-gray styling)
- Small-group classes mention
- Parent Information block styled as the orange `parentInfoBox` used in transactional emails

### Footer (match standard)
- `#5badcb` 2px hr divider
- "Questions? Reach us at info@aquaticdreamsswim.com or (209) 577-3483."
- 1212 Kansas Ave, Modesto, CA line
- Sign-off: "See you at the pool! — The Aquatic Dreams Team" in muted gray (`#888`, 13px)

### Typography & color tokens (from standard template)
- Body font: Plus Jakarta Sans
- Heading font: Playfair Display
- Primary blue: `#5badcb` (links, CTA, dividers)
- Deep navy: `#0f2343` (headings)
- Coral accent retained only for the primary CTA button to keep visual identity, all other accents use the standard palette

No code changes — only the artifact file is updated. Same filename so the open preview refreshes.