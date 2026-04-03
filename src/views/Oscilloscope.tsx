// 📁 路径: src/views/Oscilloscope.tsx
import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
// import ReactECharts from 'echarts-for-react'; // 未来你可以装这个

export default function Oscilloscope() {
  const [chartData, setChartData] = useState<number[]>([]);

  // 独立监听串口数据，专门用来画图，完全不影响基础通讯界面的文字日志
  useEffect(() => {
    const unlisten = listen<number[]>("serial-data", (event) => {
      // 在这里把 byte 数组解析成你需要画图的数值
      // setChartData(prev => [...prev, newValue]);
    });
    return () => { unlisten.then(f => f()); };
  }, []);

  return (
    <div style={{ padding: "20px", height: "100%", boxSizing: "border-box" }}>
      <h2>📈 实时波形图</h2>
      {/* <ReactECharts option={你的图表配置} /> */}
      <div style={{ flex: 1, backgroundColor: "#fff", border: "1px solid #ddd" }}>
        开发中...
      </div>
    </div>
  );
}
