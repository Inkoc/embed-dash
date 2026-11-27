import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  historyQuerySchema,
  historyDetailSchema,
  historyResponseSchema,
  messageLink,
} from "@embed-dash/shared";
import { withIds } from "../compose/draft";
import { DiscordPreview } from "../preview/DiscordPreview";
import { useBot } from "../bot";
import { asAppError, connectionFailure, failureFrom } from "../errors";
import type { Theme } from "../theme";
import { FailureDetail } from "../ui/FailureDetail";
import styles from "./HistoryView.module.css";

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
  const validation = historyQuerySchema.safeParse(Object.fromEntries(params));
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
      return historyResponseSchema.parse(await load(`/api/sends?${params}`));
    },
    retry: false,
  });
  const change = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    if (key === "guildId") next.delete("channelId");
    if (!historyQuerySchema.safeParse(Object.fromEntries(next)).success)
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
              value={params.get("q") ?? ""}
              onChange={(event) => change("q", event.target.value)}
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
            Filters <span>{activeFilters} active</span>
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
              From (UTC)
              <input
                type="date"
                max={params.get("to") || undefined}
                value={params.get("from") ?? ""}
                onChange={(event) => change("from", event.target.value)}
              />
            </label>
            <div className={styles.dateFilter}>
              <label>
                To (UTC)
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
            <ul className={styles.entries} aria-label="Sent messages">
              {query.data.entries.map((entry) => (
                <li key={entry.id}>
                  <Link
                    className={styles.entry}
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
                    <strong>{entry.title}</strong>
                    <time dateTime={new Date(entry.createdAt).toISOString()}>
                      {new Date(entry.createdAt).toLocaleString()}
                    </time>
                    <span>
                      {entry.channelCount}{" "}
                      {entry.channelCount === 1 ? "channel" : "channels"}
                    </span>
                    <span data-status={entry.status}>
                      {statusLabel[entry.status]}
                    </span>
                    <span aria-hidden="true">→</span>
                  </Link>
                </li>
              ))}
            </ul>
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
  const query = useQuery({
    queryKey: ["history-detail", id],
    queryFn: async () =>
      historyDetailSchema.parse(
        await load(`/api/sends/${encodeURIComponent(id)}`),
      ),
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.status === "sending" ? 1000 : false,
  });
  const draft = useMemo(
    () => (query.data ? withIds(query.data.payload) : null),
    [query.data],
  );
  return (
    <>
      <header className={styles.head}>
        <div>
          <h2 tabIndex={-1}>Send details</h2>
          <Link to={`/history?${params}`}>
            ← Back to history <kbd data-k="back">Esc</kbd>
          </Link>
        </div>
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
                  {new Date(query.data.createdAt).toLocaleString()}
                </time>
              </div>
              <div className={styles.preview} data-theme={theme}>
                <DiscordPreview
                  draft={draft}
                  bot={bot.data}
                  botPending={bot.isPending}
                  time={new Date(query.data.createdAt).toLocaleString()}
                />
              </div>
            </section>
            <section className={styles.sheet}>
              <div className={styles.sectionHead}>
                <h3>Channel results</h3>
                <p>
                  {statusLabel[query.data.status]} · {query.data.targets.length}{" "}
                  {query.data.targets.length === 1 ? "channel" : "channels"}
                </p>
              </div>
              <ul>
                {query.data.targets.map((target) => (
                  <li className={styles.target} key={target.id}>
                    <strong>#{target.channelName || target.channelId}</strong>
                    <span>{target.guildName || target.guildId}</span>
                    <p>
                      {
                        {
                          sent: "Sent",
                          failed: "Failed",
                          unknown: "Unknown outcome",
                          pending: "Pending",
                          posting: "Sending",
                        }[target.status]
                      }
                    </p>
                    {target.error && <p>{target.error.message}</p>}
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
                ))}
              </ul>
            </section>
          </div>
        )
      )}
    </>
  );
}
