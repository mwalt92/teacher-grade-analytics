# Supabase Setup

## Project

The current development backend is the Supabase project **Teacher Grade Analytics**.

Do not commit `.env.local`, database passwords, service-role keys, secret API keys, or real student records.

## Local environment

Copy `.env.example` to `.env.local` and populate:

```bash
NEXT_PUBLIC_SUPABASE_URL=<project URL>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key>
```

Only the publishable key belongs in the browser. Never expose a Supabase secret/service-role key through a `NEXT_PUBLIC_` variable.

## Google OAuth

Google sign-in is intentionally scaffolded in the app but must be configured in Supabase and Google Cloud before it can complete.

1. Create a Google OAuth **Web application** client.
2. Configure only the minimum identity scopes needed by Supabase: `openid`, email, and profile.
3. Add local development origin `http://localhost:3000`.
4. Add the Supabase Google-provider callback URL as an Authorized Redirect URI in Google Cloud.
5. Enter the Google Client ID and Client Secret in Supabase Authentication > Providers > Google.
6. Add `http://localhost:3000/auth/callback` to the Supabase redirect allow list for development.
7. Add the production Vercel callback URL later when deployment exists.

The application uses the PKCE OAuth flow and exchanges the callback code in `src/app/auth/callback/route.ts`.

## Authorization model

- New authenticated users get a `public.profiles` row automatically.
- New profiles default to the `student` application role.
- Role/authorization decisions must never trust Google/Supabase `user_metadata` because users can edit it.
- Teacher access is derived from `teacher_sections` and enforced by Row Level Security.
- Students may read only their own grade records/attempts/change history and assignments for sections in which they are enrolled.
- Teachers may read student profiles only when those students are enrolled in a section assigned to that teacher.
- Inactive enrollments remain stored but can be filtered out of normal grade-entry workflows.

## Development data

Keep using fake/demo students until the following are verified end to end:

- Google authentication
- teacher role/bootstrap
- teacher section assignment
- student self-access
- teacher roster access
- denial of cross-student access
- inactive enrollment filtering

Only after those checks should real student records be considered.
