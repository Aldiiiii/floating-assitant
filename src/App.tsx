import { useCallback, useEffect, useRef, useState } from "react";
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
import { playBargeInCue } from "./lib/earcons";

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

  const modeRef = useRef<Mode>(mode);
  modeRef.current = mode;

  const expand = useCallback(async () => {
    const nextDock = await changeMode("chat", { focus: true });
    setDock(nextDock);
    setMode("chat");
  }, []);

  const collapse = useCallback(async () => {
    await changeMode("bubble", { dock });
    setMode("bubble");
  }, [dock]);

  const toggle = useCallback(() => {
    if (modeRef.current === "chat") {
      void collapse();
    } else {
      void expand();
    }
  }, [collapse, expand]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void getCurrentWindow().listen("toggle-chat", () => {
      toggle();
    }).then((u) => {
      unlisten = u;
    });
    return () => {
      unlisten?.();
    };
  }, [toggle]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        const vs = useVoiceStore.getState();
        if (vs.speaking) {
          playBargeInCue();
          vs.stopSpeaking();
          useChatStore.getState().stop();
          useChatStore.getState().markInterrupted();
          if (vs.mode === "dialog" && vs.dialogActive && vs.state === "idle") {
            void vs.startRecording().catch(() => undefined);
          }
          return;
        }
        if (modeRef.current === "chat") {
          void collapse();
        } else {
          void getCurrentWindow().hide();
        }
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key === "/") {
        event.preventDefault();
        toggle();
        return;
      }

      if (event.altKey && (event.key === "c" || event.key === "C")) {
        event.preventDefault();
        toggle();
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [collapse, toggle]);

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
