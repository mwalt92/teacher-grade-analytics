export default function AuthCodeErrorPage() {
  return (
    <main className="login-page">
      <section className="login-card">
        <p className="eyebrow">Teacher Grade Analytics</p>
        <h1>Sign-in didn’t complete</h1>
        <p className="subtle">The authentication callback could not create a valid session. Return to the login page and try again.</p>
        <a className="primary-button login-link" href="/login">Back to sign in</a>
      </section>
    </main>
  );
}
