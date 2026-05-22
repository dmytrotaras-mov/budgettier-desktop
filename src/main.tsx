import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Stub analytics so legacy `window.umami.track(...)` calls don't crash.
// Removed in Phase 3 once the calls are deleted from components.
if (typeof window !== "undefined" && !(window as any).umami) {
  (window as any).umami = { track: () => {} };
}

createRoot(document.getElementById("root")!).render(<App />);
