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
import {
  fetchSend,
  newSendId,
  pollIntervalMs,
  SendFailure,
  startSend,
} from "./sendApi";

interface Sending {
  /** Who the message may notify; none unless the operator ticks a kind. */
  pings: readonly PingKind[];
  setPing: (kind: PingKind, on: boolean) => void;
  silent: boolean;
  setSilent: (on: boolean) => void;
  /**
   * Set while a send or retry is being delivered: the target IDs being retried,
   * or null for the first send. The selection is frozen meanwhile.
   */
  busy: { retrying: ReadonlySet<string> | null } | undefined;
  /** True while the server can't be reached to ask how far the send has got. */
  reconnecting: boolean;
  /** The send so far; its copies fill in as they complete. */
  result: SendResult | null;
  /** Why the last attempt produced no results. */
  problem: string | null;
  /** Call when the confirmation opens: that attempt gets its own id, so repeating it can't post twice. */
  prepare: () => void;
  send: (channelIds: string[]) => Promise<void>;
  /** Re-sends the failed copies, or only the given ones. */
  retry: (targetIds?: string[]) => Promise<void>;
  /** Leaves the results and goes back to choosing channels. */
  dismiss: () => void;
}

const SendingContext = createContext<Sending | null>(null);

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  const [reconnecting, setReconnecting] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const running = useRef(false);
  const attempt = useRef<string | null>(null);
  const csrf = () => client.getQueryData<Session>(["session"])?.csrfToken ?? "";

  /** Asks the server how far the send has got until no copy is left in flight. */
  async function follow(id: string) {
    for (;;) {
      try {
        const next = await fetchSend(id);
        setReconnecting(false);
        setResult(next);
        if (!next.targets.some((target) => target.status === "pending")) return;
      } catch (error) {
        // Without an answer the send keeps going on the server; keep asking rather than offering Send again.
        if (!(error instanceof SendFailure && error.details.lost)) throw error;
        setReconnecting(true);
      }
      await wait(pollIntervalMs);
    }
  }

  async function run(
    url: string,
    body: object,
    id: string,
    retrying: ReadonlySet<string> | null,
  ) {
    // A second click while a send is in flight must not post twice.
    if (running.current) return;
    running.current = true;
    setBusy({ retrying });
    setProblem(null);
    try {
      try {
        await startSend(url, body, csrf());
      } catch (error) {
        // The request may have been recorded before the connection dropped; the send's id tells.
        if (!(error instanceof SendFailure && error.details.lost)) throw error;
      }
      await follow(id);
    } catch (error) {
      const failure =
        error instanceof SendFailure
          ? error
          : new SendFailure("The send failed. Try again.");
      for (const missing of failure.details.missingFiles ?? [])
        client.setQueryData(["upload", missing], false);
      if (failure.details.unavailable) {
        setSelected((set) => withIds(set, failure.details.unavailable!, false));
        void refreshGuilds(client);
      }
      setProblem(
        failure.details.gone && !retrying
          ? "The request never reached the server, so nothing was posted. You can send again."
          : failure.message,
      );
    } finally {
      running.current = false;
      setReconnecting(false);
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
    reconnecting,
    result,
    problem,
    prepare: () => {
      attempt.current = newSendId();
    },
    send: (channelIds) => {
      const id = (attempt.current ??= newSendId());
      return run(
        "/api/sends",
        { id, payload: { ...toMessage(draft), pings, silent }, channelIds },
        id,
        null,
      );
    },
    retry: (targetIds) => {
      const ids =
        targetIds ??
        result?.targets.filter((t) => t.status === "failed").map((t) => t.id) ??
        [];
      return run(
        `/api/sends/${result?.id}/retry`,
        targetIds ? { targetIds } : {},
        result?.id ?? "",
        new Set(ids),
      );
    },
    dismiss: () => {
      attempt.current = null;
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
