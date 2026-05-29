Add scroll-to-top behavior in the private lesson booking flow so the page jumps to the top whenever the user advances (or goes back) between steps.

### What to change
1. **`src/components/private-lessons/PrivateBookingFlow.tsx`**  
   Add a `useEffect` that calls `window.scrollTo({ top: 0, behavior: "smooth" })` whenever the `step` state changes, mirroring the existing behavior in the group enrollment flow (`SwimEnrollment.tsx`).

### Out of scope
- Internal scrolling inside `SlotPicker` (calendar, time lists, etc.).
- Any other flows or pages.

This is a one-line `useEffect` addition in a single file.