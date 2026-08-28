-- PowerSchool parity verified 2026-08-28 from M211 assignment report + category summary.
-- Quiz category arithmetic is total points after the configured lowest-quiz drop.

update grading_categories gc
set calculation_method = 'total_points'
from sections s
join courses c on c.id = s.course_id
where gc.section_id = s.id
  and c.code = 'M211'
  and gc.code = 'quiz';
