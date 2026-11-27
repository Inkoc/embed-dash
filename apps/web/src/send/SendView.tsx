import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";
import { useBot } from "../bot";
import { useDraft } from "../compose/draft";
import styles from "./SendView.module.css";

/**
 * Until the app can list the bot's servers and channels, Send says so plainly
 * instead of showing a catalogue it can't fill.
 */
export function SendView() {
  const [draft] = useDraft();
  const bot = useBot();
  const title = draft.title.trim();
  const botName = bot.data?.name;

  return (
    <section className={styles.send} aria-labelledby="send-title">
      <div className={styles.head}>
        <h2 id="send-title" tabIndex={-1}>
          Send
        </h2>
        <p className={styles.meta}>
          Choose where {title ? <b>{title}</b> : "this embed"} goes.
        </p>
      </div>
      <div className={styles.catalogue}>
        <div className={styles.drawer} aria-hidden="true">
          <span className={styles.holder}>No channels</span>
          <span className={styles.pull} />
        </div>
        <div className={styles.copy}>
          <h3>Channels can’t be listed yet</h3>
          <p>
            embed-dash can’t look up the servers and channels{" "}
            {botName ? <b>{botName}</b> : "your bot"} can post in yet, so
            nothing can be sent from here. Your draft stays as it is while you
            switch views.
          </p>
          <Link to="/" className={styles.back} aria-keyshortcuts="Escape">
            <ArrowLeft aria-hidden="true" />
            Back to Compose
            <kbd data-k="back" aria-hidden="true">
              Esc
            </kbd>
          </Link>
        </div>
      </div>
    </section>
  );
}
