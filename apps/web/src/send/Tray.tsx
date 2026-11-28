import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { Guild, GuildChannel, SendTarget } from "@embed-dash/shared";
import { ChevronDown, CopyCheck, X } from "lucide-react";
import { isBlank, useDraft } from "../compose/draft";
import {
  BlockedList,
  DeliveryOptions,
  SendControls,
  SlipDetail,
  Verdict,
} from "./SendPanel";
import { useSending, type Received } from "./sending";
import { inFlight, plural, tally } from "./summary";
import styles from "./Tray.module.css";

export interface TrayEntry {
  channel: GuildChannel;
  guild: Guild;
}
/** A ticked entry on its way into the tray: where it left from. */
export interface Flight {
  id: string;
  from: DOMRect;
}

/** Slips listed before the rest fold away. */
const foldAt = 12;
/** Past this many slips they are grouped under their server names. */
const groupAt = 8;

const reduceMotion = () =>
  matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Motion tokens from tokens.css, so script-driven animation keeps the same timing. */
function motion() {
  const style = getComputedStyle(document.documentElement);
  const ms = (name: string) => parseFloat(style.getPropertyValue(name)) || 0;
  return {
    easing: style.getPropertyValue("--ease-out").trim() || "ease-out",
    move: ms("--dur-move"),
    file: ms("--dur-file"),
  };
}

/** One slip: a ticked channel, or after a send its result. */
interface Slip {
  channelId: string;
  channelName: string;
  guildId: string;
  guildName: string;
  target?: SendTarget;
}

/**
 * The deep-ink tray: the selection as slips, a large count that rolls when it
 * changes, and the send button. Once a send has run the slips become its
 * results, each with its own verdict, link or cause and retry.
 */
export function Tray({
  entries,
  received,
  onRemove,
  flightRef,
}: {
  entries: TrayEntry[];
  /** Channels that already have the message in the composer, or may have it. */
  received: ReadonlyMap<string, Received>;
  onRemove: (id: string) => void;
  flightRef: RefObject<Flight | null>;
}) {
  const { draft, issues } = useDraft();
  const { busy, reconnecting, result, retry, keepDraft, pings, silent } =
    useSending();
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const count = useRef<HTMLSpanElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const summary = useRef<HTMLParagraphElement>(null);

  // After a send the slips are its results; before one, the ticked channels.
  const slips: Slip[] = result
    ? result.targets.map((target) => ({
        channelId: target.channelId,
        channelName: target.channelName,
        guildId: target.guildId,
        guildName: target.guildName,
        target,
      }))
    : entries.map((entry) => ({
        channelId: entry.channel.id,
        channelName: entry.channel.name,
        guildId: entry.guild.id,
        guildName: entry.guild.name,
      }));
  const total = slips.length;
  const previous = useRef(total);
  const servers = new Set(slips.map((slip) => slip.guildId)).size;
  // A failure is never folded away; only sent slips past the fold are.
  const visible = showAll
    ? slips
    : slips.filter(
        (slip, i) =>
          i < foldAt || (slip.target && slip.target.status !== "sent"),
      );
  const grouped = total > groupAt;
  const groups = visible.reduce<{ id: string; name: string; slips: Slip[] }[]>(
    (all, slip) => {
      const last = all.at(-1);
      if (last?.id === slip.guildId) last.slips.push(slip);
      else all.push({ id: slip.guildId, name: slip.guildName, slips: [slip] });
      return all;
    },
    [],
  );
  const outcome = result ? tally(result) : null;
  // Copies still in flight spin; before the first answer every ticked channel does.
  const waiting = (slip: Slip) =>
    slip.target ? inFlight(slip.target) : !!busy;

  const blocked = busy
    ? null
    : entries.length === 0
      ? "Tick channels in the catalogue to choose where this goes."
      : isBlank(draft)
        ? "Nothing to send yet. Write a message in Compose."
        : issues.length > 0
          ? `${plural(issues.length, "problem", "problems")} to fix before sending.`
          : null;

  // The summary takes focus when results arrive, so they are read out and the
  // Retry button that vanished doesn't leave focus nowhere.
  const finished = !!result && !busy;
  useEffect(() => {
    if (finished) summary.current?.focus({ preventScroll: true });
  }, [finished]);

  // The numeral rolls one step up or down when the count changes.
  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = total;
    if (before === total || !count.current || reduceMotion()) return;
    const up = total > before;
    count.current.animate(
      [
        { transform: `translateY(${up ? 55 : -55}%)`, opacity: 0 },
        { transform: "none", opacity: 1 },
      ],
      { duration: motion().move, easing: motion().easing },
    );
  }, [total]);

  // Filing: a slip flies in an arc from the ticked row to its place in the tray.
  useLayoutEffect(() => {
    const trip = flightRef.current;
    flightRef.current = null;
    if (!trip || reduceMotion()) return;
    const slip = list.current?.querySelector<HTMLElement>(
      `[data-slip="${trip.id}"]`,
    );
    const slipBox = slip?.getBoundingClientRect();
    const landsOnSlip =
      slipBox &&
      slipBox.width > 0 &&
      slipBox.top < innerHeight &&
      slipBox.bottom > 0;
    const target = landsOnSlip
      ? slipBox
      : count.current?.getBoundingClientRect();
    const entry = entries.find((e) => e.channel.id === trip.id);
    if (!target || !entry) return;
    const ghost = document.createElement("div");
    ghost.className = styles.ghost;
    ghost.setAttribute("aria-hidden", "true");
    const name = document.createElement("span");
    name.textContent = `#${entry.channel.name}`;
    const server = document.createElement("small");
    server.textContent = entry.guild.name;
    ghost.append(name, server);
    document.body.append(ghost);
    const [x0, y0] = [trip.from.left, trip.from.top];
    const [x1, y1] = [target.left, target.top];
    if (landsOnSlip) slip!.style.opacity = "0";
    const animation = ghost.animate(
      [
        { transform: `translate(${x0}px, ${y0}px) scale(0.94)`, opacity: 0 },
        {
          transform: `translate(${x0}px, ${y0 - 6}px) scale(1) rotate(-1.5deg)`,
          opacity: 1,
          offset: 0.12,
        },
        {
          transform: `translate(${x0 + (x1 - x0) * 0.62}px, ${Math.min(y0, y1) - 40}px) scale(1.02) rotate(1deg)`,
          opacity: 1,
          offset: 0.62,
        },
        { transform: `translate(${x1}px, ${y1}px) scale(0.98)`, opacity: 0.85 },
      ],
      { duration: motion().file, easing: motion().easing },
    );
    const land = () => {
      ghost.remove();
      if (slip) slip.style.opacity = "";
    };
    animation.onfinish = land;
    animation.oncancel = land;
  });

  const remove = (id: string, index: number) => {
    const next = visible[index + 1] ?? visible[index - 1];
    onRemove(id);
    // Keep focus in the tray: on the neighbouring slip, else the tray heading.
    requestAnimationFrame(() => {
      const button = next
        ? list.current?.querySelector<HTMLElement>(
            `[data-slip="${next.channelId}"] button`,
          )
        : null;
      (button ?? heading.current)?.focus();
    });
  };

  const position = new Map(visible.map((slip, i) => [slip.channelId, i]));
  const slip = (item: Slip) => {
    const index = position.get(item.channelId)!;
    const pending = waiting(item);
    const has = !item.target && received.get(item.channelId);
    return (
      <li
        key={item.target?.id ?? item.channelId}
        className={styles.slip}
        data-slip={item.channelId}
        data-result={pending ? "pending" : item.target?.status}
      >
        <span className={styles.slipText}>
          <b>#{item.channelName}</b>
          {!grouped && <small>{item.guildName}</small>}
          {has && (
            <small className={styles.has}>
              <CopyCheck aria-hidden="true" />
              {has === "sent"
                ? "Already has this message"
                : "May already have it"}
            </small>
          )}
        </span>
        {item.target || pending ? (
          <>
            <Verdict
              state={pending ? "waiting" : item.target!.status}
              index={index}
            />
            {item.target && (
              <SlipDetail
                target={item.target}
                retrying={pending}
                disabled={!!busy}
                onRetry={() => void retry([item.target!.id])}
              />
            )}
          </>
        ) : (
          <button
            type="button"
            className={styles.remove}
            aria-label={`Take #${item.channelName} (${item.guildName}) out of the tray`}
            onClick={() => remove(item.channelId, index)}
          >
            <X aria-hidden="true" />
          </button>
        )}
      </li>
    );
  };

  return (
    <aside
      className={styles.tray}
      aria-labelledby="tray-title"
      data-open={open || undefined}
      data-empty={total === 0 || undefined}
    >
      <div className={styles.head}>
        <h3 id="tray-title" ref={heading} tabIndex={-1}>
          Tray
        </h3>
        <p className={styles.summary} aria-live="polite">
          {total ? (
            <>
              <b>{plural(total, "channel", "channels")}</b> in{" "}
              {plural(servers, "server", "servers")}
            </>
          ) : (
            "Nothing ticked yet"
          )}
        </p>
        <span className={styles.countClip} aria-hidden="true">
          <span ref={count} className={styles.count}>
            {total}
          </span>
        </span>
        <button
          type="button"
          className={styles.expand}
          aria-expanded={open}
          aria-controls="tray-slips"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Hide" : "Show"}{" "}
          <span className="visually-hidden">
            {result ? "results" : "ticked channels"}
          </span>
          <ChevronDown aria-hidden="true" />
        </button>
      </div>
      <div id="tray-slips" ref={list} className={styles.slips}>
        {total === 0 ? (
          <p className={styles.empty}>
            <b>The tray is empty.</b> Tick channels in the catalogue to file
            them here.
          </p>
        ) : grouped ? (
          groups.map((group) => (
            <section key={group.id} className={styles.group}>
              <h4>
                {group.name}
                <span>{group.slips.length}</span>
              </h4>
              <ul>{group.slips.map((item) => slip(item))}</ul>
            </section>
          ))
        ) : (
          <ul>{visible.map((item) => slip(item))}</ul>
        )}
        {total > visible.length && (
          <button
            type="button"
            className={styles.folded}
            onClick={() => setShowAll(true)}
          >
            + {total - visible.length} more · Show
          </button>
        )}
        {!result && !busy && entries.length > 0 && (
          <DeliveryOptions channels={entries.length} />
        )}
        {!result &&
          !busy &&
          entries.length > 0 &&
          !isBlank(draft) &&
          issues.length > 0 && <BlockedList issues={issues} />}
      </div>
      <SendControls
        draft={draft}
        entries={entries}
        received={received}
        blocked={blocked}
        describedBy="tray-note"
        onKeep={() => {
          keepDraft();
          setShowAll(false);
          requestAnimationFrame(() => heading.current?.focus());
        }}
      />
      {busy ? (
        <p id="tray-note" className={styles.rising} aria-live="polite">
          <b>
            {reconnecting
              ? "Lost contact with the server; still checking."
              : outcome
                ? outcome.sentence
                : `Sending to ${plural(entries.length, "channel", "channels")}…`}
          </b>{" "}
          {reconnecting
            ? "The send carries on there. Nothing is sent twice."
            : `Mentions ${pings.length ? `notify ${pings.join(", ")}` : "notify nobody"}${silent ? "; sent silently" : ""}. Channels stay locked until every one has an answer.`}
        </p>
      ) : outcome ? (
        <p
          ref={summary}
          id="tray-note"
          className={styles.rising}
          tabIndex={-1}
          aria-live="polite"
        >
          <b>{outcome.sentence}</b>{" "}
          {outcome.stoppedByToken
            ? "Discord rejected the bot token, so the send stopped."
            : outcome.failed
              ? "Retry sends only to the failed channels."
              : outcome.unknown
                ? "Look at the unconfirmed channels in Discord before sending again."
                : "Every copy arrived."}
        </p>
      ) : (
        <p
          id="tray-note"
          className={styles.note}
          data-reason={blocked ? "" : undefined}
        >
          {blocked ??
            "Mentions notify nobody unless you allow it above. Your selection stays here while you switch views."}
        </p>
      )}
    </aside>
  );
}
