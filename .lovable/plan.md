

# Aquatic Dreams — Full Aquatic Campus Web App

**"Swim. Dive. Dream."** — A modern, mobile-first website for Modesto's only full aquatic campus, where a 3-year-old can start swim lessons and grow all the way to PADI Instructor.

---

## Brand & Design System

- **Colors:** Ocean Teal (#0B9DAB), Coral (#E8674A), Navy (#0D2B45), Warm Sand (#F7F3EE)
- **Typography:** Premium serif display headings + clean sans-serif body
- **Logo:** The uploaded Aquatic Dreams Scuba Center logo (diver variant) used in the header; the 5 ocean creature level badges (Pearls, Reef Explorers, Sharks, Sea Turtles, Octopus Elite) used in the swim section
- **Tone:** Warm, trustworthy, adventurous, community-rooted

---

## Phase 1 — Homepage + Core Pages (Frontend)

### 🏠 Homepage
- Full-width hero with animated wave/bubble effects, "Swim. Dive. Dream." headline
- Dual CTAs: "Enroll in Swim Lessons" (coral) + "Start Your PADI Journey" (navy ghost)
- Stats block (2–4 students per instructor, PADI 5★ IDC Center, etc.)
- Two equally-weighted feature panels: Swim Lessons & Scuba
- I Can Swim 209 adaptive program callout strip
- Testimonials carousel
- Upcoming dive trips preview (3 cards)
- Full footer with contact info, social links, and I Can Swim 209

### 🏊 Swim Lessons Page
- "Max 4 per class" prominently featured with industry comparison callout
- 5 color-coded swim level cards with ocean creature badges (Pearls → Octopus Elite)
- Age ranges, skills covered, and progression pathway
- Octopus Elite → PADI bridge callout
- Schedule placeholder (calendar grid, color-coded by level)

### 🤿 PADI / Scuba Page
- PADI 5★ IDC Center badge featured prominently
- Course catalog organized into 5 groups: Get Introduced, Get Certified, Improve Skills, Be a Safer Diver, Specialties (18 in filterable grid)
- Professional / Pro Track section with certification pathway
- "What Can I Teach?" section mapping pro certs to courses
- Each course card: name, description, prereqs, duration, "Book This Course" CTA (linking to peek.com booking URL)

### ✈️ Dive Trips Page
- Rich destination cards (Fiji, Socorro, Maldives, Philippines x3) with imagery, dates, pricing
- "Reserve My Spot" CTAs
- Trip detail views with itinerary, inclusions, gear requirements

### 🛡️ Safety & Certifications Page
- Red Cross programs (Lifeguarding, Safety Training for Swim Coaches)
- DAN programs (CPR & EFR Instructor, dive insurance link)
- Positioned as community safety resources bridging swim + scuba

### 🎽 Equipment & Gear Page
- Brand grid (Aqua Lung, ScubaPro, Hollis, Tusa, Bare, Tilos, DUI)
- Services: sales, rental, air fills, Nitrox, servicing
- Contact/inquiry CTA (no e-commerce)

### 🌊 Dream Divers Club Page
- About the Club, upcoming dives, calendar
- Community hub feel with join CTA

### 🐠 Community Page
- Monterey Dive Conditions link
- Dive Sites guide
- Blog/News feed
- Testimonials carousel
- FAQ accordion (swim + scuba tabs)
- External links (PADI, DAN, eLearning)
- Video Gallery

### 💜 I Can Swim 209
- Prominent callout section on homepage, swim page, and footer
- Warm community-focused copy with link to icanswim209.com

---

## Phase 2 — Backend & Enrollment Flows (Supabase)

### Database & Auth
- Supabase Cloud setup with admin authentication
- Tables: swim enrollments, dive course bookings, trip reservations, contact/inquiry submissions, schedule/sessions
- Max 4 students per class enforced at the database level
- Admin role-based access

### Swim Enrollment Flow
- Multi-step: select level → select session → parent/child info → confirmation
- Weekly calendar showing spots remaining (max 4)
- Private lesson upsell at checkout

### Trip Reservations
- Reserve/inquiry form stored in Supabase
- Spots remaining tracking

### 🔐 Admin Dashboard
- Protected route with Supabase auth
- Swim lesson enrollments by level (roster view, max 4 enforced)
- Dive course bookings
- Trip reservations
- Contact form submissions
- Schedule management (add/edit/remove sessions)

---

## Phase 3 — AI Swim Placement Tool & Enhancements

### 🤖 AI Swim Placement Tool
- Parents enter: child's age, current experience, primary goal, concerns
- Lovable AI returns personalized level recommendation with what first sessions look like and how small group sizes benefit their child
- If fear/sensory concerns selected → surfaces I Can Swim 209

### Polish & Enhancements
- Animated transitions and micro-interactions
- SEO metadata for all pages
- Performance optimization

