import { lazy, Suspense, useEffect, useState } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router";
import { ComposeActionBar, ComposeView } from "./compose/ComposeView";
import { DraftProvider, useDraft } from "./compose/draft";
import { EditorStateProvider, useEditorState } from "./compose/editorState";
import { SelectionProvider } from "./send/selection";
import { SendingProvider } from "./send/sending";
import { SendView } from "./send/SendView";
import { SessionGate } from "./shell/SessionGate";
import { BotStatus } from "./shell/BotStatus";
import { ShortcutsDialog } from "./shell/ShortcutsDialog";
import { TopBar, type View } from "./shell/TopBar";
import { pressKey, shortcutFor } from "./shortcuts";
import { useTheme } from "./theme";
import styles from "./App.module.css";

const HistoryView = lazy(() => import("./history/HistoryView"));
const order: Record<View, number> = { compose: 0, send: 1, history: 2 };

export function App() {
  return (
    <SessionGate>
      <DraftProvider>
        <EditorStateProvider>
          <SelectionProvider>
            <SendingProvider>
              <Shell />
            </SendingProvider>
          </SelectionProvider>
        </EditorStateProvider>
      </DraftProvider>
    </SessionGate>
  );
}

function Shell() {
  const location = useLocation();
  const navigate = useNavigate();
  const view: View = location.pathname.startsWith("/history")
    ? "history"
    : location.pathname === "/send"
      ? "send"
      : "compose";
  const { theme, toggle } = useTheme();
  const [showShortcuts, setShowShortcuts] = useState(false);
  const { issues } = useDraft();
  const { reveal } = useEditorState();
  const firstIssue = issues[0]?.path;

  // The incoming view slides in from the side of its tab. Nothing waits for the
  // outgoing view, so a click or key always lands on the new view at once.
  const [arrival, setArrival] = useState<{
    view: View;
    direction: "none" | "forward" | "back";
    /** Arrived through a "Go to the field" link, which brings its own focus and scroll. */
    reveal: boolean;
  }>({ view, direction: "none", reveal: false });
  if (arrival.view !== view)
    setArrival({
      view,
      direction: order[view] > order[arrival.view] ? "forward" : "back",
      reveal: !!location.state?.reveal,
    });

  useEffect(() => {
    if (arrival.direction === "none" || arrival.reveal) return;
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
        // A draft Discord would reject doesn't go forward; the shortcut shows the first problem instead.
        if (firstIssue) reveal(firstIssue);
        else void navigate("/send");
      } else if (action === "back" && view === "send") {
        event.preventDefault();
        pressKey("back");
        void navigate("/");
      } else if (
        action === "back" &&
        view === "history" &&
        location.pathname !== "/history"
      ) {
        event.preventDefault();
        pressKey("back");
        void navigate(`/history${location.search}`);
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
  }, [view, navigate, firstIssue, reveal, location.pathname, location.search]);

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
            <Route
              path="/history"
              element={
                <Suspense fallback={<p role="status">Loading history…</p>}>
                  <HistoryView theme={theme} />
                </Suspense>
              }
            />
            <Route
              path="/history/:id"
              element={
                <Suspense fallback={<p role="status">Loading history…</p>}>
                  <HistoryView theme={theme} />
                </Suspense>
              }
            />
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
