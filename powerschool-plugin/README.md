# Teacher Grade Analytics PowerSchool Plugin

This package is the **read-only development connector** for Teacher Grade Analytics.

## Safety

- Every requested database field is `ViewOnly`.
- The plugin does not request grade, assignment, category, or write access.
- The bundled PowerQuery reads only the authenticated teacher's section identity plus current roster Student Numbers.
- Student Number is used server-side only to count/match roster records and is not returned to the browser by the connection-test UI.

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

The teacher email argument comes from the authenticated Teacher Grade Analytics profile, not from a browser-supplied email field. The query returns one row per current roster relationship so the server can group rows into sections and count unique Student Numbers. The browser receives only section metadata and roster counts.

The query deliberately uses current-enrollment filters (`CC.DATEENROLLED`, `CC.DATELEFT`, and `STUDENTS.ENROLL_STATUS`) so historical schedule rows do not inflate the connection test.

If the local PowerSchool schema or Oracle date semantics differ from the relationship assumptions in the working district sample (`USERS -> SCHOOLSTAFF -> SECTIONS`, `CC -> STUDENTS`), adjust the named query with district staff before installing. Do not add `FullAccess` merely to make discovery work.
