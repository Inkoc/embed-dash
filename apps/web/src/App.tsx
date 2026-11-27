import { useQuery } from "@tanstack/react-query";
import { botIdentitySchema } from "@embed-dash/shared";
import styles from "./App.module.css";
export function App() {
  const bot = useQuery({
    queryKey: ["bot"],
    retry: false,
    queryFn: async () => {
      const response = await fetch("/api/bot");
      if (!response.ok)
        throw new Error(
          "Unable to connect to Discord. Check the bot token and connection, then retry.",
        );
      return botIdentitySchema.parse(await response.json());
    },
  });
  return (
    <>
      <a href="#main">Skip to content</a>
      <main id="main" className={styles.main}>
        <h1>embed-dash</h1>
        <section aria-label="Bot connection" className={styles.identity}>
          {bot.isPending ? (
            <p role="status">Connecting to Discord…</p>
          ) : bot.isError ? (
            <>
              <p role="alert">
                Unable to connect to Discord. Check the bot token and
                connection, then retry.
              </p>
              <button onClick={() => void bot.refetch()}>
                Retry connection
              </button>
            </>
          ) : (
            <>
              <h2>Connected bot</h2>
              {bot.data.avatarUrl && (
                <img src={bot.data.avatarUrl} width="64" height="64" alt="" />
              )}
              <p>{bot.data.name}</p>
              <p>Bot ID: {bot.data.id}</p>
            </>
          )}
        </section>
      </main>
    </>
  );
}
