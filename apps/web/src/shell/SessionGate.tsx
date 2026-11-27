import { useState, type ReactNode, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useLocation } from "react-router";
import { useTheme } from "../theme";
import styles from "./SessionGate.module.css";

interface Session {
  authenticated: boolean;
  insecure: boolean;
  csrfToken: string;
}

export function SessionGate({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const location = useLocation();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const session = useQuery<Session>({
    queryKey: ["session"],
    queryFn: async () => {
      const response = await fetch("/api/session");
      if (!response.ok) throw new Error("Unable to check your session.");
      return response.json() as Promise<Session>;
    },
    refetchInterval: 60_000,
    retry: false,
  });
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!password.trim()) {
      setError("Enter the instance password.");
      return;
    }
    await change("/api/auth/login", { password });
    setPassword("");
  }
  async function change(url: string, body?: object) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": session.data!.csrfToken,
        },
        body: JSON.stringify(body ?? {}),
      });
      if (!response.ok) {
        setError(
          response.status === 429
            ? "Too many attempts. Wait a minute, then try again."
            : response.status === 401
              ? "Incorrect password. Try again."
              : "Your session changed. Refresh and try again.",
        );
        await session.refetch();
        return;
      }
      client.removeQueries({
        predicate: (query) => query.queryKey[0] !== "session",
      });
      await session.refetch();
    } catch {
      setError("Unable to connect. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }
  if (session.data?.authenticated) {
    if (location.pathname === "/login") return <Navigate to="/" replace />;
    return (
      <>
        <section className={styles.access} aria-label="Instance access">
          {session.data.insecure ? (
            <p role="note">
              <strong>No login required.</strong> This instance is open to
              anyone who can reach it. Keep it on 127.0.0.1.
            </p>
          ) : (
            <button
              className={styles.quiet}
              disabled={busy}
              onClick={() => void change("/api/auth/logout")}
            >
              {busy ? "Signing out…" : "Sign out"}
            </button>
          )}
          {error && <p role="alert">{error}</p>}
        </section>
        {children}
      </>
    );
  }
  if (session.data && location.pathname !== "/login")
    return <Navigate to="/login" replace />;
  return (
    <main id="main" className={styles.login}>
      <div className={styles.heading}>
        <img src="/icon.svg" alt="" width="28" height="28" />
        <span>embed-dash</span>
        <LoginThemeSwitch />
      </div>
      <section className={styles.sheet} aria-labelledby="login-title">
        <h1 id="login-title">Sign in to your instance</h1>
        {session.isPending ? (
          <p role="status">Checking your session…</p>
        ) : session.isError ? (
          <>
            <p role="alert">
              Unable to check your session. Check your connection and retry.
            </p>
            <button
              className={styles.primary}
              onClick={() => void session.refetch()}
            >
              Retry
            </button>
          </>
        ) : (
          <form onSubmit={(event) => void submit(event)}>
            <p>Use the password set by your instance operator.</p>
            <label htmlFor="password">Instance password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              aria-invalid={!!error}
              aria-describedby={error ? "login-error" : undefined}
              onBlur={() => {
                if (!password) setError("Enter the instance password.");
              }}
              onChange={(event) => {
                setPassword(event.target.value);
                setError("");
              }}
            />
            {error && (
              <p id="login-error" role="alert">
                {error}
              </p>
            )}
            <button className={styles.primary} disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

function LoginThemeSwitch() {
  const { theme, toggle } = useTheme();
  return (
    <button className={styles.quiet} onClick={toggle}>
      {theme === "dark" ? "Light theme" : "Dark theme"}
    </button>
  );
}
