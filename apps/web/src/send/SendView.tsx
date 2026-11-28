import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link } from "react-router";
import {
  canSendTo,
  inviteUrl,
  type Guild,
  type GuildChannel,
} from "@embed-dash/shared";
import {
  ArrowLeft,
  ExternalLink,
  ListChecks,
  Lock,
  RefreshCw,
  Search,
  Star,
  X,
} from "lucide-react";
import { useBot } from "../bot";
import { asAppError } from "../errors";
import { FailureDetail } from "../ui/FailureDetail";
import { useDraft } from "../compose/draft";
import { searchCatalogue } from "./catalogue";
import { Catalogue, drawerId } from "./Catalogue";
import { useGuilds } from "./guilds";
import { useSelection, withIds } from "./selection";
import { ServerRail, ServerStrip } from "./ServerRail";
import { MessageSlip } from "./MessageSlip";
import { useSending, type Received } from "./sending";
import { Tray, type Flight, type TrayEntry } from "./Tray";
import { ClosedDrawer } from "../ui/ClosedDrawer";
import styles from "./SendView.module.css";

/** Send: pick the channels the message goes to, from every server the bot is in. */
export function SendView() {
  const { draft } = useDraft();
  const guilds = useGuilds();
  const [selected, setSelected] = useSelection();
  const [dropped, setDropped] = useState(0);
  const { busy, received } = useSending();
  // A refresh can take channels away from the bot; they leave the tray instead of lingering unseen.
  const refresh = async () => {
    const fresh = await guilds.refresh();
    if (!fresh) return;
    const sendable = new Set(
      fresh.guilds.flatMap((g) =>
        g.channels.filter(canSendTo).map((c) => c.id),
      ),
    );
    const gone = [...selected].filter((id) => !sendable.has(id));
    if (gone.length === 0 || busy) return;
    setDropped(gone.length);
    setSelected((set) => withIds(set, gone, false));
  };
  const data = guilds.data;
  const channelCount = data?.guilds.reduce((n, g) => n + g.channels.length, 0);

  let body: ReactNode;
  if (guilds.isPending) body = <Loading />;
  else if (!data)
    body = (
      <Closed label="Not listed" title="The servers couldn’t be listed">
        {guilds.error && (
          <div>
            {/* The heading already says the list couldn't load; this says why. */}
            <p role="alert">
              {asAppError("load-servers", guilds.error).reason}
            </p>
            <FailureDetail error={asAppError("load-servers", guilds.error)} />
          </div>
        )}
        <button
          type="button"
          className={styles.primary}
          onClick={() => void refresh()}
          disabled={guilds.isFetching}
        >
          <RefreshCw aria-hidden="true" />
          {guilds.isFetching ? "Retrying…" : "Retry"}
        </button>
      </Closed>
    );
  else if (data.guilds.length === 0 && data.unavailable.length > 0)
    // The notice above names them; inviting the bot again isn't the fix.
    body = (
      <Closed
        label="Unreadable"
        title="None of the bot’s servers could be read"
      >
        <p>Check the bot’s access in those servers, then refresh.</p>
        <button
          type="button"
          className={styles.primary}
          onClick={() => void refresh()}
          disabled={guilds.isFetching}
        >
          <RefreshCw aria-hidden="true" />
          {guilds.isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </Closed>
    );
  else if (data.guilds.length === 0)
    body = <NoServers refresh={refresh} busy={guilds.isFetching} />;
  else
    body = (
      <Picker guilds={data.guilds} locked={!!busy} received={received(draft)} />
    );

  return (
    <section className={styles.send} aria-labelledby="send-title">
      <div className={styles.head}>
        <h2 id="send-title" tabIndex={-1}>
          Send
        </h2>
        {data && data.guilds.length > 0 && (
          <div className={styles.listed}>
            <p>
              <span className={styles.data}>{data.guilds.length}</span> servers
              · <span className={styles.data}>{channelCount}</span> channels ·
              listed{" "}
              <time dateTime={data.fetchedAt} className={styles.data}>
                {new Date(data.fetchedAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            </p>
            <button
              type="button"
              className={styles.quiet}
              onClick={() => void refresh()}
              disabled={guilds.isFetching}
              data-busy={guilds.isFetching || undefined}
            >
              <RefreshCw aria-hidden="true" />
              {guilds.isFetching ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        )}
      </div>
      <MessageSlip draft={draft} />
      {data && guilds.isError && (
        <div className={styles.problem}>
          <X aria-hidden="true" />
          <div>
            <p role="alert">
              {asAppError("load-servers", guilds.error).message} The list below
              is from {new Date(data.fetchedAt).toLocaleTimeString()}.
            </p>
            <FailureDetail error={asAppError("load-servers", guilds.error)} />
          </div>
        </div>
      )}
      {dropped > 0 && (
        <p className={styles.unavailable} role="status">
          <Lock aria-hidden="true" />
          <span>
            {dropped === 1
              ? "1 ticked channel is"
              : `${dropped} ticked channels are`}{" "}
            no longer available to the bot and {dropped === 1 ? "was" : "were"}{" "}
            taken out of the tray.{" "}
            <button
              type="button"
              className={styles.quiet}
              onClick={() => setDropped(0)}
            >
              Dismiss
            </button>
          </span>
        </p>
      )}
      {data && data.unavailable.length > 0 && (
        <p className={styles.unavailable} role="status">
          <Lock aria-hidden="true" />
          <span>
            Couldn’t read{" "}
            {data.unavailable.length === 1
              ? "1 server"
              : `${data.unavailable.length} servers`}{" "}
            the bot is listed in:{" "}
            <b>{data.unavailable.map((g) => g.name).join(", ")}</b>. The bot may
            have been removed or lost access; refresh to try again.
          </span>
        </p>
      )}
      {body}
    </section>
  );
}

function Picker({
  guilds,
  locked,
  received,
}: {
  guilds: Guild[];
  locked: boolean;
  received: ReadonlyMap<string, Received>;
}) {
  const [selected, setSelected] = useSelection();
  const [query, setQuery] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const deferred = useDeferredValue(query);
  const drawers = useMemo(
    () => searchCatalogue(guilds, deferred),
    [guilds, deferred],
  );
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [inView, setInView] = useState<string | null>(guilds[0].id);
  const jumpRef = useRef<string | null>(null);
  const flight = useRef<Flight | null>(null);

  const mainIds = useMemo(
    () => new Set(guilds.flatMap((g) => g.mainChannelId ?? [])),
    [guilds],
  );
  const allPostable = useMemo(
    () => guilds.flatMap((g) => g.channels.filter(canSendTo).map((c) => c.id)),
    [guilds],
  );
  // The tray follows catalogue order; IDs gone after a refresh drop out.
  const entries: TrayEntry[] = guilds.flatMap((guild) =>
    guild.channels
      .filter((channel) => selected.has(channel.id) && canSendTo(channel))
      .map((channel) => ({ guild, channel })),
  );
  const hits = drawers.reduce((n, d) => n + d.channels.length, 0);

  const onTick = useCallback(
    (channel: GuildChannel, on: boolean, row: HTMLElement) => {
      if (on)
        flight.current = {
          id: channel.id,
          from: row.closest("li")!.getBoundingClientRect(),
        };
      setSelected((set) => withIds(set, [channel.id], on));
    },
    [setSelected],
  );
  const onTickMany = useCallback(
    (ids: string[], on: boolean) => setSelected((set) => withIds(set, ids, on)),
    [setSelected],
  );
  const onToggleCollapsed = useCallback(
    (id: string) =>
      setCollapsed((set) => {
        const next = new Set(set);
        if (!next.delete(id)) next.add(id);
        return next;
      }),
    [],
  );

  // What covers the catalogue: the sticky search above it and, on narrow
  // screens, the tray sheet below. Measured, because both change height (a
  // lock notice, the strip, an opened tray), into the page's scroll padding,
  // so keyboard focus stops clear of them.
  const layout = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const lookup = layout.current?.querySelector<HTMLElement>("[data-lookup]");
    const tray = layout.current?.querySelector<HTMLElement>("aside");
    if (!lookup || !tray) return;
    const root = document.documentElement.style;
    const measure = () => {
      const covers = (part: HTMLElement, position: string) =>
        getComputedStyle(part).position === position
          ? part.getBoundingClientRect().height + "px"
          : "0px";
      root.setProperty("--lookup-height", covers(lookup, "sticky"));
      root.setProperty("--sheet-height", covers(tray, "fixed"));
    };
    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(lookup);
    observer?.observe(tray);
    return () => {
      observer?.disconnect();
      root.removeProperty("--lookup-height");
      root.removeProperty("--sheet-height");
    };
  }, []);

  // Jumping to a server opens its drawer, clearing a search that hides it.
  const onJump = (guildId: string) => {
    if (!drawers.some((d) => d.guild.id === guildId)) setQuery("");
    setCollapsed((set) => {
      const next = new Set(set);
      next.delete(guildId);
      return next;
    });
    jumpRef.current = guildId;
    setInView(guildId);
  };
  // Runs once the drawer is on screen, which can take a render when a search is cleared.
  useEffect(() => {
    const jump = jumpRef.current;
    if (!jump) return;
    const drawer = document.getElementById(drawerId(jump));
    if (!drawer) return;
    jumpRef.current = null;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    drawer.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
    drawer
      .querySelector<HTMLElement>("[data-drawer-toggle]")
      ?.focus({ preventScroll: true });
  });

  const enterList = () =>
    document
      .querySelector<HTMLElement>("input[data-row][tabindex='0']")
      ?.focus();

  return (
    <div className={styles.layout} ref={layout}>
      <ServerRail
        guilds={guilds}
        selected={selected}
        inView={inView}
        onJump={onJump}
      />
      <div className={styles.main}>
        <div className={styles.lookup} data-lookup>
          {locked && (
            <p className={styles.locked} role="status">
              <Lock aria-hidden="true" />
              <span>
                The selection is locked while the send is delivered. It unlocks
                when every channel has an answer.
              </span>
            </p>
          )}
          <label htmlFor="channel-search" className={styles.label}>
            Find channels
          </label>
          <div className={styles.search}>
            <Search aria-hidden="true" />
            <input
              ref={search}
              id="channel-search"
              type="search"
              value={query}
              placeholder="e.g. news, Cup EU or 1103…"
              autoComplete="off"
              spellCheck={false}
              data-shortcut="search"
              aria-keyshortcuts="/"
              aria-describedby="channel-search-result"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" || event.key === "Enter") {
                  event.preventDefault();
                  enterList();
                } else if (event.key === "Escape" && query) {
                  // Esc clears the search first; the next Esc goes back to Compose.
                  event.preventDefault();
                  setQuery("");
                }
              }}
            />
            {query ? (
              <button
                type="button"
                className={styles.clear}
                aria-label="Clear search"
                onClick={() => {
                  setQuery("");
                  search.current?.focus();
                }}
              >
                <X aria-hidden="true" />
              </button>
            ) : (
              <kbd data-k="search" aria-hidden="true">
                /
              </kbd>
            )}
          </div>
          <p
            id="channel-search-result"
            className="visually-hidden"
            aria-live="polite"
          >
            {deferred.trim()
              ? `${hits} channels in ${drawers.length} servers match.`
              : ""}
          </p>
          <ServerStrip guilds={guilds} selected={selected} onJump={onJump} />
          <div className={styles.picks} role="group" aria-labelledby="picks">
            <span id="picks">Quick picks</span>
            <button
              type="button"
              className={styles.pick}
              disabled={!mainIds.size || locked}
              onClick={() => onTickMany([...mainIds], true)}
            >
              <Star aria-hidden="true" />
              Main channel of each server
              <span className={styles.n}>{mainIds.size}</span>
            </button>
            <button
              type="button"
              className={styles.pick}
              disabled={!allPostable.length || locked}
              onClick={() => onTickMany(allPostable, true)}
            >
              <ListChecks aria-hidden="true" />
              All postable
              <span className={styles.n}>{allPostable.length}</span>
            </button>
            <button
              type="button"
              className={styles.pick}
              disabled={!entries.length || locked}
              onClick={() => setSelected(new Set())}
            >
              <X aria-hidden="true" />
              Clear
              <span className={styles.n}>{entries.length}</span>
            </button>
          </div>
        </div>
        {drawers.length ? (
          <Catalogue
            drawers={drawers}
            selected={selected}
            mainIds={mainIds}
            collapsed={collapsed}
            onToggleCollapsed={onToggleCollapsed}
            locked={locked}
            received={received}
            onTick={onTick}
            onTickMany={onTickMany}
            onLeaveTop={() => search.current?.focus()}
            onInView={setInView}
          />
        ) : (
          <div className={styles.nothing}>
            <p>
              No channel or server matches <b>“{deferred.trim()}”</b>. Search
              looks at channel and server names and IDs.
            </p>
            <button
              type="button"
              className={styles.quiet}
              onClick={() => {
                setQuery("");
                search.current?.focus();
              }}
            >
              Clear search
            </button>
          </div>
        )}
      </div>
      <Tray
        entries={entries}
        received={received}
        flightRef={flight}
        onRemove={(id) => setSelected((set) => withIds(set, [id], false))}
      />
    </div>
  );
}

/** A closed drawer whose label says what's missing, with the way back to Compose. */
function Closed({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <ClosedDrawer label={label} title={title}>
      {children}
      <Link to="/" className={styles.back} aria-keyshortcuts="Escape">
        <ArrowLeft aria-hidden="true" />
        Back to Compose
        <kbd data-k="back" aria-hidden="true">
          Esc
        </kbd>
      </Link>
    </ClosedDrawer>
  );
}

function NoServers({
  refresh,
  busy,
}: {
  refresh: () => Promise<unknown>;
  busy: boolean;
}) {
  const bot = useBot();
  return (
    <Closed label="No servers" title="The bot isn’t in any servers yet">
      <p>
        Invite {bot.data ? <b>{bot.data.name}</b> : "the bot"} to a server you
        manage, then refresh. The invite asks for View Channel, Send Messages,
        Embed Links and Attach Files.
      </p>
      <div className={styles.actions}>
        {bot.data && (
          <a
            className={styles.primary}
            href={inviteUrl(bot.data.id)}
            target="_blank"
            rel="noreferrer"
          >
            Invite the bot
            <ExternalLink aria-hidden="true" />
            <span className="visually-hidden">
              {" "}
              (opens Discord in a new tab)
            </span>
          </a>
        )}
        <button
          type="button"
          className={styles.quiet}
          onClick={() => void refresh()}
          disabled={busy}
        >
          <RefreshCw aria-hidden="true" />
          {busy ? "Refreshing…" : "Refresh"}
        </button>
      </div>
    </Closed>
  );
}

function Loading() {
  return (
    <div className={styles.layout} aria-busy="true">
      <p className="visually-hidden" role="status">
        Listing the bot’s servers and channels…
      </p>
      <div className={styles.skelRail} aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className={styles.skel} />
        ))}
      </div>
      <div className={styles.main} aria-hidden="true">
        <div className={styles.skelSearch} />
        <div className={styles.skelSheet}>
          {Array.from({ length: 7 }, (_, i) => (
            <span
              key={i}
              className={styles.skelRow}
              data-head={i === 0 || undefined}
            >
              <span className={styles.skel} />
              <span className={styles.skel} />
            </span>
          ))}
        </div>
      </div>
      <div className={styles.skelTray} aria-hidden="true" />
    </div>
  );
}
