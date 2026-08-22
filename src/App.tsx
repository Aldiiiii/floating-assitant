import { useCallback, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Bubble } from "./components/Bubble";
import { ChatPanel } from "./components/ChatPanel";
import { changeMode, restoreStartup, watchPosition, type Mode } from "./lib/window";
import { useChatStore } from "./stores/chat";
import { useSettingsStore } from "./stores/settings";
import { useVoiceStore } from "./stores/voice";

function App() {
  const [mode, setMode] = useState<Mode>("bubble");
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
    void restoreStartup().then((m) => {
      if (active) setMode(m);
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
    await changeMode("chat", { focus: true });
    setMode("chat");
  }, []);

  const collapse = useCallback(async () => {
    await changeMode("bubble");
    setMode("bubble");
  }, []);

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
      {mode === "bubble" ? <Bubble onExpand={expand} /> : <ChatPanel onClose={collapse} />}
    </div>
  );
}

export default App;
