import { useState } from "react";
import { canPost, type Guild } from "@embed-dash/shared";
import { Search } from "lucide-react";
import { ServerMark } from "./ServerMark";
import styles from "./ServerRail.module.css";

/** The filter appears once the rail no longer fits at a glance. */
const filterAt = 8;

interface Props {
  guilds: readonly Guild[];
  selected: ReadonlySet<string>;
  inView: string | null;
  onJump: (guildId: string) => void;
}

function counts(guild: Guild, selected: ReadonlySet<string>) {
  const postable = guild.channels.filter(canPost);
  return {
    ticked: postable.filter((c) => selected.has(c.id)).length,
    postable: postable.length,
  };
}

/** Every server as a drawer in the cabinet, with its ticked and postable counts. */
export function ServerRail({ guilds, selected, inView, onJump }: Props) {
  const [filter, setFilter] = useState("");
  const needle = filter.trim().toLowerCase();
  const listed = needle
    ? guilds.filter((g) => g.name.toLowerCase().includes(needle))
    : guilds;
  return (
    <nav className={styles.rail} aria-labelledby="rail-title">
      <div className={styles.head}>
        <h3 id="rail-title">Servers</h3>
        <span>{guilds.length}</span>
      </div>
      {guilds.length > filterAt && (
        <div className={styles.filter}>
          <label htmlFor="rail-filter">Filter servers</label>
          <div>
            <Search aria-hidden="true" />
            <input
              id="rail-filter"
              type="search"
              value={filter}
              placeholder="e.g. Cup"
              autoComplete="off"
              onChange={(event) => setFilter(event.target.value)}
            />
          </div>
        </div>
      )}
      <ul className={styles.servers}>
        {listed.map((guild) => {
          const { ticked, postable } = counts(guild, selected);
          return (
            <li key={guild.id}>
              <button
                type="button"
                className={styles.server}
                aria-current={inView === guild.id ? "location" : undefined}
                onClick={() => onJump(guild.id)}
              >
                <ServerMark guild={guild} />
                <span className={styles.name}>{guild.name}</span>
                <span className={styles.count}>
                  <span aria-hidden="true">
                    {ticked > 0 && <b>{ticked}</b>}
                    {ticked > 0 ? "/" : ""}
                    {postable}
                  </span>
                  <span className="visually-hidden">
                    , {ticked} of {postable} postable channels ticked
                  </span>
                </span>
              </button>
            </li>
          );
        })}
        {listed.length === 0 && (
          <li className={styles.none}>No server names match “{filter}”.</li>
        )}
      </ul>
    </nav>
  );
}

/** Narrower screens: the rail becomes a scrolling strip of marks and counts. */
export function ServerStrip({
  guilds,
  selected,
  onJump,
}: Omit<Props, "inView">) {
  return (
    <nav className={styles.strip} aria-label="Servers">
      <ul>
        {guilds.map((guild) => {
          const { ticked, postable } = counts(guild, selected);
          return (
            <li key={guild.id}>
              <button
                type="button"
                title={guild.name}
                onClick={() => onJump(guild.id)}
              >
                <ServerMark guild={guild} size="sm" />
                <span className="visually-hidden">{guild.name},</span>{" "}
                <b aria-hidden="true">{ticked}</b>
                <span className="visually-hidden">
                  {ticked} of {postable} ticked
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
