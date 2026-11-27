import {
  memo,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from "react";
import {
  canSendTo,
  channelPermissions,
  type Guild,
  type GuildChannel,
} from "@embed-dash/shared";
import {
  Check,
  ChevronDown,
  Hash,
  Lock,
  Megaphone,
  MessagesSquare,
} from "lucide-react";
import {
  callNumberStrongFrom,
  kindLabel,
  type ChannelHit,
  type DrawerHit,
} from "./catalogue";
import { Marked } from "./Marked";
import { ServerMark } from "./ServerMark";
import styles from "./Catalogue.module.css";

/** Rows a drawer shows before folding the rest behind "Show all". */
const foldAt = 8;

const kindIcon = {
  text: Hash,
  announcement: Megaphone,
  forum: MessagesSquare,
} as const;

export const drawerId = (guildId: string) => `drawer-${guildId}`;

function blockedReason(channel: GuildChannel): string | null {
  if (canSendTo(channel)) return null;
  // Forum posts are new threads, which sending doesn't do yet.
  if (
    channel.kind === "forum" &&
    !channelPermissions.some(
      (p) => p.required && channel.missing.includes(p.key),
    )
  )
    return "Forum posting isn’t available yet";
  const labels = channelPermissions
    .filter((p) => p.required && channel.missing.includes(p.key))
    .map((p) => p.label);
  return `Bot is missing ${labels.join(" and ")} here`;
}

interface Props {
  drawers: DrawerHit[];
  selected: ReadonlySet<string>;
  mainIds: ReadonlySet<string>;
  collapsed: ReadonlySet<string>;
  onToggleCollapsed: (guildId: string) => void;
  onTick: (channel: GuildChannel, on: boolean, row: HTMLElement) => void;
  onTickMany: (ids: string[], on: boolean) => void;
  onLeaveTop: () => void;
  onInView: (guildId: string) => void;
}

/**
 * One drawer per server, each a ruled list of channel entries. Arrow keys move
 * one focus frame between entries; only the current entry is in the tab order,
 * so Tab leaves the list instead of walking every channel.
 */
export function Catalogue({
  drawers,
  selected,
  mainIds,
  collapsed,
  onToggleCollapsed,
  onTick,
  onTickMany,
  onLeaveTop,
  onInView,
}: Props) {
  const root = useRef<HTMLDivElement>(null);
  const cursor = useRef<HTMLSpanElement>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [active, setActive] = useState<string | null>(null);

  const visibleRows = drawers.flatMap((d) =>
    collapsed.has(d.guild.id)
      ? []
      : shown(d, expanded).map((h) => h.channel.id),
  );
  const tabbable =
    active && visibleRows.includes(active) ? active : (visibleRows[0] ?? null);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const intersecting = new Set<string>();
    const order = drawers.map((d) => d.guild.id);
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.drawer!;
          if (entry.isIntersecting) intersecting.add(id);
          else intersecting.delete(id);
        }
        const first = order.find((id) => intersecting.has(id));
        if (first) onInView(first);
      },
      // The band just under the sticky search decides which drawer is "in view".
      { rootMargin: "-25% 0px -60% 0px" },
    );
    for (const drawer of element.querySelectorAll("[data-drawer]"))
      observer.observe(drawer);
    return () => observer.disconnect();
  }, [drawers, onInView]);

  const rows = () => [
    ...(root.current?.querySelectorAll<HTMLInputElement>("input[data-row]") ??
      []),
  ];
  const onKeyDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (!(target instanceof HTMLInputElement) || !target.dataset.row) return;
    const list = rows();
    const index = list.indexOf(target);
    const to = (i: number) => {
      event.preventDefault();
      list[Math.max(0, Math.min(list.length - 1, i))]?.focus();
    };
    if (event.key === "ArrowDown") to(index + 1);
    else if (event.key === "ArrowUp") {
      if (index === 0) {
        event.preventDefault();
        onLeaveTop();
      } else to(index - 1);
    } else if (event.key === "Home") to(0);
    else if (event.key === "End") to(list.length - 1);
    else if (event.key === "Enter") {
      event.preventDefault();
      target.click();
    }
  };

  // The frame glides to the focused entry instead of each entry drawing a ring.
  const placeCursor = (event: FocusEvent) => {
    const target = event.target as HTMLElement;
    const frame = cursor.current;
    if (!frame || !root.current || !target.dataset.row) return;
    setActive(target.dataset.row);
    if (!target.matches(":focus-visible")) return;
    const row = target.closest("li")!.getBoundingClientRect();
    const box = root.current.getBoundingClientRect();
    frame.style.transform = `translateY(${row.top - box.top}px)`;
    frame.style.height = `${row.height}px`;
    frame.dataset.show = frame.dataset.show === undefined ? "first" : "";
  };
  const hideCursor = (event: FocusEvent) => {
    if (root.current?.contains(event.relatedTarget as Node | null)) return;
    if (cursor.current) delete cursor.current.dataset.show;
  };

  return (
    <div
      ref={root}
      className={styles.catalogue}
      onKeyDown={onKeyDown}
      onFocus={placeCursor}
      onBlur={hideCursor}
    >
      <span ref={cursor} className={styles.cursor} aria-hidden="true" />
      {drawers.map((drawer) => (
        <Drawer
          key={drawer.guild.id}
          drawer={drawer}
          selected={selected}
          mainIds={mainIds}
          tabbable={tabbable}
          open={!collapsed.has(drawer.guild.id)}
          expanded={expanded.has(drawer.guild.id)}
          onToggleOpen={() => onToggleCollapsed(drawer.guild.id)}
          onExpand={() =>
            setExpanded((set) => new Set(set).add(drawer.guild.id))
          }
          onTick={onTick}
          onTickMany={onTickMany}
        />
      ))}
    </div>
  );
}

function shown(drawer: DrawerHit, expanded: ReadonlySet<string>) {
  const { channels } = drawer;
  // Folding only pays off when it hides more than a couple of rows.
  return expanded.has(drawer.guild.id) || channels.length <= foldAt + 2
    ? channels
    : channels.slice(0, foldAt);
}

function Drawer({
  drawer,
  selected,
  mainIds,
  tabbable,
  open,
  expanded,
  onToggleOpen,
  onExpand,
  onTick,
  onTickMany,
}: {
  drawer: DrawerHit;
  selected: ReadonlySet<string>;
  mainIds: ReadonlySet<string>;
  tabbable: string | null;
  open: boolean;
  expanded: boolean;
  onToggleOpen: () => void;
  onExpand: () => void;
  onTick: Props["onTick"];
  onTickMany: Props["onTickMany"];
}) {
  const { guild } = drawer;
  const postable = guild.channels.filter(canSendTo);
  const ticked = postable.filter((c) => selected.has(c.id)).length;
  const inSearch = drawer.channels
    .map((h) => h.channel)
    .filter(canSendTo)
    .map((c) => c.id);
  const allTicked =
    inSearch.length > 0 && inSearch.every((id) => selected.has(id));
  const rows = shown(drawer, expanded ? new Set([guild.id]) : new Set());
  const listId = `${drawerId(guild.id)}-list`;
  const nameId = `${drawerId(guild.id)}-name`;

  return (
    <section
      id={drawerId(guild.id)}
      data-drawer={guild.id}
      className={styles.drawer}
      aria-labelledby={nameId}
    >
      <div className={styles.head} data-open={open || undefined}>
        <h3 className={styles.title}>
          <button
            type="button"
            className={styles.toggle}
            aria-expanded={open}
            aria-controls={listId}
            onClick={onToggleOpen}
            data-drawer-toggle={guild.id}
          >
            <ChevronDown className={styles.chevron} aria-hidden="true" />
            <ServerMark guild={guild} />
            <span id={nameId} className={styles.name}>
              <Marked text={guild.name} ranges={drawer.name} />
            </span>
          </button>
        </h3>
        <p className={styles.facts}>
          <span className={styles.call}>
            <span className="visually-hidden">Server ID</span>{" "}
            <Marked
              text={guild.id}
              ranges={drawer.id}
              strongFrom={callNumberStrongFrom(guild.id)}
            />
          </span>
          <span className={styles.ticked}>
            <b>{ticked}</b> of {postable.length} ticked
          </span>
        </p>
        <button
          type="button"
          className={styles.quiet}
          disabled={!inSearch.length}
          onClick={() => onTickMany(inSearch, !allTicked)}
        >
          {allTicked ? "Clear" : "Select all"}{" "}
          <span className="visually-hidden">in {guild.name}</span>
        </button>
      </div>
      {open && (
        <div id={listId}>
          {guild.channels.length === 0 ? (
            <p className={styles.note}>
              No text, announcement or forum channels here.
            </p>
          ) : (
            <ul className={styles.rows} aria-label={`${guild.name} channels`}>
              {rows.map((hit) => (
                <Row
                  key={hit.channel.id}
                  hit={hit}
                  guild={guild}
                  on={selected.has(hit.channel.id)}
                  main={mainIds.has(hit.channel.id)}
                  tabbable={tabbable === hit.channel.id}
                  onTick={onTick}
                />
              ))}
            </ul>
          )}
          {rows.length < drawer.channels.length && (
            <p className={styles.note}>
              {drawer.channels.length - rows.length} more channels in this
              drawer ·{" "}
              <button type="button" className={styles.link} onClick={onExpand}>
                Show all{" "}
                <span className="visually-hidden">in {guild.name}</span>
              </button>
            </p>
          )}
        </div>
      )}
    </section>
  );
}

const Row = memo(function Row({
  hit,
  guild,
  on,
  main,
  tabbable,
  onTick,
}: {
  hit: ChannelHit;
  guild: Guild;
  on: boolean;
  main: boolean;
  tabbable: boolean;
  onTick: Props["onTick"];
}) {
  const { channel } = hit;
  const Icon = kindIcon[channel.kind];
  const reason = blockedReason(channel);
  const noFiles = !reason && channel.missing.includes("attachFiles");
  const id = `ch-${channel.id}`;
  return (
    <li
      className={styles.row}
      data-on={on || undefined}
      data-blocked={reason ? "" : undefined}
    >
      <label className={styles.entry}>
        <input
          type="checkbox"
          className={styles.input}
          data-row={channel.id}
          checked={on}
          tabIndex={tabbable ? 0 : -1}
          aria-labelledby={`${id}-name`}
          aria-describedby={`${id}-meta`}
          aria-disabled={reason ? true : undefined}
          onChange={(event) => {
            if (reason) return;
            onTick(channel, event.target.checked, event.target);
          }}
        />
        <span className={styles.box} aria-hidden="true">
          <Check />
        </span>
        <span className={styles.call} aria-hidden="true">
          <Marked
            text={channel.id}
            ranges={hit.id}
            strongFrom={callNumberStrongFrom(channel.id)}
          />
        </span>
        <span className={styles.channel}>
          <Icon aria-hidden="true" />
          <span id={`${id}-name`} className={styles.channelName}>
            <Marked text={channel.name} ranges={hit.name} />
          </span>
          {main && (
            <span className={styles.main}>
              <span aria-hidden="true">MAIN</span>
            </span>
          )}
        </span>
        <span id={`${id}-meta`} className={styles.kind}>
          {kindLabel[channel.kind]}
          {main && <span className="visually-hidden">, main channel</span>}
          {noFiles && " · no uploads"}
          <span className="visually-hidden">
            , {guild.name}, ID {channel.id}
            {reason && `. ${reason}`}
            {noFiles && ". Bot is missing Attach Files here"}
          </span>
        </span>
      </label>
      {reason && (
        <p className={styles.why} aria-hidden="true">
          <Lock />
          {reason}
        </p>
      )}
    </li>
  );
});
