import { useCallback, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Bubble } from "./components/Bubble";
import { SpeechBalloonView } from "./components/SpeechBalloonView";
import {
  changeMode,
  restoreStartup,
  watchPosition,
  type DockSide,
  type Mode,
} from "./lib/window";
import { useChatStore } from "./stores/chat";
import { useSettingsStore } from "./stores/settings";
import { useVoiceStore } from "./stores/voice";

function App() {
  const [mode, setMode] = useState<Mode>("bubble");
  const [dock, setDock] = useState<DockSide>({
    side: "right",
    vertical: "bottom",
  });
  const initSettings = useSettingsStore((s) => s.init);
  const initChat = useChatStore((s) => s.init);
  const initVoice = useVoiceStore((s) => s.init);

  useEffect(() => {
    void initSettings();
    void initChat();
    void initVoice();
  }, [initSettings, initChat, initVoice]);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;
    void restoreStartup().then(({ mode: m, dock: d }) => {
      if (active) {
        setMode(m);
        setDock(d);
      }
    });
    void watchPosition().then((u) => {
      if (!active) u();
      else unlisten = u;
    });
    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  const expand = useCallback(async () => {
    const nextDock = await changeMode("chat", { focus: true });
    setDock(nextDock);
    setMode("chat");
  }, []);

  const collapse = useCallback(async () => {
    await changeMode("bubble", { dock });
    setMode("bubble");
  }, [dock]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (mode === "chat") {
        void collapse();
      } else {
        void getCurrentWindow().hide();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [collapse, mode]);

  return (
    <div className="h-screen w-screen overflow-hidden bg-transparent">
      {mode === "bubble" ? (
        <Bubble onExpand={expand} />
      ) : (
        <SpeechBalloonView onClose={collapse} dock={dock} />
      )}
    </div>
  );
}

export default App;
