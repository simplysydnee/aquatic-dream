## Kiosk Check-In Redesign

Remove the PIN gate and the two-step (session → roster) flow. Parents land on one screen with every group for today, find their child's name, and tap **Check In**.

### Changes to `src/pages/KioskCheckIn.tsx`

1. **Remove PIN authentication** entirely (drop `KIOSK_PIN`, `pin` state, `authenticated` state, and the PIN screen). Kiosk loads straight into today's lessons.

2. **Remove the drill-down step** (`selectedSession` state and the per-session screen). Show all of today's groups stacked vertically on one screen.

3. **Auto-sort by time-of-day so the active/next class stays at the top:**
   - Sessions that are **currently happening** (now is between start/end) → top, with a "Now" badge and subtle highlight.
   - **Upcoming** sessions next, in time order.
   - **Finished** sessions (end time has passed) → drop to the bottom, dimmed/collapsed.
   - Re-evaluate every 60s via a `setInterval` so the order shifts down automatically as the day progresses.

4. **Each group card shows:**
   - Time + level badge as the header
   - List of children in that group, each as a large tap target with a **Check In** button (or a green ✓ "Checked in at h:mm a" once tapped)
   - No back button needed — everything is on one screen

5. **Admin exit:** small "Exit kiosk" link in the corner that navigates back to `/admin` (replaces the PIN as the lock — admin already needs to be on the device to leave).

6. **Auto-refresh attendance** every 30s so check-ins from other devices appear without a manual reload.

### Out of scope
- No changes to the `attendance` table or check-in write logic (still upserts the same row).
- No parent accounts / PINs / name lookup — the screen is trusted because it lives on a staff-controlled iPad at the front desk.

### One thing to confirm
When a class **finishes**, should it:
- (a) stay visible at the bottom, dimmed, until midnight, **or**
- (b) disappear from the kiosk entirely?
