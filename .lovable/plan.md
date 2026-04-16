

## Fix Email Branding: "Aquatic Dreams" Name + Logo

### Problem
- `SITE_NAME` in `auth-email-hook/index.ts` and `send-transactional-email/index.ts` is set to `"aquatic-dream-quest"` (the Lovable project slug) instead of `"Aquatic Dreams"`
- No logo in any email templates
- `session-payment-link.tsx` still references `generalmail@aquaticdreams.com` instead of `info@aquaticdreamsswim.com`

### Changes

**1. Upload logo to storage**
- Copy the uploaded `AQD_Favicon.png` to a storage bucket (`email-assets`) so it can be referenced via public URL in email templates

**2. Fix SITE_NAME in edge functions**
- `supabase/functions/auth-email-hook/index.ts`: Change `SITE_NAME` from `"aquatic-dream-quest"` to `"Aquatic Dreams"`
- `supabase/functions/send-transactional-email/index.ts`: Same change

**3. Add logo + fix email to all 6 auth templates**
Update each template in `supabase/functions/_shared/email-templates/` (signup, recovery, magic-link, invite, email-change, reauthentication):
- Add an `Img` component at the top of the container showing the Aquatic Dreams logo (centered, ~80px width)
- Import `Img` from `@react-email/components`

**4. Add logo + fix email in transactional template**
- `session-payment-link.tsx`: Add logo, change `generalmail@aquaticdreams.com` to `info@aquaticdreamsswim.com`

**5. Deploy**
- Deploy `auth-email-hook` and `send-transactional-email` edge functions

### Files modified
- `supabase/functions/auth-email-hook/index.ts`
- `supabase/functions/send-transactional-email/index.ts`
- `supabase/functions/_shared/email-templates/signup.tsx`
- `supabase/functions/_shared/email-templates/recovery.tsx`
- `supabase/functions/_shared/email-templates/magic-link.tsx`
- `supabase/functions/_shared/email-templates/invite.tsx`
- `supabase/functions/_shared/email-templates/email-change.tsx`
- `supabase/functions/_shared/email-templates/reauthentication.tsx`
- `supabase/functions/_shared/transactional-email-templates/session-payment-link.tsx`

