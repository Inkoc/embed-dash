import { useGuilds } from "./guilds";
import { canSendTo } from "@embed-dash/shared";
import { SchedulePicker } from "./SchedulePicker";
import { asAppError } from "../errors";
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
      {guilds.isPending ? (
        <p role="status">Loading channels…</p>
      ) : guilds.isError ? (
        <div>
          <p role="alert">{asAppError("load-servers", guilds.error).message}</p>
          <button onClick={() => void guilds.refetch()}>Try again</button>
        </div>
      ) : (
        <fieldset>
          <legend>Scheduled destinations</legend>
          {!guilds.data.guilds.length && (
            <p>No servers available. Check the bot’s access, then refresh.</p>
          )}
          {guilds.data.guilds.map((guild) => (
            <details
              key={guild.id}
              open={guild.channels.some((channel) =>
                channels.includes(channel.id),
              )}
            >
              <summary>
                {guild.name} ·{" "}
                {
                  guild.channels.filter((channel) =>
                    channels.includes(channel.id),
                  ).length
                }{" "}
                selected
              </summary>
              {guild.channels
                .filter(
                  (channel) =>
                    canSendTo(channel) || channels.includes(channel.id),
                )
                .map((channel) => (
                  <label className={styles.channel} key={channel.id}>
                    <input
                      type="checkbox"
                      checked={channels.includes(channel.id)}
                      onChange={(e) =>
                        setChannels(
                          e.target.checked
                            ? [...channels, channel.id]
                            : channels.filter((id) => id !== channel.id),
                        )
                      }
                    />
                    #{channel.name}
                  </label>
                ))}
            </details>
          ))}
        </fieldset>
      )}
    </div>
  );
}
