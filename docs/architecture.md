# Architecture

## Product principles

1. One grading engine powers teacher views, student views, analytics, audits, simulations, and PowerSchool comparison.
2. Grade calculations must be explainable, not opaque.
3. Students never receive data for other students.
4. Enrollment history is preserved; inactive students are hidden from everyday workflows rather than deleted.
5. School years, courses, sections, grading periods, categories, assignments, attempts, and enrollments are first-class concepts.
6. Score values and instructional flags (such as Missing) are separate data.
7. Grade changes are auditable and reversible where practical.
8. The UI is responsive from the beginning and remains compatible with a future PWA/native wrapper.

## Planned stack

- Next.js + React + TypeScript
- PostgreSQL/Supabase for persistent data and authentication
- Google OAuth for teacher/student sign-in
- Vercel for early deployment
- Vitest for grading-engine tests

## Core data model (planned)

- school_years
- users
- courses
- sections
- enrollments
- grading_periods
- grading_categories
- grading_rules
- assignments
- grade_records
- grade_attempts
- grade_changes
- grade_issue_reports
- powerschool_snapshots

## Security model

Authorization must be enforced on the server/database layer. The student browser must never be given an entire class roster and asked to hide unauthorized rows. Supabase Row Level Security policies will enforce ownership and section-based teacher access in addition to server-side checks.
