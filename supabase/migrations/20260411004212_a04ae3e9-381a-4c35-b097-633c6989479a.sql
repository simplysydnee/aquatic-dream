
-- Rename preschool white sessions to Bubble Makers
UPDATE swim_sessions SET session_name = 'Bubble Makers' WHERE age_group = 'preschool-3-5' AND swim_level = 'white' AND session_name = 'Session 1';
UPDATE swim_sessions SET session_name = 'Bubble Makers' WHERE age_group = 'preschool-3-5' AND swim_level = 'white' AND session_name = 'Session 2';

-- Rename preschool red sessions to Reef Explorers (if any exist)
UPDATE swim_sessions SET session_name = 'Reef Explorers' WHERE age_group = 'preschool-3-5' AND swim_level = 'red';

-- Rename school-age yellow to Deep Sea Divers
UPDATE swim_sessions SET session_name = 'Deep Sea Divers' WHERE age_group = 'school-age-6-12' AND swim_level = 'yellow' AND session_name = 'Session 1';
UPDATE swim_sessions SET session_name = 'Deep Sea Divers' WHERE age_group = 'school-age-6-12' AND swim_level = 'yellow' AND session_name = 'Session 2';

-- Rename school-age green/blue to Ocean Masters
UPDATE swim_sessions SET session_name = 'Ocean Masters' WHERE age_group = 'school-age-6-12' AND swim_level IN ('green', 'blue') AND session_name = 'Session 1';
UPDATE swim_sessions SET session_name = 'Ocean Masters' WHERE age_group = 'school-age-6-12' AND swim_level IN ('green', 'blue') AND session_name = 'Session 2';

-- Rename school-age white/red to Sea Scouts (if any exist)
UPDATE swim_sessions SET session_name = 'Sea Scouts' WHERE age_group = 'school-age-6-12' AND swim_level IN ('white', 'red');
