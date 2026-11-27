import { useEffect, useState } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router";
import { ComposeActionBar, ComposeView } from "./compose/ComposeView";
import { DraftProvider } from "./compose/draft";
import { SendView } from "./send/SendView";
import { BotStatus } from "./shell/BotStatus";
import { ShortcutsDialog } from "./shell/ShortcutsDialog";
import { TopBar, type View } from "./shell/TopBar";
import { pressKey, shortcutFor } from "./shortcuts";
import { useTheme } from "./theme";
import styles from "./App.module.css";

const order: Record<View, number> = { compose: 0, send: 1 };

export function App() {
  return (
    <DraftProvider>
      <Shell />
    </DraftProvider>
  );
}

function Shell() {
  const location = useLocation();
  const navigate = useNavigate();
  const view: View = location.pathname === "/send" ? "send" : "compose";
  const { theme, toggle } = useTheme();
  const [showShortcuts, setShowShortcuts] = useState(false);

  // The incoming view slides in from the side of its tab. Nothing waits for the
  // outgoing view, so a click or key always lands on the new view at once.
  const [arrival, setArrival] = useState<{
    view: View;
    direction: "none" | "forward" | "back";
  }>({ view, direction: "none" });
  if (arrival.view !== view)
    setArrival({
      view,
      direction: order[view] > order[arrival.view] ? "forward" : "back",
    });

  useEffect(() => {
    if (arrival.direction === "none") return;
    scrollTo({ top: 0 });
    document
      .querySelector<HTMLElement>("main h2")
      ?.focus({ preventScroll: true });
  }, [arrival]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || document.querySelector("dialog[open]"))
        return;
      const action = shortcutFor(event);
      if (action === "forward" && view === "compose") {
        event.preventDefault();
        pressKey("forward");
        void navigate("/send");
      } else if (action === "back" && view === "send") {
        event.preventDefault();
        pressKey("back");
        void navigate("/");
      } else if (action === "search") {
        const search = document.querySelector<HTMLElement>(
          "[data-shortcut='search']",
        );
        if (!search) return;
        event.preventDefault();
        pressKey("search");
        search.focus();
      } else if (action === "help") {
        event.preventDefault();
        pressKey("help");
        setShowShortcuts(true);
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [view, navigate]);

  return (
    <>
      <a className={styles.skip} href="#main">
        Skip to main content
      </a>
      <TopBar
        view={view}
        theme={theme}
        onToggleTheme={toggle}
        onShowShortcuts={() => setShowShortcuts(true)}
      />
      <main id="main">
        <h1 className="visually-hidden">embed-dash</h1>
        <BotStatus variant="notice" />
        <div
          key={view}
          className={styles.view}
          data-direction={arrival.view === view ? arrival.direction : "none"}
        >
          <Routes>
            <Route path="/" element={<ComposeView theme={theme} />} />
            <Route path="/send" element={<SendView />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
        {view === "compose" && <ComposeActionBar />}
      </main>
      <ShortcutsDialog
        open={showShortcuts}
        onClose={() => setShowShortcuts(false)}
      />
    </>
  );
}
