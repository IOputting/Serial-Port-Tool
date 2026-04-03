// 📁 路径: src/views/ScriptEditor.tsx
import { useState } from "react";
import { useSerialStore } from "../stores/useSerialStore";

export default function ScriptEditor() {
  const [script, setScript] = useState("for(let i=0; i<5; i++) {\n  send('AT+TEST\\r\\n');\n}");
  const { executeSend, isConnected } = useSerialStore();

  const runScript = async () => {
    if (!isConnected) return alert("请先连接串口");
    try {
      // ⚠️ 核心魔法：把执行发送的能力注入到用户的脚本环境中
      const userFunc = new Function('send', `
        return (async () => {
          ${script}
        })();
      `);
      
      // 包装一下 executeSend 传进去
      await userFunc((data: string) => executeSend(data, false, false));
      alert("脚本执行完毕！");
    } catch (e) {
      alert("脚本报错: " + e);
    }
  };

  return (
    <div style={{ padding: "20px", height: "100%", display: "flex", flexDirection: "column" }}>
      <h2>💻 编写自动化发送脚本 (JavaScript)</h2>
      <textarea 
        value={script} 
        onChange={e => setScript(e.target.value)}
        style={{ flex: 1, fontFamily: "monospace", padding: "10px", fontSize: "14px" }}
      />
      <button onClick={runScript} style={{ padding: "10px", marginTop: "10px" }}>运行脚本 🚀</button>
    </div>
  );
}
