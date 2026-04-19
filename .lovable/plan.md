
User reports "Something went wrong / Please try again or contact us directly" on the Complete Enrollment step. From SwimEnrollment.tsx, that toast fires in `handleLegalSubmit` in three places:
1. Sessions fetch returned nothing
2. Capacity check found a session full
3. `swim_enrollments` insert failed
4. `enrollment_agreements` insert failed

Given the new trigger I just added (`enforce_first_time_swimmer`) fires `BEFORE INSERT` on `swim_enrollments`, my top suspicion is the trigger is throwing an error on insert — for example a NULL email, missing `gen_random_uuid` issue in the function, or a logic bug. Let me check.

Plan:
1. Read the new trigger migration to verify the SQL is correct.
2. Query Postgres logs around the time of the error for any trigger/function errors on `swim_enrollments`.
3. Query recent failed inserts / check if Jess Erwin / Kade / Fallon Erwin has any rows that did get inserted.
4. Check edge function logs (`create-checkout`) to see if it's downstream or if insert itself failed.
5. Report root cause and propose a fix.

No code changes — investigation only.
