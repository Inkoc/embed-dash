import { useEffect, useRef, useState } from "react";
import { LogIn, UserRound, X } from "lucide-react";
import type { SessionUser } from "@embed-dash/shared";
import styles from "./SessionGate.module.css";

const startPath = "/api/auth/discord";
const reasons: Record<string, string> = {
  expired:
    "That sign-in expired or was started in another browser. Start it again here.",
  cancelled: "Sign-in was cancelled on Discord. Try again when you are ready.",
  busy: "Too many sign-in attempts from this address. Wait a minute, then try again.",
  failed:
    "Discord sign-in did not complete. Try again, or ask the operator to check the server log.",
};

export function DiscordEntry({ reason }: { reason: string | null }) {
  const message = reason ? reasons[reason] : undefined;
  const link = useRef<HTMLAnchorElement>(null);
  // React only auto-focuses form controls, and this is the one thing to do here.
  useEffect(() => link.current?.focus(), []);
  return (
    <div className={styles.stack}>
      <p>
        Sign in with your Discord account. Only accounts the instance operator
        has approved can enter.
      </p>
      <p className={styles.note}>
        Discord is asked only to confirm who you are (the identify scope). The
        instance cannot post as you or read your servers or messages, and it
        ends the authorization with Discord as soon as it has read your name.
      </p>
      {message && (
        <p role="alert">
          <X aria-hidden="true" />
          {message}
        </p>
      )}
      <a ref={link} className={styles.primary} href={startPath}>
        <LogIn aria-hidden="true" className={styles.icon} />
        Sign in with Discord
      </a>
    </div>
  );
}

export function NotAllowed({ userId }: { userId: string }) {
  return (
    <div className={styles.stack}>
      <p>
        This Discord account is not on the approved list for this instance. Send
        the operator this user ID so they can add it:
      </p>
      <p className={styles.userId}>{userId}</p>
      <a className={styles.secondary} href={startPath}>
        Sign in with another account
      </a>
    </div>
  );
}

export function UserBadge({ user }: { user: SessionUser }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className={styles.user}>
      {user.avatarUrl && !broken ? (
        <img
          src={user.avatarUrl}
          alt=""
          width="28"
          height="28"
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
        />
      ) : (
        <UserRound aria-hidden="true" className={styles.icon} />
      )}
      <span className={styles.userName}>{user.name}</span>
    </span>
  );
}
