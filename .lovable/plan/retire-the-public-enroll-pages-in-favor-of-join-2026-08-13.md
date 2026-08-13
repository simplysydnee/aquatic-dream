# Retire the public enroll pages in favor of Join

Swimberships are the only public option now, so every public path that still points at session-based enrollment or the private lesson request page should land on `/join` instead.

## What changes for families

- The nav links "Enroll" and "Book Private" are replaced by a single "Join" link, and the "Enroll Now" buttons (desktop, mobile menu, footer) become "Join".
- Anyone who visits `/swim-enrollment` or `/book-private-lesson` (old bookmarks, old text links, the link printed on the SMS terms page) is redirected straight to `/join`, keeping any `?src=` tracking parameter so welcome-back and outreach attribution still work.
- Leftover in-page buttons that pushed people to the private booking flow (session full and level full fallback screens, the private lesson mention on the landing page) point to `/join`.
- The SMS terms page shows the join URL instead of the old enrollment URL.

## What stays the same

- Admin: front desk booking, private lessons admin, class times, memberships, holds, and the lesson requests page keep working exactly as they do today.
- Historical data views (`/admin/enrollments`, rosters, sessions) are untouched.
- Waiver pages, check-in kiosk, and all shared components under `components/swim-enrollment/` (types, legal content, agreement text) stay in place since the membership flow depends on them.

## Technical notes

- `src/App.tsx`: replace the `/swim-enrollment` and `/book-private-lesson` routes with a small redirect element that navigates to `/join` (preserving search params), and drop the now unused page imports.
- Keep `src/pages/SwimEnrollment.tsx` and `src/pages/BookPrivateLesson.tsx` files in the repo (unreferenced) rather than deleting, so nothing else that imports their sub-components breaks; only routes are removed.
- Update link targets in `src/components/Navbar.tsx`, `src/components/Footer.tsx`, `src/pages/Index.tsx`, `src/pages/SmsTerms.tsx`, `src/components/swim-enrollment/SessionFullFallback.tsx`, `src/components/swim-enrollment/LevelFullScreen.tsx`.
- Verify by loading `/swim-enrollment` and `/book-private-lesson` in the preview and confirming both land on `/join`, and that no public nav or footer link still references the old paths.
