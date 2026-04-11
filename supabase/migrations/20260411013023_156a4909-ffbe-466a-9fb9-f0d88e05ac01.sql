
-- 1. Delete old inactive sessions (school-5-8 and advanced-7+ age groups)
DELETE FROM swim_sessions WHERE age_group IN ('school-5-8', 'advanced-7+');

-- 2. Add Reef Explorers (preschool red) matching every Bubble Makers (white) time slot
INSERT INTO swim_sessions (session_name, swim_level, age_group, day_of_week, start_time, end_time, session_start_date, session_end_date, max_students, is_active, registration_status)
SELECT 
  'Reef Explorers',
  'red',
  age_group,
  day_of_week,
  start_time,
  end_time,
  session_start_date,
  session_end_date,
  max_students,
  is_active,
  registration_status
FROM swim_sessions
WHERE session_name = 'Bubble Makers' AND swim_level = 'white' AND age_group = 'preschool-3-5';

-- 3. Add Sea Scouts (white) matching every Deep Sea Divers time slot
INSERT INTO swim_sessions (session_name, swim_level, age_group, day_of_week, start_time, end_time, session_start_date, session_end_date, max_students, is_active, registration_status)
SELECT 
  'Sea Scouts',
  'white',
  age_group,
  day_of_week,
  start_time,
  end_time,
  session_start_date,
  session_end_date,
  max_students,
  is_active,
  registration_status
FROM swim_sessions
WHERE session_name = 'Deep Sea Divers' AND swim_level = 'yellow' AND age_group = 'school-age-6-12';

-- 4. Add Sea Scouts (red) matching every Deep Sea Divers time slot
INSERT INTO swim_sessions (session_name, swim_level, age_group, day_of_week, start_time, end_time, session_start_date, session_end_date, max_students, is_active, registration_status)
SELECT 
  'Sea Scouts',
  'red',
  age_group,
  day_of_week,
  start_time,
  end_time,
  session_start_date,
  session_end_date,
  max_students,
  is_active,
  registration_status
FROM swim_sessions
WHERE session_name = 'Deep Sea Divers' AND swim_level = 'yellow' AND age_group = 'school-age-6-12';
