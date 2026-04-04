import { useState, useEffect, useRef, memo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save, open } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { useSerialStore, QuickCommand, LogEntry } from "../stores/useSerialStore";
// 💡 必须确保你已经安装了 npm install react-virtuoso
import { Virtuoso } from 'react-virtuoso';

type SendMode = 'ascii' | 'hex' | 'timed' | 'file';

// ==========================================
// 1. 独立日志行组件
// ==========================================
const LogRow = memo(({ log, showInvisible }: { log: LogEntry, showInvisible: boolean }) => {
  const [isHovered, setIsHovered] = useState(false);

  const renderText = (text: string, isHex: boolean) => {
    if (!isHex && showInvisible) return text.replace(/\r/g, '\\r').replace(/\n/g, '\\n\n').replace(/\0/g, '\\0');
    if (!isHex) return text.replace(/\r/g, ''); 
    return text;
  };

  let color = "#fff"; 
  let prefix = "";
  if (log.type === 'send') { color = "#40a9ff"; prefix = "-> "; } 
  else if (log.type === 'recv') { color = "#73d13d"; prefix = "<- "; } 
  else if (log.type === 'sys') { color = "#ffc53d"; prefix = "SYS "; } 

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ 
        display: "flex", 
        justifyContent: "space-between",
        backgroundColor: isHovered ? "rgba(255, 255, 255, 0.05)" : "transparent",
        color: color, 
        wordBreak: "break-all", 
        fontFamily: "'Cascadia Code', Consolas, monospace", 
        fontSize: "14px", 
        lineHeight: "1.5",
        paddingTop: log.isContinuous ? "2px" : "10px", 
        paddingBottom: "2px",
        transition: "background-color 0.15s ease"
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        {!log.isContinuous && (
          <div style={{ opacity: 0.8, marginBottom: "4px", padding: "0 15px", userSelect: "none" }}>
            <span style={{ color: "#777", marginRight: "8px", fontSize: "12px" }}>[{log.time}]</span>
            <span>{prefix}</span>
          </div>
        )}
        <div style={{ whiteSpace: "pre-wrap", paddingLeft: "15px", paddingRight: "15px" }}>
          {renderText(log.text, log.isHex)}
        </div>
      </div>

      <div style={{
        paddingRight: "15px",
        paddingTop: log.isContinuous ? "0px" : "20px",
        opacity: isHovered ? 1 : 0, 
        transition: "opacity 0.2s ease",
        color: "#888",
        fontSize: "12px",
        userSelect: "none",
        pointerEvents: "none", 
        whiteSpace: "nowrap"
      }}>
        {log.time}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  return prevProps.log.id === nextProps.log.id && prevProps.showInvisible === nextProps.showInvisible;
});


// ==========================================
// 2. 浏览器原生级别的“非受控”发送区域 (保持极致极速)
// ==========================================
const SendControlPanel = memo(({ isConnected, executeSend }: { isConnected: boolean, executeSend: any }) => {
  const [sendMode, setSendMode] = useState<SendMode>('ascii');
  const [appendCrlf, setAppendCrlf] = useState(true);
  const [clearAfterSend, setClearAfterSend] = useState(true); 
  const [timerInterval, setTimerInterval] = useState(1000);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [timedIsHex, setTimedIsHex] = useState(false); 
  const [selectedFilePath, setSelectedFilePath] = useState("");
  const [renderKey, setRenderKey] = useState(0);
  
  const [quickCommands, setQuickCommands] = useState<QuickCommand[]>([]);
  const [suggestions, setSuggestions] = useState<QuickCommand[]>([]);
  const [suggestionIdx, setSuggestionIdx] = useState(0);

  const timerRef = useRef<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if ((!isConnected || sendMode !== 'timed') && isTimerRunning) stopTimer();
    return () => stopTimer();
  }, [isConnected, sendMode]);

  const handleMainSendAction = async () => {
    if (sendMode === 'file') {
      if (!isConnected) return alert("请先连接串口！");
      if (!selectedFilePath) return alert("请先选择要发送的文件！");
      try { await invoke("send_file", { filePath: selectedFilePath }); } catch (e) { alert("启动文件发送失败: " + e); }
    } else if (sendMode === 'timed') {
      if (isTimerRunning) stopTimer(); else startTimer();
    } else {
      const textToSend = textareaRef.current?.value || "";
      const isHex = sendMode === 'hex';
      const success = await executeSend(textToSend, isHex, appendCrlf && !isHex);
      
      if (success) {
        if (clearAfterSend) { 
          if (textareaRef.current) textareaRef.current.value = ""; 
          setSuggestions([]); 
          setRenderKey(prev => prev + 1); 
        }
        setTimeout(() => textareaRef.current?.focus(), 50);
      }
    }
  };

  const startTimer = () => {
    const textToSend = textareaRef.current?.value || "";
    if (!isConnected) return alert("请先连接串口！");
    if (!textToSend) return alert("请输入要发送的数据！");
    if (timerInterval < 10) return alert("定时时间不能小于 10ms");
    
    setIsTimerRunning(true); 
    executeSend(textToSend, timedIsHex, appendCrlf && !timedIsHex); 
    timerRef.current = window.setInterval(() => { 
      executeSend(textToSend, timedIsHex, appendCrlf && !timedIsHex); 
    }, timerInterval);
  };

  const stopTimer = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } setIsTimerRunning(false); };

  const handleSelectFile = async () => {
    const selected = await open({ multiple: false, directory: false });
    if (selected) setSelectedFilePath(selected as string);
  };

  const handleTextareaFocus = () => {
    try {
      const savedCmds = JSON.parse(localStorage.getItem('serial-quick-commands') || '[]');
      setQuickCommands(savedCmds);
    } catch (e) {
      setQuickCommands([]);
    }
  };

  const handleTextareaChange = () => {
    if (!textareaRef.current) return;
    const val = textareaRef.current.value; 
    const cursor = textareaRef.current.selectionStart;
    const currentWord = val.substring(0, cursor).split(/\s+/).pop() || "";
    
    if (currentWord.length > 0) {
      setSuggestions(quickCommands.filter((c: QuickCommand) => 
        c.data.toLowerCase().startsWith(currentWord.toLowerCase())
      )); 
      setSuggestionIdx(0);
    } else { 
      setSuggestions([]); 
    }
  };

  const applySuggestion = (selected: QuickCommand) => {
    if (!textareaRef.current) return;
    const target = textareaRef.current; 
    const cursor = target.selectionStart;
    const val = target.value;
    
    const textBeforeCursor = val.substring(0, cursor);
    const currentWord = textBeforeCursor.split(/\s+/).pop() || "";
    const newTextBefore = textBeforeCursor.substring(0, textBeforeCursor.length - currentWord.length) + selected.data;
    const newText = newTextBefore + val.substring(cursor);
    
    target.value = newText; 
    setSuggestions([]);
    
    setTimeout(() => { 
      target.focus(); 
      target.selectionStart = target.selectionEnd = newTextBefore.length; 
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length > 0) {
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey)) { e.preventDefault(); applySuggestion(suggestions[suggestionIdx]); return; } 
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSuggestionIdx(prev => (prev > 0 ? prev - 1 : suggestions.length - 1)); return; } 
      else if (e.key === 'ArrowDown') { e.preventDefault(); setSuggestionIdx(prev => (prev < suggestions.length - 1 ? prev + 1 : 0)); return; } 
      else if (e.key === 'Escape') { setSuggestions([]); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) { e.preventDefault(); handleMainSendAction(); }
    if (e.key === 'Enter' && e.ctrlKey) { 
      e.preventDefault(); 
      if (textareaRef.current) {
        const target = textareaRef.current;
        const start = target.selectionStart;
        const end = target.selectionEnd;
        const val = target.value;
        target.value = val.substring(0, start) + '\n' + val.substring(end);
        target.selectionStart = target.selectionEnd = start + 1;
        handleTextareaChange(); 
      }
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", backgroundColor: "#fff", padding: "10px 15px", borderRadius: "8px", boxShadow: "0 -2px 10px rgba(0,0,0,0.02)", position: "relative" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: "6px", borderBottom: "1px solid #eee" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
          <span style={{ fontWeight: "bold", fontSize: "14px", color: "#333" }}>发送模式：</span>
          <select value={sendMode} onChange={(e) => setSendMode(e.target.value as SendMode)} style={{ padding: "4px 8px", borderRadius: "4px", border: "1px solid #ccc", outline: "none", cursor: "pointer", fontSize: "13px" }}>
            <option value="ascii">📝 手动 (ASCII)</option><option value="hex">📦 手动 (HEX)</option><option value="timed">⏱️ 定时发送</option><option value="file">📁 文件发送</option>
          </select>
          <div style={{ display: "flex", gap: "15px", marginLeft: "10px", borderLeft: "1px solid #ddd", paddingLeft: "15px" }}>
            {sendMode === 'ascii' && <label style={{ fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", color: "#555" }}><input type="checkbox" checked={appendCrlf} onChange={(e) => setAppendCrlf(e.target.checked)} />加回车换行</label>}
            {sendMode === 'timed' && (
              <>
                <label style={{ fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", color: timedIsHex ? "#e91e63" : "#555" }}><input type="checkbox" checked={timedIsHex} onChange={(e) => setTimedIsHex(e.target.checked)} disabled={isTimerRunning} />以 HEX 发送</label>
                {(!timedIsHex) && <label style={{ fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", color: "#555" }}><input type="checkbox" checked={appendCrlf} onChange={(e) => setAppendCrlf(e.target.checked)} disabled={isTimerRunning} />加回车换行</label>}
                <span style={{ fontSize: "13px", color: "#555", display: "flex", alignItems: "center", gap: "5px" }}>间隔: <input type="number" value={timerInterval} onChange={(e) => setTimerInterval(Number(e.target.value))} disabled={isTimerRunning} style={{ width: "60px", padding: "2px", border: "1px solid #ccc", borderRadius: "3px" }} /> ms</span>
              </>
            )}
            {(sendMode === 'ascii' || sendMode === 'hex') && <label style={{ fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", color: "#555" }}><input type="checkbox" checked={clearAfterSend} onChange={(e) => setClearAfterSend(e.target.checked)} />发送后清空</label>}
          </div>
        </div>
      </div>

      {suggestions.length > 0 && sendMode !== 'file' && (
        <div style={{ position: 'absolute', bottom: '100%', left: '15px', marginBottom: '8px', backgroundColor: '#fff', border: '1px solid #ccc', borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', zIndex: 100, minWidth: '300px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ maxHeight: '175px', overflowY: 'auto' }}>
            {suggestions.map((s, idx) => (
              <div key={s.id} onMouseDown={(e) => { e.preventDefault(); applySuggestion(s); }} onMouseEnter={() => setSuggestionIdx(idx)} style={{ padding: '8px 12px', backgroundColor: idx === suggestionIdx ? '#e6f7ff' : '#fff', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', fontSize: '13px', color: '#333' }}>
                <span style={{ fontWeight: 'bold', color: '#0050b3' }}>{s.data}</span><span style={{ color: '#888', marginLeft: '10px' }}>({s.name})</span>
              </div>
            ))}
          </div>
          <div style={{ padding: '4px 12px', fontSize: '11px', color: '#bbb', backgroundColor: '#fafafa', textAlign: 'right', borderTop: '1px solid #eee' }}>按 Tab/Enter 补全，↑/↓/滚轮 切换</div>
        </div>
      )}

      <div style={{ display: "flex", gap: "10px", alignItems: "stretch" }}>
        {sendMode === 'file' ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "10px", backgroundColor: "#fafafa", padding: "8px 15px", borderRadius: "6px", border: "1px dashed #d9d9d9", minHeight: "60px", boxSizing: "border-box" }}>
            <div style={{ fontSize: "20px", opacity: 0.5 }}>📄</div>
            <input type="text" value={selectedFilePath} readOnly placeholder="请点击右侧按钮选择文件..." style={{ flex: 1, padding: "8px 12px", borderRadius: "4px", border: "1px solid #ccc", outline: "none", backgroundColor: "#fff", fontSize: "14px" }} />
            <button onClick={handleSelectFile} style={{ padding: "8px 15px", cursor: "pointer", border: "1px solid #1890ff", backgroundColor: "#e6f7ff", color: "#1890ff", borderRadius: "4px", fontWeight: "bold", fontSize: "14px" }}>浏览文件</button>
          </div>
        ) : (
          <textarea 
            key={renderKey}
            ref={textareaRef} 
            onChange={handleTextareaChange} 
            onFocus={handleTextareaFocus}
            onKeyDown={handleKeyDown} 
            onBlur={() => setTimeout(() => setSuggestions([]), 150)}
            disabled={!isConnected || (sendMode === 'timed' && isTimerRunning)} 
            placeholder={sendMode === 'hex' ? "在此输入 HEX 数据(如: FF 0A)..." : "在此输入发送内容(换行: Ctrl+Enter)..."} 
            style={{ 
              flex: 1, minWidth: 0, minHeight: "60px", height: "60px", padding: "10px 12px", borderRadius: "6px", 
              border: "1px solid #d9d9d9", outline: "none", resize: "none", 
              fontFamily: "'Cascadia Code', Consolas, 'Microsoft YaHei', monospace", 
              fontSize: "14px", fontWeight: "normal", WebkitFontSmoothing: "antialiased", lineHeight: "1.5", 
              cursor: (isConnected && !isTimerRunning) ? "text" : "not-allowed", 
              backgroundColor: (isConnected && !isTimerRunning) ? "#fff" : "#f5f5f5", boxSizing: "border-box", 
              overflowY: "auto", wordBreak: "break-word" 
            }}
          />
        )}
        <button onClick={handleMainSendAction} disabled={!isConnected} style={{ width: "120px", cursor: isConnected ? "pointer" : "not-allowed", backgroundColor: !isConnected ? "#d9d9d9" : (sendMode === 'timed' && isTimerRunning) ? "#ff4d4f" : "#1890ff", color: "white", border: "none", borderRadius: "6px", fontWeight: "bold", fontSize: "15px", display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: "6px", transition: "all 0.2s" }}>
          <span>{sendMode === 'timed' ? (isTimerRunning ? '停止定时' : '开始定时') : sendMode === 'file' ? '发送文件' : '发送'}</span>
          {sendMode !== 'timed' && sendMode !== 'file' && <span style={{ fontSize: "12px", fontWeight: "normal", opacity: 0.8 }}>(Enter)</span>}
        </button>
      </div>
    </div>
  );
});


// ==========================================
// 3. 顶层主视图 (接入 Virtuoso 虚拟列表)
// ==========================================
export default function BasicView() {
  const { isConnected, logs, clearLogs, isHexRecv, setIsHexRecv, executeSend } = useSerialStore();
  const [showInvisible, setShowInvisible] = useState(false); 

  const handleSaveLogs = async () => {
    if (logs.length === 0) return alert("当前没有可保存的日志！");
    try {
      const textContent = logs.map(log => {
        let prefix = log.type === 'send' ? "发送 -> " : log.type === 'recv' ? "接收 <- " : "系统 -- ";
        const cleanText = log.text.replace(/\r/g, '');
        return `[${log.time}] ${prefix}${cleanText}`;
      }).join('\n');
      const filePath = await save({ filters: [{ name: 'Log/Text File', extensions: ['txt', 'log'] }], defaultPath: 'serial_log.txt' });
      if (filePath) { await writeTextFile(filePath, textContent); alert("日志保存成功！📂"); }
    } catch (err: any) { alert("保存失败：" + (typeof err === 'string' ? err : err?.message)); }
  };

  return (
    <div style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", padding: "20px", gap: "15px", position: "relative", boxSizing: "border-box" }}>
      
      {/* 顶部控制栏 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "#fff", padding: "8px 15px", borderRadius: "8px", border: "1px solid #e8e8e8", boxShadow: "0 1px 4px rgba(0,0,0,0.02)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "50%", backgroundColor: isConnected ? "#52c41a" : "#f5222d", boxShadow: isConnected ? "0 0 6px #52c41a" : "none" }}></span>
          <span style={{ fontSize: "15px", fontWeight: "bold", color: "#333" }}>{isConnected ? "已连接" : "未连接"}</span>
        </div>
        
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "13px", color: "#666" }}>解析:</span>
              <select value={isHexRecv ? "hex" : "ascii"} onChange={(e) => setIsHexRecv(e.target.value === "hex")} style={{ padding: "4px 6px", borderRadius: "4px", border: "1px solid #d9d9d9", outline: "none", cursor: "pointer", fontSize: "13px", color: "#333", backgroundColor: "#fafafa" }}>
                <option value="ascii">📝 ASCII</option><option value="hex">📦 HEX</option>
              </select>
            </div>
            <label style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", color: isHexRecv ? "#bbb" : "#555", fontSize: "13px" }}>
              <input type="checkbox" checked={showInvisible} onChange={(e) => setShowInvisible(e.target.checked)} disabled={isHexRecv} /> 显示不可见字符
            </label>
          </div>
          <div style={{ width: "1px", height: "18px", backgroundColor: "#e0e0e0" }}></div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button onClick={handleSaveLogs} title="导出日志" style={{ cursor: "pointer", padding: "4px 12px", borderRadius: "4px", border: "1px solid #b7eb8f", backgroundColor: "#f6ffed", color: "#389e0d", fontSize: "13px", display: "flex", alignItems: "center", gap: "4px", transition: "all 0.2s" }}><span>💾</span> 保存日志</button>
            <button onClick={clearLogs} style={{ cursor: "pointer", padding: "4px 12px", borderRadius: "4px", border: "1px solid #d9d9d9", backgroundColor: "#fff", color: "#555", fontSize: "13px", display: "flex", alignItems: "center", gap: "4px", transition: "all 0.2s" }}><span>🗑️</span> 清空</button>
          </div>
        </div>
      </div>

      {/* 🚀 真正的工业级日志区：接入 Virtuoso 虚拟列表 */}
      <div style={{ flex: 1, backgroundColor: "#1e1e1e", borderRadius: "8px", overflow: "hidden", boxShadow: "inset 0 2px 10px rgba(0,0,0,0.2)" }}>
        {logs.length === 0 ? (
          <div style={{ padding: "15px", color: "#666", fontFamily: "'Cascadia Code', Consolas, monospace", fontSize: "14px" }}>等待数据传输...</div>
        ) : (
          <Virtuoso
            style={{ height: '100%', width: '100%' }}
            data={logs}
            // 💡 神仙属性：自动完美跟随最新消息滚动！你往上翻看历史时它还会智能停住！
            followOutput="auto" 
            itemContent={(index, log) => (
              <LogRow log={log} showInvisible={showInvisible} />
            )}
          />
        )}
      </div>

      {/* 完美隔离的发送区 */}
      <SendControlPanel isConnected={isConnected} executeSend={executeSend} />
      
    </div>
  );
}
