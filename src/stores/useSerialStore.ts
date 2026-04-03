import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export type LogType = 'send' | 'recv' | 'sys';
export interface LogEntry { id: string; type: LogType; text: string; time: string; isHex: boolean; }
export interface QuickCommand { id: string; name: string; data: string; isHex: boolean; }
export type ViewMode = 'basic' | 'oscilloscope' | 'script';

export const getTimestamp = () => {
  const now = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)}`;
};

interface SerialState {
  activeView: ViewMode;
  setActiveView: (view: ViewMode) => void;
  
  isConnected: boolean;
  setIsConnected: (status: boolean) => void;
  
  logs: LogEntry[];
  addLog: (log: LogEntry) => void;
  setLogs: (updater: LogEntry[] | ((prev: LogEntry[]) => LogEntry[])) => void;
  clearLogs: () => void;
  
  isHexRecv: boolean;
  setIsHexRecv: (status: boolean) => void;
  
  executeSend: (data: string, isHex: boolean, useCrlf: boolean) => Promise<boolean>;
}

export const useSerialStore = create<SerialState>((set, get) => ({
  activeView: 'basic',
  setActiveView: (view) => set({ activeView: view }),

  isConnected: false,
  setIsConnected: (status) => set({ isConnected: status }),
  
  logs: [],
  addLog: (log) => set((state) => ({ logs: [...state.logs, log] })),
  setLogs: (updater) => set((state) => ({ logs: typeof updater === 'function' ? updater(state.logs) : updater })),
  clearLogs: () => set({ logs: [] }),
  
  isHexRecv: false,
  setIsHexRecv: (status) => set({ isHexRecv: status }),
  
  executeSend: async (data, isHex, useCrlf) => {
    const state = get();
    if (!state.isConnected) { alert("请先连接串口！"); return false; }
    if (!data) return false;
    let dataToSend = data;
    if (!isHex && useCrlf) dataToSend += "\r\n"; 
    try {
      await invoke("send_data", { data: dataToSend, isHex: isHex });
      state.addLog({ id: crypto.randomUUID(), type: 'send', text: dataToSend + (isHex ? '\n' : ''), time: getTimestamp(), isHex: isHex });
      return true;
    } catch (e) { 
      alert("发送报错: " + e); 
      return false; 
    }
  }
}));
