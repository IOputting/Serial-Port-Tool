import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useSerialStore, getTimestamp } from "./stores/useSerialStore";
import SerialSettings from "./components/SerialSettings";
import BasicView from "./views/BasicView";
import "./App.css";
import Oscilloscope from "./views/Oscilloscope";
import ScriptEditor from "./views/ScriptEditor";

function App() {
  const { activeView, setIsConnected, setLogs, addLog } = useSerialStore();
  const decoderRef = useRef(new TextDecoder("utf-8"));

  useEffect(() => {
    const unlistenData = listen<number[]>("serial-data", (event) => {
      const bytes = new Uint8Array(event.payload);
      const isHex = useSerialStore.getState().isHexRecv;
      
      let newText = "";
      if (isHex) {
        newText = Array.from(bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ') + ' ';
      } else {
        newText = decoderRef.current.decode(bytes, { stream: true });
      }
      if (!newText) return;

      setLogs(prev => {
        const lastLog = prev[prev.length - 1];
        if (lastLog && lastLog.type === 'recv' && lastLog.isHex === isHex) {
          const updated = [...prev]; 
          updated[updated.length - 1] = { ...lastLog, text: lastLog.text + newText }; 
          return updated;
        } else { 
          return [...prev, { id: crypto.randomUUID(), type: 'recv', text: newText, time: getTimestamp(), isHex }]; 
        }
      });
    });

    const unlistenDisconnect = listen<string>("serial-disconnected", async (event) => {
      setIsConnected(false); 
      addLog({ id: crypto.randomUUID(), type: 'sys', text: `设备断开 (${event.payload}) 🔴\n`, time: getTimestamp(), isHex: false });
      try { await invoke("disconnect_port"); } catch (e) {}
    });

    const unlistenSys = listen<string>("sys-log", (event) => { 
      addLog({ id: crypto.randomUUID(), type: 'sys', text: event.payload + '\n', time: getTimestamp(), isHex: false });
    });

    return () => { 
      unlistenData.then(f => f()); 
      unlistenDisconnect.then(f => f()); 
      unlistenSys.then(f => f()); 
    };
  }, []);

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw", backgroundColor: "#f0f2f5", overflow: "hidden" }}>
      
      <SerialSettings />

      <div style={{ flex: 1, position: "relative", display: "flex", flexDirection: "column" }}>
        
        {activeView === 'basic' && <BasicView />}
        
        {activeView === 'oscilloscope' && <Oscilloscope />}

        {activeView === 'script' && <ScriptEditor />}
      </div>

    </div>
  );
}

export default App;
