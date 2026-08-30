"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "./login.module.css";

type GoogleCredentialResponse = {
  credential?: string;
};

type GoogleIdentityApi = {
  initialize: (config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void | Promise<void>;
    nonce?: string;
    auto_select?: boolean;
    itp_support?: boolean;
    use_fedcm_for_prompt?: boolean;
  }) => void;
  prompt: () => void;
  cancel: () => void;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        id: GoogleIdentityApi;
      };
    };
  }
}

async function generateNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const rawNonce = btoa(String.fromCharCode(...bytes));
  const encodedNonce = new TextEncoder().encode(rawNonce);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encodedNonce);
  const hashedNonce = Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return { rawNonce, hashedNonce };
}

export function GoogleSignInButton() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleScriptReady, setGoogleScriptReady] = useState(false);
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!googleClientId || !googleScriptReady || !window.google?.accounts?.id) return;

    let cancelled = false;
    const supabase = createClient();

    async function initializeOneTap() {
      const { rawNonce, hashedNonce } = await generateNonce();
      if (cancelled || !window.google?.accounts?.id) return;

      window.google.accounts.id.initialize({
        client_id: googleClientId,
        nonce: hashedNonce,
        auto_select: true,
        itp_support: true,
        use_fedcm_for_prompt: true,
        callback: async (response) => {
          if (!response.credential) return;

          setLoading(true);
          setError(null);
          const { error: authError } = await supabase.auth.signInWithIdToken({
            provider: "google",
            token: response.credential,
            nonce: rawNonce,
          });

          if (authError) {
            setError(authError.message);
            setLoading(false);
            return;
          }

          window.location.assign("/");
        },
      });

      window.google.accounts.id.prompt();
    }

    initializeOneTap().catch((oneTapError: unknown) => {
      if (!cancelled) {
        console.error("Google One Tap initialization failed", oneTapError);
      }
    });

    return () => {
      cancelled = true;
      window.google?.accounts?.id.cancel();
    };
  }, [googleClientId, googleScriptReady]);

  async function signIn() {
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
    }
  }

  return (
    <div className={styles.actions}>
      {googleClientId ? (
        <Script
          src="https://accounts.google.com/gsi/client"
          strategy="afterInteractive"
          onReady={() => setGoogleScriptReady(true)}
        />
      ) : null}
      <button className="primary-button" type="button" onClick={signIn} disabled={loading}>
        {loading ? "Signing in…" : "Sign in with Google"}
      </button>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </div>
  );
}
