import { useRef, useState } from "react";
import type { Guild } from "@embed-dash/shared";
import { useGuilds } from "./guilds";
import { ForumFields } from "./DestinationFields";
import { SchedulePicker } from "./SchedulePicker";
import { asAppError } from "../errors";
import { Catalogue } from "./Catalogue";
import { ChannelFilter } from "./ChannelFilter";
import { searchCatalogue } from "./catalogue";
import { withIds } from "./selection";
import styles from "./SchedulePicker.module.css";

export function ScheduledFields({
  due,
  setDue,
  channels,
  setChannels,
}: {
  due: string;
  setDue: (value: string) => void;
  channels: string[];
  setChannels: (value: string[]) => void;
}) {
  const guilds = useGuilds();
  return (
    <div className={styles.picker}>
      <SchedulePicker value={due} onChange={setDue} />
      <ForumFields
        channels={
          guilds.data?.guilds
            .flatMap((g) => g.channels)
            .filter((c) => channels.includes(c.id)) ?? []
        }
      />
      {guilds.isPending ? (
        <p role="status">Loading channels…</p>
      ) : guilds.isError ? (
        <div>
          <p role="alert">{asAppError("load-servers", guilds.error).message}</p>
          <button onClick={() => void guilds.refetch()}>Try again</button>
        </div>
      ) : !guilds.data.guilds.length ? (
        <p>No servers available. Check the bot’s access, then refresh.</p>
      ) : (
        <ScheduledCatalogue
          guilds={guilds.data.guilds}
          channels={channels}
          setChannels={setChannels}
        />
      )}
    </div>
  );
}
function ScheduledCatalogue({
  guilds,
  channels,
  setChannels,
}: {
  guilds: Guild[];
  channels: string[];
  setChannels: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () =>
      new Set(
        guilds
          .filter((g) => !g.channels.some((c) => channels.includes(c.id)))
          .map((g) => g.id),
      ),
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const catalogueRef = useRef<HTMLDivElement>(null);
  const drawers = searchCatalogue(guilds, query);
  return (
    <section
      className={styles.destinations}
      aria-label="Scheduled destinations"
      ref={catalogueRef}
    >
      <ChannelFilter
        query={query}
        onChange={setQuery}
        inputRef={inputRef}
        enterList={() =>
          catalogueRef.current
            ?.querySelector<HTMLElement>("input[data-row][tabindex='0']")
            ?.focus()
        }
        hits={drawers.reduce((n, d) => n + d.channels.length, 0)}
        servers={drawers.length}
      />
      {!drawers.length && (
        <p role="status">
          No matching channels. Try a server name or channel ID.
        </p>
      )}
      <Catalogue
        drawers={drawers}
        selected={new Set(channels)}
        mainIds={
          new Set(
            guilds.flatMap((g) => (g.mainChannelId ? [g.mainChannelId] : [])),
          )
        }
        collapsed={query ? new Set() : collapsed}
        onToggleCollapsed={(id) =>
          setCollapsed((current) => withIds(current, [id], !current.has(id)))
        }
        locked={false}
        received={new Map()}
        onTick={(channel, on) =>
          setChannels([...withIds(new Set(channels), [channel.id], on)])
        }
        onTickMany={(ids, on) =>
          setChannels([...withIds(new Set(channels), ids, on)])
        }
        onLeaveTop={() => inputRef.current?.focus()}
        onInView={() => {}}
      />
    </section>
  );
}
