

# Aquatic Dreams Swim Program Overhaul

## What's Changing

Based on the owner's updated notes, the swim program structure, pricing, enrollment flow, and site messaging all need significant updates.

---

## 1. Updated Level & Group Structure

**Preschool (Ages 3-5)** — separate from school-age
- **White (Comfort)** — water comfort & safety intro
- **Red (Swim School)** — submersion, beginning floating

**School-Age (Ages 6-12)**
- **Group 1: White/Red (Beginner)** — mixed together in one group
- **Group 2: Yellow (Intermediate)** — independent floating, treading water
- **Group 3: Green/Blue (Advanced)** — stroke development, endurance

**Removed:** Stroke School level entirely (no more purple level cards, no PADI bridge references)

---

## 2. Pricing Structure

| Type | Price |
|------|-------|
| Group lesson | $30/lesson |
| Semi-private | $45/lesson |
| Private | $65/lesson |
| Registration fee | $45 (one-time) |

- Registration fee includes swim bag, swim cap, goggles
- Group lessons book through normal enrollment flow
- Private/semi-private = request form that sends email alert + admin dashboard notification

---

## 3. Scheduling Updates

- Preschool and school-age time slots staggered by 15 minutes (to reduce parking congestion)
- June and July sessions, 2 days/week, plus some single-lesson options
- Exact slot times TBD — will use the existing 8-slot structure but offset preschool vs school-age

---

## 4. Messaging & Branding Changes

- Remove all "pathway from water comfort to PADI certification" language
- Remove the "From Pool to Ocean" / PADI bridge section from Swim Lessons page
- Remove Stroke School references everywhere
- Add Instagram handle: @aquaticdreamswim
- Add future CTA linking to aquaticdreams.swim.com (placeholder until domain is ready)
- Keep scuba pages and links as-is, but decouple from swim curriculum

---

## Implementation Steps

### Step 1: Database Migration
- Remove `stroke-school` as a valid swim level across seed data
- Update `swim_sessions` — remove Stroke School sessions, update age groups to reflect new structure (preschool 3-5, school-age 6-12 replacing the old 5-8 and 7+ groups)
- School-age White/Red share sessions (single group), Yellow gets own group, Green/Blue share a group
- Add `lesson_type` column to enrollment or create pricing config (group/semi-private/private)

### Step 2: Update Types & Assessment
- Remove `stroke-school` from `SwimLevel` type
- Update `AgeGroup` to `"preschool-3-5" | "school-age-6-12"`
- Remove the `completedGreen` assessment question
- Update `getAgeGroup()` — ages 3-5 = preschool, ages 6-12 = school-age
- Assessment decision tree stops at Green/Blue (no Stroke School path)
- Update `LEVEL_DISPLAY` and `LEVEL_BADGE_COLORS` — remove stroke-school entries

### Step 3: Update Swim Lessons Page
- Remove Stroke School card (keep 5 levels: White, Red, Yellow, Blue, Green)
- Update age labels: White/Red = "Ages 3-12", Yellow = "Ages 6-12", Blue/Green = "Ages 6-12"
- Remove "PADI intro pathway" from Green card skills
- Delete the entire "From Pool to Ocean" PADI bridge section
- Update hero text — remove "pathway from water comfort to PADI certification"
- Update pricing stats: show $30 group / $45 semi-private / $65 private + $45 reg fee
- Update "6 Progressive Levels" heading to "5 Progressive Levels"
- Add note about registration fee including swim bag, cap, goggles

### Step 4: Update Session Picker
- Update shared-level logic: Green/Blue share sessions (instead of Yellow/Blue/Green/Stroke School)
- School-age White/Red also share sessions (new — currently separate)
- Update age group filtering for new 3-5 / 6-12 split
- Update pricing display from $35 → $30 for group lessons
- Show registration fee ($45) as additional line item

### Step 5: Update Enrollment Flow
- Remove Stroke School from all dropdowns and displays
- Update age validation (3-12 range)
- Show pricing breakdown: lesson cost + $45 registration fee
- Group lessons → normal enrollment
- Add "Request Private/Semi-Private Lesson" option that triggers email to admin + creates admin dashboard alert

### Step 6: Add Private/Semi-Private Request Form
- New request form (simpler than full enrollment) — parent name, email, phone, child name, age, preferred type (private or semi-private), preferred times, notes
- On submit: insert into a new `lesson_requests` table + send email notification to admin
- Admin dashboard: new section or tab showing incoming private/semi-private requests

### Step 7: Site-Wide Cleanup
- Remove all PADI-swim bridge language across pages (Index, SwimLessons, etc.)
- Add @aquaticdreamswim Instagram link in footer or relevant sections
- Prepare placeholder CTA for aquaticdreams.swim.com domain

---

## Technical Detail

- The `SessionPicker` currently maps Yellow/Blue/Green/Stroke School → query `yellow` sessions. New logic: school-age White/Red → query `white` sessions (shared group), Green/Blue → query `green` sessions (shared group), Yellow stays standalone
- Assessment tree shortens from 5 questions to 4 (remove `completedGreen`)
- New `lesson_requests` table needs RLS: public INSERT, authenticated SELECT/UPDATE
- Private/semi-private email notification uses existing transactional email infrastructure

