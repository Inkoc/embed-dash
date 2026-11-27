import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { PingKind, SendResult } from "@embed-dash/shared";
import { toMessage, useDraft } from "../compose/draft";
import type { Session } from "../shell/SessionGate";
import { refreshGuilds } from "./guilds";
import { useSelection, withIds } from "./selection";
import { postSend, SendFailure } from "./sendApi";

interface Sending {
  /** Who the message may notify; none unless the operator ticks a kind. */
  pings: readonly PingKind[];
  setPing: (kind: PingKind, on: boolean) => void;
  silent: boolean;
  setSilent: (on: boolean) => void;
  /** The target IDs being retried, or null for the first send; undefined when idle. */
  busy: { retrying: ReadonlySet<string> | null } | undefined;
  result: SendResult | null;
  /** Why the last attempt produced no results. */
  problem: string | null;
  send: (channelIds: string[]) => Promise<void>;
  /** Re-sends the failed copies, or only the given ones. */
  retry: (targetIds?: string[]) => Promise<void>;
  /** Leaves the results and goes back to choosing channels. */
  dismiss: () => void;
}

const SendingContext = createContext<Sending | null>(null);

/**
 * Sits above the views, like the selection, so leaving Send for Compose
 * doesn't lose the results or the retry. Pings start off for every send.
 */
export function SendingProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const { draft } = useDraft();
  const [, setSelected] = useSelection();
  const [pings, setPings] = useState<readonly PingKind[]>([]);
  const [silent, setSilent] = useState(false);
  const [busy, setBusy] = useState<Sending["busy"]>();
  const [result, setResult] = useState<SendResult | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const running = useRef(false);

  async function run(
    url: string,
    body: object,
    retrying: ReadonlySet<string> | null,
  ) {
    // A second click while a send is in flight must not post twice.
    if (running.current) return;
    running.current = true;
    setBusy({ retrying });
    setProblem(null);
    try {
      const session = client.getQueryData<Session>(["session"]);
      setResult(await postSend(url, body, session?.csrfToken ?? ""));
    } catch (error) {
      const failure =
        error instanceof SendFailure
          ? error
          : new SendFailure("The send failed. Try again.");
      for (const id of failure.details.missingFiles ?? [])
        client.setQueryData(["upload", id], false);
      if (failure.details.unavailable) {
        setSelected((set) => withIds(set, failure.details.unavailable!, false));
        void refreshGuilds(client);
      }
      setProblem(failure.message);
    } finally {
      running.current = false;
      setBusy(undefined);
    }
  }

  const value: Sending = {
    pings,
    setPing: (kind, on) =>
      setPings((kinds) =>
        on
          ? kinds.includes(kind)
            ? kinds
            : [...kinds, kind]
          : kinds.filter((other) => other !== kind),
      ),
    silent,
    setSilent,
    busy,
    result,
    problem,
    send: (channelIds) =>
      run(
        "/api/sends",
        { payload: { ...toMessage(draft), pings, silent }, channelIds },
        null,
      ),
    retry: (targetIds) => {
      const ids =
        targetIds ??
        result?.targets.filter((t) => t.status === "failed").map((t) => t.id) ??
        [];
      return run(
        `/api/sends/${result?.id}/retry`,
        targetIds ? { targetIds } : {},
        new Set(ids),
      );
    },
    dismiss: () => {
      setResult(null);
      setProblem(null);
    },
  };
  return <SendingContext value={value}>{children}</SendingContext>;
}

export function useSending() {
  const value = useContext(SendingContext);
  if (!value) throw new Error("useSending needs a SendingProvider");
  return value;
}
