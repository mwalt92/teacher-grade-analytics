# Build Roadmap

## Stage 1 — Foundation

- [x] Next.js/TypeScript shell
- [x] Responsive teacher dashboard prototype
- [x] Demo-only data
- [x] Core grade engine boundary
- [x] Draft PostgreSQL schema
- [x] School-year/course/section/enrollment model
- [x] Active/inactive enrollment preservation
- [x] Initial grade-engine tests
- [x] Safe simulation module with configurable category late penalties
- [ ] Supabase project connection
- [ ] Authentication plumbing
- [ ] Row Level Security policies
- [ ] Database migrations
- [ ] Replace demo persistence with repository/service layer

## Stage 2 — Assignment and grade entry

- Assignment creation with date defaulting to today and editable calendar control
- Participation vs Assessment flow; Assessment drills into Quiz/Test
- Whole-class grade entry
- Autosave with visible Saving/Saved/Error feedback
- 0 + Missing workflow
- Automatically clear Missing when a real score is entered
- Add Retake action for assessments
- Fill remaining with 0 + Missing
- Fill all with full credit
- Set all scores to…
- Reversible bulk actions and Ctrl/Cmd+Z where practical

## Stage 3 — Grade engine completion

- Configurable category weights
- Dynamic category weighting when categories are not yet populated
- Dropped-score rules
- Retake policy
- Missing work
- Late-work deductions by category and per-assignment overrides
- Quarter and semester formulas
- Explainable calculation audit
- Comprehensive regression tests

## Stage 4 — PowerSchool validation

- Store comparison snapshots
- Tolerance setting
- Student mismatch list
- Drill from discrepancy to grade audit
- Preserve comparison history during engine tuning

## Stage 5+ — Teacher, student, simulator, analytics, PWA

See architecture and product planning notes. Grade Simulator is core student functionality and must use the same grade engine without write access to real grade records.

## Stage 1 acceptance checkpoint

Stage 1 is complete when a teacher can authenticate, choose a school year/course/section, see active roster members from Supabase, and inactive enrollments remain queryable but are hidden by default. No real student data should be introduced before RLS and authorization tests are in place.
