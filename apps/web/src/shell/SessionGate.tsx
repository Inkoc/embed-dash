import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useLocation } from "react-router";
import { TriangleAlert, X, LogOut } from "lucide-react";
import type { SessionUser } from "@embed-dash/shared";
import { DiscordEntry, NotAllowed, UserBadge } from "./DiscordSignIn";
import { ThemeSwitch } from "./ThemeSwitch";
import headerStyles from "./TopBar.module.css";
import { AppError, connectionFailure, failureFrom } from "../errors";
import { useTheme } from "../theme";
import { FailureDetail } from "../ui/FailureDetail";
import styles from "./SessionGate.module.css";

export interface Session {
  authMode: "password" | "none" | "discord";
  authenticated: boolean;
  insecure: boolean;
  csrfToken: string;
  user: SessionUser | null;
  deniedUserId: string | null;
  maxUploadMb: number;
}

const AccessContext = createContext<{
  insecure: boolean;
  user: SessionUser | null;
  busy: boolean;
  error: AppError | null;
  logout: () => void;
} | null>(null);

export function AccessWarning() {
  const access = useContext(AccessContext);
  return access?.insecure ? (
    <div className={styles.access} role="note">
      <TriangleAlert aria-hidden="true" />
      <p>
        <strong>No login required.</strong> This instance is open to anyone who
        can reach it. Keep it on 127.0.0.1.
      </p>
    </div>
  ) : null;
}

export function SessionControls() {
  const access = useContext(AccessContext);
  if (!access || access.insecure) return null;
  return (
    <>
      {access.user && <UserBadge user={access.user} />}
      <button
        className={headerStyles.quiet}
        data-session-control
        disabled={access.busy}
        onClick={access.logout}
        aria-label={
          access.busy
            ? "Signing out…"
            : access.user
              ? `Sign out ${access.user.name}`
              : "Sign out"
        }
        title={access.user ? `Signed in as ${access.user.name}` : undefined}
      >
        <LogOut aria-hidden="true" className={styles.icon} />
        <span className={styles.signOutLabel}>
          {access.busy ? "Signing out…" : "Sign out"}
        </span>
      </button>
      {access.error && (
        <p className={styles.logoutError} role="alert">
          <X aria-hidden="true" />
          {access.error.message}
        </p>
      )}
    </>
  );
}

export function SessionGate({ children }: { children: ReactNode }) {
  const passwordInput = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const client = useQueryClient();
  const location = useLocation();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<AppError | null>(null);
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
  const discord = session.data?.authMode === "discord";
  const denied = discord ? session.data?.deniedUserId : null;
  // The sheet only mounts once the redirect to /login has happened.
  const onLogin = location.pathname === "/login";
  // After the redirect back from Discord, start reading at the explanation.
  useEffect(() => {
    if (denied && onLogin) heading.current?.focus();
  }, [denied, onLogin]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!password.trim()) {
      setError(new AppError("Enter the instance password."));
      return;
    }
    if (await change("/api/auth/login", { password })) setPassword("");
    else passwordInput.current?.focus();
  }
  async function change(url: string, body?: object) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": session.data!.csrfToken,
        },
        body: JSON.stringify(body ?? {}),
      });
      // Signing out of a session that already ended has nothing to report:
      // the login screen that follows starts clean.
      const alreadyOut = url === "/api/auth/logout" && response.status === 401;
      if (!response.ok && !alreadyOut) {
        setError(
          await failureFrom(
            url === "/api/auth/logout" ? "sign-out" : "sign-in",
            response,
          ),
        );
        await session.refetch();
        return false;
      }
      client.removeQueries({
        predicate: (query) => query.queryKey[0] !== "session",
      });
      await session.refetch();
      return true;
    } catch {
      setError(
        connectionFailure(url === "/api/auth/logout" ? "sign-out" : "sign-in"),
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (session.data?.authenticated) {
    if (location.pathname === "/login") return <Navigate to="/" replace />;
    return (
      <AccessContext.Provider
        value={{
          insecure: session.data.insecure,
          user: session.data.user,
          busy,
          error,
          logout: () => void change("/api/auth/logout"),
        }}
      >
        {children}
      </AccessContext.Provider>
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
        <h1 id="login-title" ref={heading} tabIndex={-1}>
          {denied ? "Not allowed" : "Sign in"}
        </h1>
        <p className={styles.address}>{window.location.host}</p>
        {session.isPending ? (
          <p role="status">Checking your session…</p>
        ) : session.isError ? (
          <>
            <p role="alert">
              <X aria-hidden="true" />
              Unable to check your session. Check your connection and retry.
            </p>
            <button
              className={styles.primary}
              onClick={() => void session.refetch()}
            >
              Retry
            </button>
          </>
        ) : denied ? (
          <NotAllowed userId={denied} />
        ) : discord ? (
          <DiscordEntry
            reason={new URLSearchParams(location.search).get("auth")}
          />
        ) : (
          <form onSubmit={(event) => void submit(event)}>
            <p>Use the password set by your instance operator.</p>
            <label htmlFor="password">Instance password</label>
            <input
              ref={passwordInput}
              autoFocus
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              aria-invalid={!!error}
              aria-describedby={error ? "login-error" : undefined}
              onBlur={() => {
                if (!password)
                  setError(new AppError("Enter the instance password."));
              }}
              onChange={(event) => {
                setPassword(event.target.value);
                setError(null);
              }}
            />
            {error && (
              <div id="login-error" className={styles.failure} role="alert">
                <p>
                  <X aria-hidden="true" />
                  {error.message}
                </p>
                <FailureDetail error={error} />
              </div>
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
  return <ThemeSwitch theme={theme} onToggle={toggle} />;
}
