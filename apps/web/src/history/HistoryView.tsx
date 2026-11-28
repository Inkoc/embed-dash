import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Link, useParams, useSearchParams, useNavigate } from "react-router";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  historyFiltersSchema,
  messageTitle,
  historyDetailSchema,
  historyResponseSchema,
  messageLink,
} from "@embed-dash/shared";
import { withIds, useDraft } from "../compose/draft";
import { DiscordPreview } from "../preview/DiscordPreview";
import { useBot } from "../bot";
import {
  asAppError,
  connectionFailure,
  failureFrom,
  type AppError,
} from "../errors";
import { Verdict } from "../send/SendPanel";
import trayStyles from "../send/Tray.module.css";
import catalogueStyles from "../send/Catalogue.module.css";
import {
  date,
  localZone,
  historyRequest,
  destinationSummary,
} from "./presentation";
import { startSend } from "../send/sendApi";
import type { Session } from "../shell/SessionGate";
import type { Theme } from "../theme";
import { FailureDetail } from "../ui/FailureDetail";
import styles from "./HistoryView.module.css";

// Remember the opened row across route remounts, including the global Escape shortcut.
const returnRows = new Map<string, string>();

const statusLabel = {
  done: "All sent",
  partial: "Partial",
  failed: "Failed",
  sending: "Sending",
};
async function load(url: string) {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw connectionFailure("load-history");
  }
  if (!response.ok) throw await failureFrom("load-history", response);
  return response.json() as Promise<unknown>;
}
function Loading() {
  return (
    <div className={styles.loading} role="status">
      <span className="visually-hidden">Loading history…</span>
      {[0, 1, 2].map((key) => (
        <div key={key} />
      ))}
    </div>
  );
}
function Failure({ error, retry }: { error: Error; retry: () => void }) {
  const failure = asAppError("load-history", error);
  return (
    <div className={styles.state}>
      <p role="alert">✗ {failure.message}</p>
      <FailureDetail error={failure} />
      <button onClick={retry}>Try again</button>
    </div>
  );
}
export default function HistoryView({ theme }: { theme: Theme }) {
  const { id } = useParams();
  return (
    <section className={styles.view}>
      {id ? <Detail id={id} theme={theme} /> : <HistoryList />}
    </section>
  );
}
export function HistoryList() {
  const [params, setParams] = useSearchParams();
  const search = useRef<HTMLInputElement>(null);
  const results = useRef<HTMLUListElement>(null);
  const cursor = useRef<HTMLSpanElement>(null);
  const pendingFocus = useRef<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [searchValue, setSearchValue] = useState(params.get("q") ?? "");
  const urlQuery = params.get("q") ?? "";
  const [previousQuery, setPreviousQuery] = useState(urlQuery);
  if (previousQuery !== urlQuery) {
    setPreviousQuery(urlQuery);
    setSearchValue(urlQuery);
  }
  useEffect(() => {
    if (searchValue === (params.get("q") ?? "")) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (searchValue) next.set("q", searchValue);
      else next.delete("q");
      next.delete("page");
      setParams(next, { replace: true });
    }, 250);
    return () => clearTimeout(timer);
  }, [searchValue, params, setParams]);
  const validation = historyFiltersSchema.safeParse(Object.fromEntries(params));
  const [filtersOpen, setFiltersOpen] = useState(!validation.success);
  const dateError = validation.success
    ? undefined
    : validation.error.issues.find((issue) => issue.path[0] === "to")?.message;
  const activeFilters = ["guildId", "channelId", "from", "to", "status"].filter(
    (key) => params.get(key),
  ).length;
  const query = useQuery({
    enabled: validation.success,
    queryKey: ["history", params.toString()],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      if (!validation.success)
        throw new Error("Correct the history filters before searching.");
      return historyResponseSchema.parse(
        await load(`/api/sends?${historyRequest(params)}`),
      );
    },
    retry: false,
  });
  const entries = query.data?.entries;
  const tabbable = entries?.some((entry) => entry.id === active)
    ? active
    : entries?.[0]?.id;
  useEffect(() => {
    if (query.isPlaceholderData || query.isFetching || !entries) return;
    const returning = returnRows.get(params.toString());
    if (pendingFocus.current === params.toString() || returning) {
      const row = returning
        ? [
            ...(results.current?.querySelectorAll<HTMLAnchorElement>("a") ??
              []),
          ].find((link) => link.dataset.id === returning)
        : results.current?.querySelector<HTMLAnchorElement>("a");
      if (document.activeElement === search.current || returning) row?.focus();
      pendingFocus.current = null;
      returnRows.delete(params.toString());
    }
  }, [entries, params, query.isPlaceholderData, query.isFetching]);
  const change = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    if (key === "guildId") next.delete("channelId");
    if (!historyFiltersSchema.safeParse(Object.fromEntries(next)).success)
      setFiltersOpen(true);
    setParams(next, { replace: true });
  };
  const destinations = query.data?.destinations ?? [];
  const guilds = [
    ...new Map(
      destinations.map((target) => [
        target.guildId,
        target.guildName || target.guildId,
      ]),
    ).entries(),
  ];
  const channels = [
    ...new Map(
      destinations
        .filter(
          (target) =>
            !params.get("guildId") || target.guildId === params.get("guildId"),
        )
        .map((target) => [target.channelId, target]),
    ).values(),
  ];
  const filtered = ["q", "guildId", "channelId", "from", "to", "status"].some(
    (key) => params.has(key),
  );
  const page = Number(params.get("page") ?? 1);
  return (
    <>
      <header className={styles.head}>
        <div>
          <h2 tabIndex={-1}>History</h2>
          <p>Every send, filed with its results.</p>
        </div>
        <button
          disabled={!validation.success}
          onClick={() => void query.refetch()}
        >
          Refresh
        </button>
      </header>
      <div className={styles.sheet}>
        <form
          className={styles.filters}
          onSubmit={(event) => event.preventDefault()}
        >
          <label className={styles.search}>
            Search history{" "}
            <kbd data-k="search" aria-hidden="true">
              /
            </kbd>
            <input
              data-shortcut="search"
              type="search"
              ref={search}
              value={searchValue}
              onChange={(event) => {
                pendingFocus.current = null;
                setSearchValue(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  if (
                    searchValue !== urlQuery ||
                    query.isPlaceholderData ||
                    query.isFetching
                  ) {
                    const next = new URLSearchParams(params);
                    if (searchValue) next.set("q", searchValue);
                    else next.delete("q");
                    next.delete("page");
                    pendingFocus.current = next.toString();
                    if (searchValue !== urlQuery) change("q", searchValue);
                  } else
                    results.current
                      ?.querySelector<HTMLAnchorElement>("a")
                      ?.focus();
                }
              }}
              placeholder="Message text, server or channel"
              maxLength={500}
            />
          </label>
          <button
            type="button"
            className={styles.filterToggle}
            aria-expanded={filtersOpen}
            aria-controls="history-filters"
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            {filtersOpen ? "Hide filters" : "Filters"}{" "}
            <span>{activeFilters} active</span>
            <ChevronDown aria-hidden="true" />
          </button>
          <div
            id="history-filters"
            className={styles.filterFields}
            data-open={filtersOpen || undefined}
          >
            <label>
              Server
              <select
                value={params.get("guildId") ?? ""}
                onChange={(event) => change("guildId", event.target.value)}
              >
                <option value="">All servers</option>
                {guilds.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Channel
              <select
                value={params.get("channelId") ?? ""}
                onChange={(event) => change("channelId", event.target.value)}
              >
                <option value="">All channels</option>
                {channels.map((target) => (
                  <option key={target.channelId} value={target.channelId}>
                    #{target.channelName || target.channelId} ·{" "}
                    {target.guildName || target.guildId}
                  </option>
                ))}
              </select>
            </label>
            <label>
              From ({localZone()})
              <input
                type="date"
                max={params.get("to") || undefined}
                value={params.get("from") ?? ""}
                onChange={(event) => change("from", event.target.value)}
              />
            </label>
            <div className={styles.dateFilter}>
              <label>
                Through ({localZone()})
                <input
                  type="date"
                  min={params.get("from") || undefined}
                  aria-invalid={!!dateError || undefined}
                  aria-describedby={
                    dateError ? "history-date-error" : undefined
                  }
                  value={params.get("to") ?? ""}
                  onChange={(event) => change("to", event.target.value)}
                />
              </label>
              {dateError && (
                <p id="history-date-error" className={styles.fieldError}>
                  ✗ {dateError}
                </p>
              )}
            </div>
            <label>
              Status
              <select
                value={params.get("status") ?? ""}
                onChange={(event) => change("status", event.target.value)}
              >
                <option value="">All statuses</option>
                {Object.entries(statusLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => setParams({})}>
              Clear filters
            </button>
          </div>
        </form>
        {!validation.success ? (
          <div className={styles.state}>
            <p>
              {dateError
                ? "Update the dates to view history."
                : "Correct the history filters or clear them to view history."}
            </p>
            <button onClick={() => setParams({})}>Clear filters</button>
          </div>
        ) : query.isPending ? (
          <Loading />
        ) : query.isError ? (
          <Failure error={query.error} retry={() => void query.refetch()} />
        ) : query.data.entries.length === 0 ? (
          <div className={styles.state}>
            <h3>
              {filtered ? "No matching sends" : "Your history starts here"}
            </h3>
            <p>
              {filtered
                ? "Try another search or clear the filters."
                : "Sent messages and their channel results will be filed here."}
            </p>
            {filtered ? (
              <button onClick={() => setParams({})}>Clear filters</button>
            ) : (
              <Link to="/">Compose your first message</Link>
            )}
          </div>
        ) : (
          <>
            <div className={styles.resultList}>
              <span
                ref={cursor}
                className={catalogueStyles.cursor}
                aria-hidden="true"
              />
              <ul
                ref={results}
                className={styles.entries}
                aria-label="Sent messages"
                onFocus={(event) => {
                  const link = (event.target as HTMLElement).closest("a");
                  if (!link || !cursor.current || !results.current) return;
                  setActive(link.dataset.id!);
                  const row = link.getBoundingClientRect();
                  const box = results.current.getBoundingClientRect();
                  cursor.current.style.transform = `translateY(${row.top - box.top}px)`;
                  cursor.current.style.height = `${row.height}px`;
                  cursor.current.dataset.show = "";
                }}
                onBlur={(event) => {
                  if (!results.current?.contains(event.relatedTarget as Node)) {
                    if (cursor.current) delete cursor.current.dataset.show;
                  }
                }}
                onKeyDown={(event) => {
                  const rows = [...results.current!.querySelectorAll("a")];
                  const at = rows.indexOf(event.target as HTMLAnchorElement);
                  const to =
                    event.key === "ArrowDown"
                      ? at + 1
                      : event.key === "ArrowUp"
                        ? at - 1
                        : event.key === "Home"
                          ? 0
                          : event.key === "End"
                            ? rows.length - 1
                            : null;
                  if (to === null) return;
                  event.preventDefault();
                  if (to < 0) search.current?.focus();
                  else rows[Math.min(to, rows.length - 1)]?.focus();
                }}
              >
                {query.data.entries.map((entry) => (
                  <li key={entry.id}>
                    <Link
                      className={styles.entry}
                      data-id={entry.id}
                      tabIndex={entry.id === tabbable ? 0 : -1}
                      onClick={() =>
                        returnRows.set(params.toString(), entry.id)
                      }
                      to={`/history/${entry.id}?${params}`}
                    >
                      <span
                        className={styles.swatch}
                        style={{
                          backgroundColor: /^#[\da-f]{6}$/i.test(entry.color)
                            ? entry.color
                            : undefined,
                        }}
                        aria-hidden="true"
                      />
                      <strong>
                        {entry.title}
                        <span className={styles.names}>
                          {destinationSummary(entry.destinations, urlQuery)}
                        </span>
                        {entry.lastEditedAt && (
                          <span className={styles.names}>
                            Last edited {date(entry.lastEditedAt)}
                          </span>
                        )}
                        {entry.updateFailureCount > 0 && (
                          <span className={styles.updateNotice}>
                            {entry.updateFailureCount}{" "}
                            {entry.updateFailureCount === 1
                              ? "copy not updated"
                              : "copies not updated"}
                          </span>
                        )}
                      </strong>
                      <time dateTime={new Date(entry.createdAt).toISOString()}>
                        {date(entry.createdAt)}
                      </time>
                      <span>
                        {entry.channelCount}{" "}
                        {entry.channelCount === 1 ? "channel" : "channels"}
                      </span>
                      <span data-status={entry.status}>
                        <Verdict
                          reveal={false}
                          state={
                            entry.unconfirmed
                              ? "unknown"
                              : entry.status === "done"
                                ? "sent"
                                : entry.status === "sending"
                                  ? "posting"
                                  : entry.status === "partial"
                                    ? "partial"
                                    : "failed"
                          }
                          label={
                            entry.unconfirmed
                              ? "Unconfirmed"
                              : statusLabel[entry.status]
                          }
                          index={0}
                        />
                      </span>
                      <span aria-hidden="true">→</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            {(page > 1 || query.data.hasMore) && (
              <nav className={styles.pagination} aria-label="History pages">
                <button
                  disabled={page <= 1}
                  onClick={() => change("page", String(page - 1))}
                >
                  Previous
                </button>
                <span>Page {page}</span>
                <button
                  disabled={!query.data.hasMore}
                  onClick={() => change("page", String(page + 1))}
                >
                  Next
                </button>
              </nav>
            )}
          </>
        )}
      </div>
    </>
  );
}
function Detail({ id, theme }: { id: string; theme: Theme }) {
  const [params] = useSearchParams();
  const bot = useBot();
  const { beginEdit } = useDraft();
  const navigate = useNavigate();
  const client = useQueryClient();
  const heading = useRef<HTMLHeadingElement>(null);
  const arrived = useRef(false);
  const retryFocus = useRef<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryProblem, setRetryProblem] = useState<AppError | null>(null);
  const query = useQuery({
    queryKey: ["history-detail", id],
    queryFn: async () =>
      historyDetailSchema.parse(
        await load(`/api/sends/${encodeURIComponent(id)}`),
      ),
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.status === "sending" ||
      query.state.data?.edit?.status === "sending"
        ? 1000
        : false,
  });
  useEffect(() => {
    if (query.data && !arrived.current) {
      heading.current?.focus();
      arrived.current = true;
    }
  }, [query.data]);
  useEffect(() => {
    if (retryFocus.current && query.data?.edit?.status === "done") {
      document.getElementById(`update-${retryFocus.current}`)?.focus();
      retryFocus.current = null;
    }
  }, [query.data]);
  async function retryCopy(targetId: string, update = false) {
    setRetrying(true);
    setRetryProblem(null);
    try {
      await startSend(
        update ? "retry-edit" : "retry",
        `/api/sends/${id}/${update ? "edits/retry" : "retry"}`,
        { targetIds: [targetId] },
        client.getQueryData<Session>(["session"])?.csrfToken ?? "",
      );
      if (update) retryFocus.current = targetId;
      await query.refetch();
      void client.invalidateQueries({ queryKey: ["history"] });
    } catch (error) {
      setRetryProblem(asAppError(update ? "retry-edit" : "retry", error));
    } finally {
      setRetrying(false);
    }
  }
  const draft = useMemo(
    () => (query.data ? withIds(query.data.payload) : null),
    [query.data],
  );
  return (
    <>
      <header className={styles.head}>
        <div>
          <h2 ref={heading} tabIndex={-1}>
            {query.data ? messageTitle(query.data.payload) : "Send details"}
          </h2>
          {query.data?.lastEditedAt && (
            <p>Last edited {date(query.data.lastEditedAt)}</p>
          )}
          <Link to={`/history?${params}`} aria-keyshortcuts="Escape">
            ← Back to history{" "}
            <kbd data-k="back" aria-hidden="true">
              Esc
            </kbd>
          </Link>
        </div>
        {query.data && (
          <div className={styles.detailActions}>
            <button
              className={styles.edit}
              disabled={
                query.data.status === "sending" ||
                query.data.edit?.status === "sending" ||
                !query.data.targets.some(
                  (t) =>
                    t.messageId &&
                    !query.data.edit?.targets.some(
                      (e) =>
                        e.id === t.id && e.error?.code === "MESSAGE_DELETED",
                    ),
                )
              }
              aria-describedby="edit-availability"
              onClick={() => {
                beginEdit(query.data);
                void navigate("/");
              }}
            >
              Edit
            </button>
            <p id="edit-availability">
              {query.data.status === "sending" ||
              query.data.edit?.status === "sending"
                ? "Wait for the current delivery or update to finish."
                : !query.data.targets.some((t) => t.messageId)
                  ? "No confirmed copies to edit."
                  : query.data.targets.every(
                        (t) =>
                          !t.messageId ||
                          query.data.edit?.targets.some(
                            (e) =>
                              e.id === t.id &&
                              e.error?.code === "MESSAGE_DELETED",
                          ),
                      )
                    ? "Every confirmed copy was deleted in Discord."
                    : "Update the existing copies in their original channels."}
            </p>
          </div>
        )}
      </header>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <Failure error={query.error} retry={() => void query.refetch()} />
      ) : (
        draft && (
          <div className={styles.detail}>
            <section className={styles.sheet}>
              <div className={styles.sectionHead}>
                <h3>Message preview</h3>
                <span>Discord {theme}</span>
                <time dateTime={new Date(query.data.createdAt).toISOString()}>
                  {date(query.data.createdAt)}
                </time>
              </div>
              {query.data.edit?.targets.some((t) => t.status !== "sent") && (
                <p className={styles.versionNotice}>
                  This is the latest saved version. Check each copy’s update
                  result below; copies that were not updated may still show an
                  earlier version.
                </p>
              )}
              <div className={styles.preview} data-theme={theme}>
                <DiscordPreview
                  draft={draft}
                  bot={bot.data}
                  botPending={bot.isPending}
                  time={date(query.data.createdAt)}
                />
              </div>
            </section>
            <section className={styles.sheet}>
              <div className={styles.sectionHead}>
                <h3>Channel results</h3>
                <p>
                  {query.data.targets.every(
                    (target) => target.status === "unknown",
                  )
                    ? "Unconfirmed"
                    : statusLabel[query.data.status]}{" "}
                  · {query.data.targets.length}{" "}
                  {query.data.targets.length === 1 ? "channel" : "channels"}
                </p>
              </div>
              {retryProblem && (
                <div className={styles.state}>
                  <p role="alert">{retryProblem.message}</p>
                  <FailureDetail error={retryProblem} />
                </div>
              )}
              <ul>
                {query.data.targets.map((target) => {
                  const update = query.data.edit?.targets.find(
                    (t) => t.id === target.id,
                  );
                  return (
                    <li
                      className={`${trayStyles.slip} ${styles.target}`}
                      key={target.id}
                    >
                      <strong>#{target.channelName || target.channelId}</strong>
                      <span>{target.guildName || target.guildId}</span>
                      <p>
                        Delivery:{" "}
                        <Verdict
                          reveal={false}
                          state={target.status}
                          index={0}
                        />
                      </p>
                      {target.error && <p>{target.error.message}</p>}
                      {target.status === "failed" && !target.messageId && (
                        <button
                          disabled={
                            retrying ||
                            query.data.status === "sending" ||
                            query.data.edit?.status === "sending"
                          }
                          onClick={() => void retryCopy(target.id)}
                        >
                          Retry delivery
                          <span className="visually-hidden">
                            {" "}
                            to #{target.channelName || target.channelId}
                          </span>
                        </button>
                      )}
                      {update && (
                        <div
                          className={styles.updateResult}
                          id={`update-${target.id}`}
                          tabIndex={-1}
                        >
                          <p>
                            Latest update:{" "}
                            <Verdict
                              reveal={false}
                              index={0}
                              state={
                                update.error?.code === "MESSAGE_DELETED"
                                  ? "deleted"
                                  : update.error?.code === "EDIT_UNCONFIRMED"
                                    ? "unknown"
                                    : update.status
                              }
                              label={
                                update.error?.code === "MESSAGE_DELETED"
                                  ? "Deleted in Discord"
                                  : update.error?.code === "EDIT_UNCONFIRMED"
                                    ? "Unconfirmed"
                                    : update.status === "sent"
                                      ? "Updated"
                                      : update.status === "failed"
                                        ? "Not updated to the latest version"
                                        : "Updating"
                              }
                            />
                          </p>
                          {update.error && <p>{update.error.message}</p>}
                          {update.status === "failed" &&
                            update.error?.code !== "MESSAGE_DELETED" && (
                              <button
                                disabled={
                                  retrying ||
                                  query.data.status === "sending" ||
                                  query.data.edit?.status === "sending"
                                }
                                onClick={() => void retryCopy(target.id, true)}
                              >
                                Retry update
                                <span className="visually-hidden">
                                  {" "}
                                  to #{target.channelName || target.channelId}
                                </span>
                              </button>
                            )}
                        </div>
                      )}
                      {target.messageId && (
                        <a
                          href={messageLink({
                            ...target,
                            messageId: target.messageId,
                          })}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open in Discord
                          <span className="visually-hidden">
                            : #{target.channelName || target.channelId}
                          </span>
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>
        )
      )}
    </>
  );
}
