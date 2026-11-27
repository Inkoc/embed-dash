import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useLocation } from "react-router";
import { TriangleAlert, X, LogOut, UserRound } from "lucide-react";
import { ThemeSwitch } from "./ThemeSwitch";
import headerStyles from "./TopBar.module.css";
import { useTheme } from "../theme";
import styles from "./SessionGate.module.css";

interface Session {
  authMode?: "password" | "none" | "discord";
  user?: { id: string; name: string; avatar: string | null } | null;
  authenticated: boolean;
  insecure: boolean;
  csrfToken: string;
}

const AccessContext = createContext<{
  insecure: boolean;
  user?: Session["user"];
  busy: boolean;
  error: string;
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
      {access.user && (
        <span className={styles.identity} title={access.user.name}>
          {access.user.avatar ? (
            <img src={access.user.avatar} alt="" width="28" height="28" />
          ) : (
            <UserRound aria-hidden="true" />
          )}
          <span className={styles.userName}>{access.user.name}</span>
        </span>
      )}
      <button
        className={headerStyles.quiet}
        data-session-control
        disabled={access.busy}
        onClick={access.logout}
        aria-label={access.busy ? "Signing out…" : "Sign out"}
      >
        <LogOut aria-hidden="true" className={styles.icon} />
        <span className={styles.signOutLabel}>
          {access.busy ? "Signing out…" : "Sign out"}
        </span>
      </button>
      {access.error && (
        <p className={styles.logoutError} role="alert">
          <X aria-hidden="true" />
          {access.error}
        </p>
      )}
    </>
  );
}

export function SessionGate({ children }: { children: ReactNode }) {
  const passwordInput = useRef<HTMLInputElement>(null);
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
    if (await change("/api/auth/login", { password })) setPassword("");
    else passwordInput.current?.focus();
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
        return false;
      }
      client.removeQueries({
        predicate: (query) => query.queryKey[0] !== "session",
      });
      await session.refetch();
      return true;
    } catch {
      setError("Unable to connect. Check your connection and try again.");
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
  const denied = new URLSearchParams(location.search).get("denied");
  const blockedId =
    session.data?.authMode === "discord" && /^\d{17,20}$/.test(denied ?? "")
      ? denied
      : null;
  const oauthError = new URLSearchParams(location.search).get("oauth");
  return (
    <main id="main" className={styles.login}>
      <div className={styles.heading}>
        <img src="/icon.svg" alt="" width="28" height="28" />
        <span>embed-dash</span>
        <LoginThemeSwitch />
      </div>
      <section className={styles.sheet} aria-labelledby="login-title">
        <h1 id="login-title">
          {blockedId ? "Account not allowed" : "Sign in"}
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
        ) : session.data?.authMode === "discord" ? (
          <div className={styles.discordLogin}>
            {blockedId ? (
              <>
                <p>This Discord account is not approved for this instance.</p>
                <p>
                  Ask your instance operator to add your user ID to the
                  allowlist:
                </p>
                <code className={styles.userId}>{blockedId}</code>
              </>
            ) : (
              <p>
                Use an approved Discord account. Only your identity is
                requested; messages are sent by the instance’s bot.
              </p>
            )}
            {oauthError && (
              <p role="alert">
                {oauthError === "state"
                  ? "This sign-in attempt expired or could not be verified. Start again."
                  : oauthError === "cancelled"
                    ? "Discord sign-in was cancelled. You can try again."
                    : "Unable to sign in with Discord. Try again shortly."}
              </p>
            )}
            <a className={styles.primary} href="/api/auth/discord">
              <UserRound aria-hidden="true" />
              {blockedId
                ? "Try another Discord account"
                : "Sign in with Discord"}
            </a>
          </div>
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
                if (!password) setError("Enter the instance password.");
              }}
              onChange={(event) => {
                setPassword(event.target.value);
                setError("");
              }}
            />
            {error && (
              <p id="login-error" role="alert">
                <X aria-hidden="true" />
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
  return <ThemeSwitch theme={theme} onToggle={toggle} />;
}
