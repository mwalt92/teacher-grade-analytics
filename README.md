# Teacher Grade Analytics

A teacher/student grade-management platform focused on transparent grade calculations, fast classroom workflows, retakes, missing work, PowerSchool comparison, and student self-service.

## Current status

Stage 1 foundation is underway. The repository currently contains:

- Responsive Next.js teacher-dashboard shell
- Demo-only classroom data (no real student information)
- Initial grading-engine module
- Automated tests for dropped quizzes, retakes, and missing work
- Architecture documentation
- Draft relational database schema for Supabase/PostgreSQL

## Product direction

The first course is ACP Calculus I M211, but the application is deliberately modeled around reusable courses, sections, school years, grading categories, enrollments, assignments, attempts, and grading rules.

Important planned features include autosaving grade entry, 0 + Missing workflow, automatic Missing-flag cleanup when a real grade is entered, bulk full-credit/set-score actions, retakes, undo/history, grade calculation audits, PowerSchool comparison, student-visible recent changes, grade issue reporting, and a grade simulator that respects late-work rules.

## Local development

Requires a recent Node.js LTS release.

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

Run the grading-engine tests with:

```bash
npm test
```

## Data safety

Do not add real student information to source control. Development should use fake/demo records until Supabase authentication, Row Level Security, and production data-handling controls are configured.

See `docs/architecture.md` and `docs/database-plan.sql` for the current design direction.
