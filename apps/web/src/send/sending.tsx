import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  MessageDraft,
  PingKind,
  SendResult,
  SendTarget,
} from "@embed-dash/shared";
import { toMessage, useDraft, type Draft } from "../compose/draft";
import { AppError } from "../errors";
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
import { inFlight } from "./summary";

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
  problem: AppError | null;
  /**
   * Channels that already have the message now in the composer, or may have
   * it (no answer from Discord), from this session's sends. Editing the
   * message makes it a different one, so the marks go.
   */
  received: (draft: Draft) => ReadonlyMap<string, Received>;
  /** Call when the confirmation opens: that attempt gets its own id, so repeating it can't post twice. */
  prepare: () => void;
  send: (channelIds: string[]) => Promise<void>;
  /** Re-sends the failed copies, or only the given ones. */
  retry: (targetIds?: string[]) => Promise<void>;
  /**
   * Leaves the results and goes back to choosing channels for the same
   * message; the channels that got it are unticked, so sending there again
   * takes a deliberate tick.
   */
  keepDraft: () => void;
  /** Clears the results, the selection, the delivery options and the draft. */
  startOver: () => void;
}

export type Received = "sent" | "unknown";

/** The message itself, without who it may notify, so two sends of it compare equal. */
const messageKey = (message: MessageDraft) =>
  JSON.stringify([message.content, message.embeds, message.attachments]);

/** Which channels a send reached, or may have reached. */
const reachedBy = (targets: readonly SendTarget[]) =>
  targets.flatMap((target): [string, Received][] =>
    target.status === "sent" || target.status === "unknown"
      ? [[target.channelId, target.status]]
      : [],
  );

const SendingContext = createContext<Sending | null>(null);

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Where the send in flight is kept, so a reload picks its progress up again. */
const inFlightKey = "embed-dash:send-in-flight";

interface InFlight {
  url: string;
  body: object;
  id: string;
  /** The target IDs being retried, or null for the first send. */
  retrying: string[] | null;
}

const rememberInFlight = (value: InFlight | null) => {
  try {
    if (value) sessionStorage.setItem(inFlightKey, JSON.stringify(value));
    else sessionStorage.removeItem(inFlightKey);
  } catch {
    // Without storage a reload forgets the send; it still runs on the server.
  }
};

function recallInFlight(): InFlight | null {
  try {
    const stored = sessionStorage.getItem(inFlightKey);
    return stored ? (JSON.parse(stored) as InFlight) : null;
  } catch {
    return null;
  }
}

/**
 * Sits above the views, like the selection, so leaving Send for Compose
 * doesn't lose the results or the retry. Pings start off for every send.
 */
export function SendingProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const { draft, clear } = useDraft();
  const [, setSelected] = useSelection();
  const [pings, setPings] = useState<readonly PingKind[]>([]);
  const [silent, setSilent] = useState(false);
  // What a reload interrupted, read once; it also decides the first `busy`.
  const [resumed] = useState(recallInFlight);
  const [busy, setBusy] = useState<Sending["busy"]>(
    resumed
      ? {
          retrying: resumed.retrying && new Set(resumed.retrying),
        }
      : undefined,
  );
  const [reconnecting, setReconnecting] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [problem, setProblem] = useState<AppError | null>(null);
  // Which message the current results are for, and the channels it reached across sends.
  const sentKey = useRef<string | null>(
    resumed && !resumed.retrying
      ? messageKey((resumed.body as { payload: MessageDraft }).payload)
      : null,
  );
  const [reached, setReached] = useState<{
    key: string;
    channels: ReadonlyMap<string, Received>;
  } | null>(null);
  const showResult = (next: SendResult) => {
    setResult(next);
    const key = sentKey.current;
    if (!key) return;
    setReached((before) => {
      const channels = new Map(before?.key === key ? before.channels : []);
      for (const [id, status] of reachedBy(next.targets))
        if (channels.get(id) !== "sent") channels.set(id, status);
      return { key, channels };
    });
  };
  const running = useRef(false);
  const attempt = useRef<string | null>(null);
  const csrf = () => client.getQueryData<Session>(["session"])?.csrfToken ?? "";

  /**
   * Asks the server how far the send has got until no copy is left in flight.
   * Without an answer the send may be running there, so it keeps asking rather
   * than offering Send again. `post` repeats the first request when the server
   * has no such send: the id makes that safe, and it is the only way to learn
   * a send that was dropped before it was stored never will be.
   */
  async function follow(id: string, post?: () => Promise<unknown>) {
    for (;;) {
      try {
        const next = await fetchSend(id);
        setReconnecting(false);
        showResult(next);
        if (!next.targets.some(inFlight)) return;
      } catch (error) {
        if (!(error instanceof SendFailure)) throw error;
        if (error.details.gone && post) {
          setReconnecting(true);
          try {
            await post();
            continue;
          } catch (again) {
            if (!(again instanceof SendFailure && again.details.lost))
              throw again;
          }
        } else if (error.details.lost) setReconnecting(true);
        else throw error;
      }
      await wait(pollIntervalMs);
    }
  }

  /** Posts the request and follows the send to its end; the caller has set `busy`. */
  async function deliver(
    flight: InFlight,
    // A reload keeps following a retry rather than asking for it again.
    reloaded = false,
  ) {
    const retrying = flight.retrying !== null;
    const post = () =>
      startSend(retrying ? "retry" : "send", flight.url, flight.body, csrf());
    try {
      if (!(reloaded && retrying))
        try {
          await post();
        } catch (error) {
          // The request may have been recorded before the connection dropped; the send's id tells.
          if (!(error instanceof SendFailure && error.details.lost))
            throw error;
        }
      await follow(flight.id, retrying ? undefined : post);
    } catch (error) {
      const failure =
        error instanceof SendFailure
          ? error
          : new SendFailure(
              new AppError(
                `${retrying ? "Couldn’t retry" : "Couldn’t send"}: something went wrong in the app. Look at the channels in Discord before trying again.`,
                error instanceof Error ? error.name : null,
              ),
            );
      for (const missing of failure.details.missingFiles ?? [])
        client.setQueryData(["upload", missing], false);
      if (failure.details.unavailable) {
        setSelected((set) => withIds(set, failure.details.unavailable!, false));
        void refreshGuilds(client);
      }
      setProblem(failure);
    } finally {
      rememberInFlight(null);
      running.current = false;
      setReconnecting(false);
      setBusy(undefined);
    }
  }

  function run(flight: InFlight) {
    // A second click while a send is in flight must not post twice.
    if (running.current) return Promise.resolve();
    running.current = true;
    setBusy({ retrying: flight.retrying && new Set(flight.retrying) });
    setProblem(null);
    rememberInFlight(flight);
    return deliver(flight);
  }

  // A page reloaded mid-send takes its progress up again.
  useEffect(() => {
    if (resumed && !running.current) {
      running.current = true;
      void deliver(resumed, true);
    }
    // Once, on mount; `deliver` only reads state through refs and setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function dismiss() {
    attempt.current = null;
    setResult(null);
    setProblem(null);
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
    received: (current) =>
      reached && reached.key === messageKey(toMessage(current))
        ? reached.channels
        : new Map(),
    prepare: () => {
      attempt.current = newSendId();
    },
    send: (channelIds) => {
      const id = (attempt.current ??= newSendId());
      const message = toMessage(draft);
      sentKey.current = messageKey(message);
      return run({
        url: "/api/sends",
        body: {
          id,
          payload: { ...message, pings, silent },
          channelIds,
        },
        id,
        retrying: null,
      });
    },
    retry: (targetIds) => {
      const ids =
        targetIds ??
        result?.targets.filter((t) => t.status === "failed").map((t) => t.id) ??
        [];
      return run({
        url: `/api/sends/${result?.id}/retry`,
        body: targetIds ? { targetIds } : {},
        id: result?.id ?? "",
        retrying: ids,
      });
    },
    keepDraft: () => {
      const got = result ? reachedBy(result.targets).map(([id]) => id) : [];
      setSelected((set) => withIds(set, got, false));
      dismiss();
    },
    startOver: () => {
      dismiss();
      sentKey.current = null;
      setReached(null);
      setSelected(new Set());
      setPings([]);
      setSilent(false);
      clear();
    },
  };
  return <SendingContext value={value}>{children}</SendingContext>;
}

export function useSending() {
  const value = useContext(SendingContext);
  if (!value) throw new Error("useSending needs a SendingProvider");
  return value;
}
