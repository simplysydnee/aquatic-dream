-- Delete duplicate sessions for blue and green (yellow/blue/green share 1 group)
-- Keep only the "yellow" rows as the canonical sessions for the 7+ advanced group
DELETE FROM swim_sessions WHERE swim_level IN ('blue', 'green') AND age_group = 'advanced-7+';

-- Also delete stroke-school sessions if they exist (stroke school uses same slots)
DELETE FROM swim_sessions WHERE swim_level = 'stroke-school' AND age_group = 'advanced-7+';