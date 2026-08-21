INSERT INTO public.instructor_pins (instructor_id, pin_hash, role, failed_count, locked_until, updated_at)
VALUES ('2f4a3923-7d34-4908-92f8-b7c3d060f2dd', crypt('2470', gen_salt('bf')), 'instructor', 0, NULL, now())
ON CONFLICT (instructor_id) DO NOTHING;