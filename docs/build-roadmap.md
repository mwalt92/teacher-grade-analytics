# Build Roadmap

The durable cross-phase roadmap is tracked in GitHub issue **#19 — Generalize grading architecture and preserve rollout roadmap**. This document summarizes the sequence so the current architecture work does not hide the parallel student-rollout/security track or the later Computing/AI work.

## Completed foundation

- Next.js/TypeScript application shell
- Supabase/PostgreSQL data model with school years, courses, sections, enrollments, assignments, grade records, attempts, and RLS
- Google OAuth teacher authentication
- Roster management with active/inactive enrollment preservation
- Assignment creation, grade entry, autosave, Missing workflow, retakes, bulk actions, undo
- Assignment management with archive/restore and guarded permanent removal
- Canonical grade calculation/audit foundation
- Assignment Gradebook and PowerSchool comparison workflow
- Student dashboard foundation and Grade Simulator, including future-score, retake, late-work, and final-exam target scenarios

## Parallel Track A — Student rollout and security

- PR #15 remains isolated until a real managed Chromebook can complete the login flow.
- School filtering currently blocks the Vercel-hosted test path before account-linking can be validated.
- Do not request wildcard Vercel access. Move toward one stable IT-approved hostname, preferably a school-controlled subdomain.
- Keep Google school accounts as the only login path; password/email-link auth stays disabled.
- Preserve exact-email roster linking and student-to-student RLS isolation.
- After the network path is approved: validate real student linking, own-dashboard isolation, and sign-out/sign-in persistence before merging PR #15.
- Infrastructure follow-up: private GitHub repository, Vercel secret review, and custom-domain/auth-flow simplification where practical.

## Active Track B — Generalize grading architecture

### B1 — Category calculation and generic category engine

- [x] Add stable category codes.
- [x] Add per-category calculation methods: `equal_assignment_percentage` and `total_points`.
- [x] Refactor the pure engine to accept arbitrary configured category keys.
- [x] Preserve Missing, Exempt, drop-lowest, retake selection, and dynamic active-category weighting.
- [x] Carry assignment points into the audit so total-points Missing work has a denominator.
- [x] Add regression tests that distinguish 10/10 + 25/50 as 75% under equal weighting versus 58.33% under total points.
- [ ] Complete PowerSchool diagnostic UI for Configured vs Equal vs Total Points.
- [ ] Validate a controlled differently-sized assignment example against PowerSchool and set Calculus category methods from evidence, not assumption.
- [ ] Manual teacher checkpoint and merge.

### B2 — Separate Category from Assignment Type

- Add configurable assignment-type/template records.
- Assignment type controls workflow/defaults; category controls grade contribution.
- Resolve category, points, retake eligibility, attempt policy, and scoring method onto the assignment so later template edits are not retroactive.
- Backfill current Calculus Participation/Quiz/Test assignments without changing official grade-record identities.

### B3 — Generalize grading periods

- Add direct/composite grading-period configuration.
- Composite periods use configurable weighted component rows.
- Express Calculus Q1 + Q2 + Exam -> S1 and Q3 + Q4 + Exam -> S2 through configuration.
- Support semester-only direct periods for courses such as Computing Foundations.

### B4 — Explicit teacher course/section context

- Remove page-level assumptions that the first teacher section is always the active course.
- Provide clean section/course switching before introducing the second course.

### B5 — Computing Foundations configuration

- Participation 40%
- Assessments 40%
- Projects 20%
- Code.org Activity -> Participation
- Code.org-labeled formative/checkpoint Assessment -> Assessments
- Unit Assessment -> Assessments
- Project -> Projects
- Retakes remain independently configurable rather than implied by category/type.

### B6 — Proficiency scoring

Reusable conversion method:

- 4/4 -> 10/10
- 3/4 -> 8/10
- 2/4 -> 6/10
- 1/4 -> 4/10
- 0/4 -> 0/10

The conversion happens before the official grade reaches the canonical engine.

## Track C — External submission and AI-assisted grading

Build only after the core grading model is generalized:

`External Submission -> Grading Recommendation -> Teacher Decision -> Official Grade`

- Code.org CSV first.
- Store source submission text/platform/unit/lesson/level separately from official grade records.
- Version rubrics and preserve proposed proficiency/points, confidence, concise feedback, concept/misconception tags, review status, and teacher-approved/edited values.
- Low-confidence responses surface first.
- AI recommendations never automatically become official grades.
- Approved scores become normal grade records/attempts so the grade engine is source-agnostic.
- Reuse the review architecture later for IXL/other LMS inputs and scanned math work.

## Track D — Student/product work after the grading model stabilizes

- Make student dashboard categories and grading periods fully configuration-driven.
- Keep Grade Simulator on the same canonical generic engine.
- Computing student UX should communicate Practice/Participation -> Assessment Checkpoints -> Unit Assessment -> Project progression.
- Continue deferred Assignment Gradebook UX ideas in issue #12 separately.

## PowerSchool parity rule

PowerSchool remains the source of truth for official Calculus grade-calculation parity. If the website and PowerSchool disagree, investigate the grading rule instead of preserving website behavior. Current development assignments and grades are disposable test data and may be deleted, resized, replaced, or recreated to build controlled parity tests.

## Development checkpoint policy

Use feature branches and exact-commit READY Vercel previews. Keep unrelated work isolated. Do not merge a feature PR until manual teacher testing and explicit approval.
