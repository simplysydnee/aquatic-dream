## Goal
1. Give you one clean, shareable URL you can text/email to private-pay families.
2. Surface that same booking flow directly on the public website (no more burying it inside the combined `/swim-enrollment?type=request` page).

## Public URL
`https://aquaticdreamsswim.com/book-private-lesson`

(Also works on preview + custom domain.)

## What the page shows
Focused, single-column page wrapped in the standard public layout (Navbar + Footer):
- Header: "Book a Private Lesson"
- Subhead: "Pick your instructor, day, and time. Save a card on file — $65 is charged the day of each lesson."
- `<PaymentTestModeBanner />` at the top
- Renders the existing `<PrivateBookingFlow />` component (instructor → slot → parent/child details → card-on-file → confirmation). The confirmation + parent-info + cancellation emails we wired up earlier already fire from this flow.
- SEO title/description set for the page.
- Small link at the bottom: "Looking for group classes or semi-private? → /swim-enrollment"

No code changes to the booking flow itself.

## Embedding on the website
1. **Navbar**: Add "Book Private Lesson" as a primary nav item (desktop + mobile menu) so visitors can reach it from anywhere.
2. **Swim Lessons page** (`/swim-lessons`): Add a "Book a Private Lesson" CTA card in the Private section that links to `/book-private-lesson` (currently the page only describes private lessons — there's no direct "book now" CTA).
3. **Home page**: Add a secondary CTA button "Book a Private Lesson" next to the existing "Enroll Now" CTA in the hero so private-pay families land in the right flow on the first click.
4. **`/swim-enrollment?type=request`**: Keep working as-is, but the "Private lessons" card on that page now also links out to the dedicated page for anyone who landed there first.

## Admin convenience
Add a "Copy private-booking link" button on the Lesson Requests admin page (`/admin/lesson-requests`) so when you reply to a family you can grab the URL with one click.

## Implementation
1. New page: `src/pages/BookPrivateLesson.tsx` — wraps `PrivateBookingFlow` in `PublicLayout` with SEO + banner.
2. Add route in `src/App.tsx`: `<Route path="/book-private-lesson" element={<BookPrivateLesson />} />`.
3. Update `src/components/Navbar.tsx` — add the nav item (desktop + mobile).
4. Update `src/pages/SwimLessons.tsx` — add the "Book a Private Lesson" CTA in the Private section.
5. Update `src/pages/Index.tsx` — add the secondary hero CTA.
6. Update `src/pages/admin/LessonRequestsAdmin.tsx` — add the copy-link button.

## Out of scope
- No new database tables, no new edge functions.
- No change to pricing, payment timing, or the private-booking UX itself.
- No change to how semi-private requests are handled.