import { GoogleSignInButton } from "./google-sign-in-button";
import styles from "./login.module.css";

export default function LoginPage() {
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <p className="eyebrow">Teacher Grade Analytics</p>
        <h1>Sign in</h1>
        <p className="subtle">Use your school-managed Google account to access authorized course and grade data.</p>
        <GoogleSignInButton />
        <p className={styles.note}>Google sign-in is the only supported login method. Password and email-link sign-in are disabled.</p>
      </section>
    </main>
  );
}
