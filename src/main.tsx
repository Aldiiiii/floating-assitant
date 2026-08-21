import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import { OverlaySelector } from "./components/OverlaySelector";
import "highlight.js/styles/github-dark.css";
import "./index.css";

window.addEventListener("unhandledrejection", (e) => {
  console.error("[unhandled-rejection]", e.reason);
});
window.addEventListener("error", (e) => {
  console.error("[window-error]", e.error ?? e.message);
});

const isOverlay = getCurrentWindow().label === "overlay";

if (isOverlay) {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <OverlaySelector />,
  );
} else {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
