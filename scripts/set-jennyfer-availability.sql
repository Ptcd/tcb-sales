-- Set availability schedule for jennyfertan322@gmail.com
-- This script automatically finds the user ID and organization ID
-- Timezone: Asia/Manila (PHT)

-- First, delete existing schedules for this user
DELETE FROM agent_schedules 
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'jennyfertan322@gmail.com');

-- Insert new schedules using subqueries to get user_id and organization_id
-- Monday: 10:00 PM - 11:59 PM
INSERT INTO agent_schedules (user_id, organization_id, day_of_week, start_time, end_time, is_active, timezone, meeting_duration_minutes, buffer_before_minutes, buffer_after_minutes, max_meetings_per_day, min_notice_hours, booking_window_days, is_accepting_meetings)
SELECT 
  (SELECT id FROM auth.users WHERE email = 'jennyfertan322@gmail.com'),
  (SELECT organization_id FROM user_profiles WHERE id = (SELECT id FROM auth.users WHERE email = 'jennyfertan322@gmail.com')),
  1, '22:00', '23:59', true, 'Asia/Manila', 30, 15, 15, 6, 2, 14, true;

-- Tuesday: 12:00 AM - 6:00 AM
INSERT INTO agent_schedules (user_id, organization_id, day_of_week, start_time, end_time, is_active, timezone, meeting_duration_minutes, buffer_before_minutes, buffer_after_minutes, max_meetings_per_day, min_notice_hours, booking_window_days, is_accepting_meetings)
SELECT 
  (SELECT id FROM auth.users WHERE email = 'jennyfertan322@gmail.com'),
  (SELECT organization_id FROM user_profiles WHERE id = (SELECT id FROM auth.users WHERE email = 'jennyfertan322@gmail.com')),
  2, '00:00', '06:00', true, 'Asia/Manila', 30, 15, 15, 6, 2, 14, true;

-- Tuesday: 10:00 PM - 11:59 PM
INSERT INTO agent_schedules (user_id, organization_id, day_of_week, start_time, end_time, is_active, timezone, meeting_duration_minutes, buffer_before_minutes, buffer_after_minutes, max_meetings_per_day, min_notice_hours, booking_window_days, is_accepting_meetings)
SELECT 
  (SELECT id FROM auth.users WHERE email = 'jennyfertan322@gmail.com'),
  (SELECT organization_id FROM user_profiles WHERE id = (SELECT id FROM auth.users WHERE email = 'jennyfertan322@gmail.com')),
  2, '22:00', '23:59', true, 'Asia/Manila', 30, 15, 15, 6, 2, 14, true;

-- Wednesday: 12:00 AM - 6:00 AM
INSERT INTO agent_schedules (user_id, organization_id, day_of_week, start_time, end_time, is_active, timezone, meeting_duration_minutes, buffer_before_minutes, buffer_after_minutes, max_meetings_per_day, min_notice_hours, booking_window_days, is_accepting_meetings)
SELECT 
  (SELECT id FROM auth.users WHERE email = 'jennyfertan322@gmail.com'),
  (SELECT organization_id FROM user_profiles WHERE id = (SELECT id FROM auth.users WHERE email = 'jennyfertan322@gmail.com')),
  3, '00:00', '06:00', true, 'Asia/Manila', 30, 15, 15, 6, 2, 14, true;

-- Wednesday: 10:00 PM - 11:59 PM
INSERT INTO agent_schedules (user_id, organization_id, day_of_week, start_time, end_time, is_active, timezone, meeting_duration_minutes, buffer_before_minutes, buffer_after_minutes, max_meetings_per_day, min_notice_hours, booking_window_days, is_accepting_meetings)
SELECT 
  (SELECT id FROM auth.users WHERE email = 'jennyfertan322@gmail.com'),
  (SELECT organization_id FROM user_profiles WHERE id = (SELECT id FROM auth.users WHERE email = 'jennyfertan322@gmail.com')),
  3, '22:00', '23:59', true, 'Asia/Manila', 30, 15, 15, 6, 2, 14, true;

-- Thursday: 12:00 AM - 6:00 AM
INSERT INTO agent_schedules (user_id, organization_id, day_of_week, start_time, end_time, is_active, timezone, meeting_duration_minutes, buffer_before_minutes, buffer_after_minutes, max_meetings_per_day, min_notice_hours, booking_window_days, is_accepting_meetings)
SELECT 
  (SELECT id FROM auth.users WHERE email = 'jennyfertan322@gmail.com'),
  (SELECT organization_id FROM user_profiles WHERE id = (SELECT id FROM auth.users WHERE email = 'jennyfertan322@gmail.com')),
  4, '00:00', '06:00', true, 'Asia/Manila', 30, 15, 15, 6, 2, 14, true;

-- Thursday: 10:00 PM - 11:59 PM
INSERT INTO agent_schedules (user_id, organization_id, day_of_week, start_time, end_time, is_active, timezone, meeting_duration_minutes, buffer_before_minutes, buffer_after_minutes, max_meetings_per_day, min_notice_hours, booking_window_days, is_accepting_meetings)
SELECT 
  (SELECT id FROM auth.users WHERE email = 'jennyfertan322@gmail.com'),
  (SELECT organization_id FROM user_profiles WHERE id = (SELECT id FROM auth.users WHERE email = 'jennyfertan322@gmail.com')),
  4, '22:00', '23:59', true, 'Asia/Manila', 30, 15, 15, 6, 2, 14, true;

-- Friday: 12:00 AM - 6:00 AM
INSERT INTO agent_schedules (user_id, organization_id, day_of_week, start_time, end_time, is_active, timezone, meeting_duration_minutes, buffer_before_minutes, buffer_after_minutes, max_meetings_per_day, min_notice_hours, booking_window_days, is_accepting_meetings)
SELECT 
  (SELECT id FROM auth.users WHERE email = 'jennyfertan322@gmail.com'),
  (SELECT organization_id FROM user_profiles WHERE id = (SELECT id FROM auth.users WHERE email = 'jennyfertan322@gmail.com')),
  5, '00:00', '06:00', true, 'Asia/Manila', 30, 15, 15, 6, 2, 14, true;

-- Friday: 10:00 PM - 11:59 PM
INSERT INTO agent_schedules (user_id, organization_id, day_of_week, start_time, end_time, is_active, timezone, meeting_duration_minutes, buffer_before_minutes, buffer_after_minutes, max_meetings_per_day, min_notice_hours, booking_window_days, is_accepting_meetings)
SELECT 
  (SELECT id FROM auth.users WHERE email = 'jennyfertan322@gmail.com'),
  (SELECT organization_id FROM user_profiles WHERE id = (SELECT id FROM auth.users WHERE email = 'jennyfertan322@gmail.com')),
  5, '22:00', '23:59', true, 'Asia/Manila', 30, 15, 15, 6, 2, 14, true;

-- Saturday: 12:00 AM - 6:00 AM
INSERT INTO agent_schedules (user_id, organization_id, day_of_week, start_time, end_time, is_active, timezone, meeting_duration_minutes, buffer_before_minutes, buffer_after_minutes, max_meetings_per_day, min_notice_hours, booking_window_days, is_accepting_meetings)
SELECT 
  (SELECT id FROM auth.users WHERE email = 'jennyfertan322@gmail.com'),
  (SELECT organization_id FROM user_profiles WHERE id = (SELECT id FROM auth.users WHERE email = 'jennyfertan322@gmail.com')),
  6, '00:00', '06:00', true, 'Asia/Manila', 30, 15, 15, 6, 2, 14, true;

-- Sunday: No schedules (not available)
