

## Add Sibling / Multi-Child Enrollment Support

### The problem
Parents with multiple children must complete the full 5-step enrollment flow separately for each child — re-entering parent info, signing waivers, and checking out individually. This is tedious and likely to cause drop-off.

### Proposed solution: "Add Another Child" loop
After the legal agreements step, offer an **"Add Another Swimmer"** option that loops back to the assessment step while preserving parent info. All children are then paid for in a single checkout.

### How it works (user perspective)

```text
Assessment → Session → Details → Legal
                                   ↓
                          "Add Another Child?" ──yes──→ back to Assessment
                                   │                    (parent info preserved)
                                  no
                                   ↓
                         Payment (combined cart)
                                   ↓
                            Confirmation
```

- Parent name, email, phone, and emergency contact carry forward automatically
- Each child gets their own level assessment, session pick, child name/age, and medical info
- The payment step shows a combined total for all children
- Confirmation lists every child enrolled

### Technical approach

1. **Lift state to hold multiple children** in `SwimEnrollment.tsx` — an array of `{ level, childAge, childDob, childName, sessionIds, enrollmentData, isFirstTime }` objects
2. **Pre-fill parent fields** in `EnrollmentForm` via new optional `defaultParentName/Email/Phone` props
3. **Pre-fill emergency contact** in `LegalAgreements` via similar props
4. **Add "Add Another Swimmer" button** on the legal step (or a new interstitial step after legal)
5. **Batch all enrollment inserts** and legal agreement inserts at the end, then proceed to a single combined checkout
6. **Update `EnrollmentCheckout`** to pass multiple enrollment IDs and the combined price
7. **Update `EnrollmentConfirmation`** to list all children enrolled

### Files modified
- `src/pages/SwimEnrollment.tsx` — multi-child state array, loop logic
- `src/components/swim-enrollment/EnrollmentForm.tsx` — accept default parent props
- `src/components/swim-enrollment/LegalAgreements.tsx` — accept default emergency contact props, add "Add Another" button
- `src/components/swim-enrollment/EnrollmentCheckout.tsx` — handle multiple enrollment IDs and combined pricing
- `src/components/swim-enrollment/EnrollmentConfirmation.tsx` — display all children

### What stays the same
- Assessment logic, session picker, and legal content are unchanged
- Database schema needs no changes — each child still gets its own `swim_enrollments` row
- Registration fee is charged once per family (first child only), which is already the existing logic

