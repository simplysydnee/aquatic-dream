

## Send Test Early Access Invitation Email

### What we're doing
1. Create a branded HTML email template (`early-access-invite.tsx`) matching your existing Aquatic Dreams email style, with an "Enroll Now" button linking to the enrollment page
2. Register it in the template registry
3. Deploy the updated edge functions
4. Send one test email to sydneesmerchant@gmail.com with `parentName: "Sydnee"`

### The email content
- Personalized greeting ("Hi Sydnee,")
- Your exact copy about early access enrollment being open
- Prominent **Enroll Now** button → `https://aquatic-dream-quest.lovable.app/swim-enrollment`
- Feedback request and Sutton Lucas sign-off
- Aquatic Dreams branding (logo, maritime colors, same layout as your confirmation emails)

### Files
- **New**: `supabase/functions/_shared/transactional-email-templates/early-access-invite.tsx`
- **Modified**: `supabase/functions/_shared/transactional-email-templates/registry.ts` (add new entry)
- **Redeployed**: `send-transactional-email`

### After approval
Once you confirm the test email looks good, I'll send to the full list of 9 parents.

