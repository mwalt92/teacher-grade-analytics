import { GoogleSignInButton } from "./google-sign-in-button";

export default function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-card">
        <p className="eyebrow">Teacher Grade Analytics</p>
        <h1>Sign in</h1>
        <p className="subtle">Use your Google account to access your authorized courses and grade data.</p>
        <GoogleSignInButton />
        <p className="login-note">Development note: Google OAuth must be enabled in Supabase before this button will complete sign-in.</p>
      </section>
    </main>
  );
}
