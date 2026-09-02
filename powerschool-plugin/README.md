# Teacher Grade Analytics PowerSchool Plugin

This package is the **read-only development connector** for Teacher Grade Analytics.

## Safety

- Every requested database field is `ViewOnly`.
- The plugin does not request grade, assignment, category, or write access.
- The two bundled PowerQueries only read teacher-owned section identity and section roster identity.
- Student Number is used only as the external roster matching key.

## Package layout

PowerSchool expects `plugin.xml` at the root of the ZIP and the named-query XML inside `queries_root/`.

Before installing, replace the placeholder publisher contact email in `plugin.xml` with the district-approved contact.

Create the ZIP from the contents of this directory so the archive root contains:

- `plugin.xml`
- `queries_root/com.unorth.teacher_grade_analytics.named_queries.xml`

Then install/enable it in PowerSchool Plugin Management. PowerSchool will display the requested field access for administrator review.

After enabling the plugin, retrieve the generated **Client ID** and **Client Secret** from its Data Provider Configuration page. Configure these only as server-side Vercel environment variables together with the district SIS origin:

- `POWERSCHOOL_BASE_URL`
- `POWERSCHOOL_CLIENT_ID`
- `POWERSCHOOL_CLIENT_SECRET`

Never commit those values to GitHub.

## First live test

The website's connection test uses OAuth client credentials, then executes only:

- `com.unorth.teacher_grade_analytics.teacher_sections_by_email`
- `com.unorth.teacher_grade_analytics.section_roster_by_id`

The teacher email argument comes from the authenticated Teacher Grade Analytics profile, not from a browser-supplied email field. Section roster queries are only executed for section IDs returned by that teacher lookup.

If the local PowerSchool schema differs from the relationship assumptions in the sample district plugin (`USERS -> SCHOOLSTAFF -> SECTIONS`), adjust the named query before enabling any broader integration. Do not add `FullAccess` merely to make discovery work.
