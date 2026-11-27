import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { Guild, GuildChannel } from "@embed-dash/shared";
import { ChevronDown, X } from "lucide-react";
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

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/**
 * The deep-ink tray: the selection as slips, a large count that rolls when it
 * changes, and the send button. Sending comes with the next step of the app,
 * so the button stays disabled and says why.
 */
export function Tray({
  entries,
  onRemove,
  flightRef,
}: {
  entries: TrayEntry[];
  onRemove: (id: string) => void;
  flightRef: RefObject<Flight | null>;
}) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const count = useRef<HTMLSpanElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const previous = useRef(entries.length);
  const servers = new Set(entries.map((e) => e.guild.id)).size;
  const visible = showAll ? entries : entries.slice(0, foldAt);
  const grouped = entries.length > groupAt;
  const groups = visible.reduce<{ guild: Guild; entries: TrayEntry[] }[]>(
    (all, entry) => {
      const last = all.at(-1);
      if (last?.guild.id === entry.guild.id) last.entries.push(entry);
      else all.push({ guild: entry.guild, entries: [entry] });
      return all;
    },
    [],
  );

  // The numeral rolls one step up or down when the count changes.
  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = entries.length;
    if (before === entries.length || !count.current || reduceMotion()) return;
    const up = entries.length > before;
    count.current.animate(
      [
        { transform: `translateY(${up ? 55 : -55}%)`, opacity: 0 },
        { transform: "none", opacity: 1 },
      ],
      { duration: motion().move, easing: motion().easing },
    );
  }, [entries.length]);

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
            `[data-slip="${next.channel.id}"] button`,
          )
        : null;
      (button ?? heading.current)?.focus();
    });
  };

  const position = new Map(visible.map((e, i) => [e.channel.id, i]));
  const slip = (entry: TrayEntry) => (
    <li
      key={entry.channel.id}
      className={styles.slip}
      data-slip={entry.channel.id}
    >
      <span className={styles.slipText}>
        <b>#{entry.channel.name}</b>
        {!grouped && <small>{entry.guild.name}</small>}
      </span>
      <button
        type="button"
        className={styles.remove}
        aria-label={`Take #${entry.channel.name} (${entry.guild.name}) out of the tray`}
        onClick={() =>
          remove(entry.channel.id, position.get(entry.channel.id)!)
        }
      >
        <X aria-hidden="true" />
      </button>
    </li>
  );

  return (
    <aside
      className={styles.tray}
      aria-labelledby="tray-title"
      data-open={open || undefined}
      data-empty={entries.length === 0 || undefined}
    >
      <div className={styles.head}>
        <h3 id="tray-title" ref={heading} tabIndex={-1}>
          Tray
        </h3>
        <p className={styles.summary} aria-live="polite">
          {entries.length ? (
            <>
              <b>{plural(entries.length, "channel", "channels")}</b> in{" "}
              {plural(servers, "server", "servers")}
            </>
          ) : (
            "Nothing ticked yet"
          )}
        </p>
        <span className={styles.countClip} aria-hidden="true">
          <span ref={count} className={styles.count}>
            {entries.length}
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
          <span className="visually-hidden">ticked channels</span>
          <ChevronDown aria-hidden="true" />
        </button>
      </div>
      <div id="tray-slips" ref={list} className={styles.slips}>
        {entries.length === 0 ? (
          <p className={styles.empty}>
            <b>The tray is empty.</b> Tick channels in the catalogue to file
            them here.
          </p>
        ) : grouped ? (
          groups.map((group) => (
            <section key={group.guild.id} className={styles.group}>
              <h4>
                {group.guild.name}
                <span>{group.entries.length}</span>
              </h4>
              <ul>{group.entries.map((entry) => slip(entry))}</ul>
            </section>
          ))
        ) : (
          <ul>{visible.map((entry) => slip(entry))}</ul>
        )}
        {entries.length > visible.length && (
          <button
            type="button"
            className={styles.folded}
            onClick={() => setShowAll(true)}
          >
            + {entries.length - visible.length} more · Show
          </button>
        )}
      </div>
      <button
        type="button"
        className={styles.go}
        disabled
        aria-describedby="tray-note"
      >
        {entries.length
          ? `Send to ${plural(entries.length, "channel", "channels")}`
          : "Send"}
      </button>
      <p id="tray-note" className={styles.note}>
        Sending isn’t available yet. Your selection stays here while you switch
        views.
      </p>
    </aside>
  );
}
