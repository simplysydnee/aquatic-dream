# Swim Program Overhaul — Final Plan

## Summary

Replace the ocean-themed 5-level system with the **Starfish Aquatics color-level system**, update scheduling to summer M/W format, change class size to 3, and add pricing.

---

## New Level Structure

| Level | Placement Criteria | Age Groups |
|-------|-------------------|------------|
| **White** | Cannot submerge relaxed 5 sec | Preschool (3–5) + School-age (5–8) |
| **Red** | Can submerge 5 sec, can't float independently | Preschool (3–5) + School-age (5–8) |
| **Yellow** | Can float front/back, can't tread water 10 sec | 7+ |
| **Blue** | Can tread water 10 sec, can't side-roll-side kick 10M | 7+ |
| **Green** | Can do side-roll-side kick, hasn't completed all skills | 7+ |
| **Stroke School** | Completed Green / Learn to Swim | 7+ (must complete Green first) |

- White and Red are **separate levels** with their own assessment placement
- Yellow/Blue/Green share class time but kids are placed at their specific level
- Stroke School requires Green completion — shown in enrollment but noted as requiring completion
- **3 students max** per group

---

## Schedule & Pricing

- **Days**: Monday / Wednesday only
- **Session 1**: June 8 – July 1 | **Session 2**: July 13 – August 2
- **8 lessons** per session at **$35/lesson = $280 total**
- **Time slots**: 2:45, 3:15, 3:45, 4:15, 4:45, 5:30, 6:00, 6:30

---

## Implementation Steps

### 1. Database Migration
- Add columns to `swim_sessions`: `session_name`, `session_start_date`, `session_end_date`, `age_group`, `price_per_lesson` (default 35), `total_lessons` (default 8), `session_price` (default 280)
- Change `max_students` default from 4 → 3
- Delete old seed data, insert new sessions: 8 time slots × 5 groups (White/Red preschool, White/Red school-age, Yellow/Blue/Green 7+) × 2 session periods = 80 session rows
- Update `swim_level` to use new color values

### 2. New Color-Coded Badge Assets
- Create simple, clean SVG badges for each color level (White, Red, Yellow, Blue, Green, Stroke School) using the brand color palette
- Replace the ocean-themed badge imports throughout

### 3. Update Types & Assessment (`types.ts`, `SwimAssessment.tsx`)
- New `SwimLevel`: `"white" | "red" | "yellow" | "blue" | "green" | "stroke-school"`
- Replace 5-question scoring quiz with Starfish **decision tree**:
  1. Age → determines group eligibility
  2. "Can your child submerge relaxed for 5 seconds?" → No = **White**
  3. "Can your child float (front & back) without support?" → No = **Red**
  4. "Can your child tread water for 10 seconds?" → No = **Yellow**
  5. "Can your child side-roll-side kick drill 10M/30ft?" → No = **Blue**
  6. "Has your child completed all Green-level skills?" → No = **Green**, Yes = **Stroke School**

### 4. Update Session Picker (`SessionPicker.tsx`)
- Group sessions by Session 1 / Session 2
- Filter by age group (preschool / school-age / 7+ based on age and level)
- Show pricing: "$35/lesson · $280 for 8-lesson session"
- Show "3 spots" capacity
- Show days as "Mon & Wed" instead of individual days

### 5. Update Swim Lessons Page (`SwimLessons.tsx`)
- Replace 5 ocean-themed cards with 6 color-level cards
- Update schedule grid to M/W only with 8 time slots
- Change "Max 4" → "Max 3" everywhere
- Add pricing section ($35/lesson, $280/session)
- Update PADI bridge to reference Stroke School → PADI pathway

### 6. Update Enrollment Form & Confirmation
- Reflect new level names and colors
- Show session period (Session 1 or 2) and pricing in confirmation
- Note for Stroke School: "Requires completion of Green level"

---

## Technical Detail

The assessment becomes a simple sequential elimination rather than a scored quiz. Each question maps to a Starfish criterion — the first "No" answer determines placement. This is more accurate to how swim instructors actually evaluate students and matches the official Starfish matrix exactly.

The age question routes to the correct class grouping:
- Ages 3–5 → White/Red preschool groups
- Ages 5–8 → White/Red school-age groups  
- Ages 7+ → Yellow/Blue/Green group (or Stroke School if qualified)
- Ages 5–7 overlap: could qualify for either White/Red school-age or Yellow+ depending on skill