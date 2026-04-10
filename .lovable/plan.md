

# Updated Job Application — Add Qualification Questions

## Context

The job posting requires:
- **Current Lifeguard Certification** (required prior to start)
- **Strong swimming ability and water safety knowledge**
- **Availability for part-time afternoons and weekends**

We should ask applicants about these so you can quickly filter qualified candidates.

## Updated Application Form Fields

1. **Personal Info** (already planned): First name, last name, phone, email
2. **Availability** (already planned): Checkboxes for weekday afternoons, weekday mornings, weekends, evenings
3. **NEW — Certifications**: Checkboxes for certifications they currently hold:
   - Lifeguard Certification
   - CPR / First Aid
   - Water Safety Instructor (WSI)
   - None yet (planning to obtain)
4. **NEW — Swimming ability**: "How would you rate your swimming ability?" — Beginner / Intermediate / Advanced / Competitive
5. **NEW — Experience with children**: "Do you have experience working with children?" — Yes (with optional text to describe) / No
6. **NEW — Start date availability**: "When are you available to start?" — date picker or free text
7. **Resume Upload** (already planned): PDF/DOC, required

## Database Impact

The `job_applications` table (from the previous plan) will include additional columns:
- `certifications` (text array) — selected certs
- `swimming_ability` (text) — self-rated level
- `experience_with_children` (text) — yes/no + description
- `available_start_date` (text) — when they can start

## Admin View

The applications table in admin will show certification status so you can quickly see who already has their lifeguard cert vs. who still needs it.

Everything else from the previous plan (tables, storage bucket, public page, admin pages, nav links, seed data) remains the same — this just adds the qualification fields to the application form.

