

## Mobile-Friendly Enrollment Flow + Scroll-to-Top

### Problems identified
1. **No scroll-to-top on step change** — after selecting a session/time, the page stays scrolled down and users can't see the next step's content
2. **Step indicator overflows on mobile** — 6 steps with circles and labels crowd out on small screens
3. **Button rows can overflow** — "Retake Assessment" + "Continue to Sessions" buttons on the result card, and nav buttons throughout, can run off-screen on narrow viewports
4. **Session cards layout** — time/spots info crams horizontally on small screens

### Changes

**1. Add ScrollToTop component + scroll on step change (`SwimEnrollment.tsx`)**
- Create `src/components/ScrollToTop.tsx` that scrolls to top on route change
- Add it inside `BrowserRouter` in `App.tsx`
- Additionally, add `window.scrollTo({ top: 0 })` inside `SwimEnrollment.tsx` whenever `step` changes (via a `useEffect` on `step`) — this handles in-page step transitions that don't change the route

**2. Mobile-friendly step indicator (`SwimEnrollment.tsx`)**
- On mobile (`sm:` breakpoint), show only the current step number/label and a compact progress bar instead of all 6 circles
- Keep the full step circles on `sm:` and above
- Use responsive classes: hide individual step labels on mobile (already partially done with `hidden sm:block`), but also shrink circle sizes and gap

**3. Fix button overflow in SwimAssessment result card**
- Change `flex gap-3` to `flex flex-col sm:flex-row gap-3` so buttons stack vertically on mobile
- Ensure buttons are `w-full sm:w-auto`

**4. Fix SessionPicker mobile layout**
- Session slot cards: stack time and spots vertically on very small screens using `flex-wrap`
- "Back" / "Continue" buttons: ensure they don't overflow with `flex-wrap` and proper sizing
- Registration fee banner: allow text to wrap properly

**5. Fix EnrollmentForm button row**
- "Complete Enrollment" button text can be long — ensure it wraps or shrinks on mobile
- Add `flex-wrap` safety to the button container

**6. Fix LegalAgreements mobile**
- Emergency contact fields grid: ensure `grid-cols-1` on mobile, `sm:grid-cols-2` on larger

**7. Fix EnrollmentCheckout mobile**
- Ensure the Stripe embedded checkout container doesn't overflow on small screens

### Files modified
- `src/components/ScrollToTop.tsx` (new)
- `src/App.tsx` — add ScrollToTop
- `src/pages/SwimEnrollment.tsx` — scroll-to-top on step change, responsive step indicator
- `src/components/swim-enrollment/SwimAssessment.tsx` — stack result buttons on mobile
- `src/components/swim-enrollment/SessionPicker.tsx` — responsive slot cards and buttons
- `src/components/swim-enrollment/EnrollmentForm.tsx` — responsive button row
- `src/components/swim-enrollment/LegalAgreements.tsx` — responsive grid
- `src/components/swim-enrollment/EnrollmentCheckout.tsx` — responsive container

