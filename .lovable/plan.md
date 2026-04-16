

## Brand Auth Email Templates for Aquatic Dreams

The auth email templates have been scaffolded. Now I need to apply the Aquatic Dreams brand styling and deploy.

### Brand tokens to apply
- **Primary (buttons)**: Teal `#5badcb`
- **Heading color**: Navy `#0f2343`
- **Body text**: `#333333`
- **Muted/footer text**: `#888888`
- **Border radius**: `8px`
- **Heading font**: `'Playfair Display', Georgia, serif`
- **Body font**: `'Plus Jakarta Sans', Arial, sans-serif`
- **Accent line**: Teal `#5badcb` (matches existing transactional template)
- **Background**: White `#ffffff`

### Changes to all 6 templates
Update style objects in each file under `supabase/functions/_shared/email-templates/`:

1. **signup.tsx** — Update colors, fonts, add `Hr` divider matching transactional style, change heading to "Aquatic Dreams", update copy tone
2. **recovery.tsx** — Same brand styling, keep password reset copy
3. **magic-link.tsx** — Same brand styling
4. **invite.tsx** — Same brand styling
5. **email-change.tsx** — Same brand styling
6. **reauthentication.tsx** — Same brand styling, keep OTP code styling with navy

Each template gets:
- Navy `#0f2343` headings in Playfair Display
- Teal `#5badcb` buttons with white text
- Teal `#5badcb` horizontal rule (2px, matching transactional template)
- Body text in Plus Jakarta Sans
- Container max-width 560px, matching transactional template layout
- Consistent padding/spacing matching `session-payment-link.tsx`

### Deployment
Deploy `auth-email-hook` edge function after styling.

### Files modified
- `supabase/functions/_shared/email-templates/signup.tsx`
- `supabase/functions/_shared/email-templates/recovery.tsx`
- `supabase/functions/_shared/email-templates/magic-link.tsx`
- `supabase/functions/_shared/email-templates/invite.tsx`
- `supabase/functions/_shared/email-templates/email-change.tsx`
- `supabase/functions/_shared/email-templates/reauthentication.tsx`

