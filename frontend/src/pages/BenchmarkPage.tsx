import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { addBenchmarkTrial, getBenchmarkSummary } from "../api/client";
import type { BenchmarkSummary, ModeSummary } from "../types";

function SummaryCard({ title, summary }: { title: string; summary: ModeSummary | null }) {
  return (
    <article className="summary-card">
      <h3>{title}</h3>
      {summary ? <dl><div><dt>次数</dt><dd>{summary.count}</dd></div><div><dt>中位数</dt><dd>{(summary.median_ms / 1000).toFixed(1)} s</dd></div><div><dt>P90</dt><dd>{(summary.p90_ms / 1000).toFixed(1)} s</dd></div><div><dt>范围</dt><dd>{(summary.min_ms / 1000).toFixed(1)}–{(summary.max_ms / 1000).toFixed(1)} s</dd></div></dl> : <div className="inline-empty"><strong>暂无测试数据</strong><span>请先完成至少一次测试</span></div>}
    </article>
  );
}

export default function BenchmarkPage() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<BenchmarkSummary | null>(null);
  const [started, setStarted] = useState<number | null>(null);
  const [point, setPoint] = useState("MP-03");
  const [currentValue, setCurrentValue] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const previousValue = 243.2;
  const delta = useMemo(() => currentValue ? Number(currentValue) - previousValue : null, [currentValue]);

  async function refresh() { setSummary(await getBenchmarkSummary()); }
  useEffect(() => { void refresh(); }, []);

  async function submitTraditional() {
    if (started === null || !currentValue || !photo) {
      setMessage("请填写人工测量值并选择现场照片。");
      return;
    }
    setBusy(true);
    await addBenchmarkTrial("traditional", Date.now() - started);
    setStarted(null);
    setCurrentValue("");
    setPhoto(null);
    setMessage("传统计时已保存，可以继续完成第 2、3 次。");
    await refresh();
    setBusy(false);
  }

  function startSystem() {
    sessionStorage.setItem("geo-recheck:system-started", String(Date.now()));
    navigate("/capture?benchmark=1");
  }

  return (
    <section className="page benchmark-page">
      <div className="page-heading"><div><p className="eyebrow">本机真实操作计时</p><h1>传统流程 VS 地灾复测</h1><p>每种流程建议至少完成 3 次；页面不预埋效率数字。</p></div></div>
      <div className="benchmark-modes">
        <section className="mode-panel">
          <span className="mode-label">传统流程</span>
          <h2>{started === null ? "人工读取、计算与填写" : "传统计时进行中"}</h2>
          {started === null ? <p>开始后完成点位选择、读取上一期、填写本次值、核对变化并选择照片。</p> : (
            <div className="traditional-form">
              <label>选择点位<select value={point} onChange={(event) => setPoint(event.target.value)}><option value="MP-03">MP-03 · WALL-02</option></select></label>
              <label>上一期值<input value={`${previousValue} mm`} disabled /></label>
              <label>本次人工测量值（mm）<input type="number" step="0.1" value={currentValue} onChange={(event) => setCurrentValue(event.target.value)} /></label>
              <label>人工计算变化<input value={delta == null || Number.isNaN(delta) ? "—" : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} mm`} disabled /></label>
              <label className="wide">选择现场照片<input type="file" accept="image/*" onChange={(event) => setPhoto(event.target.files?.[0] ?? null)} /></label>
              <small>{point} · {photo?.name ?? "尚未选择照片"}</small>
            </div>
          )}
          <button className="button primary" type="button" disabled={busy} onClick={() => started === null ? (setStarted(Date.now()), setMessage("")) : void submitTraditional()}>{started === null ? "开始传统流程计时" : "提交并停止计时"}</button>
        </section>
        <section className="mode-panel system"><span className="mode-label">系统流程</span><h2>上传、自动计算、人工确认</h2><p>计时从进入拍摄页开始，在确认生成记录时自动停止并保存。</p><button className="button primary" type="button" onClick={startSystem}>开始系统流程计时</button></section>
      </div>
      {message ? <div className="notice neutral" role="status">{message}</div> : null}
      <div className="benchmark-summary">
        <SummaryCard title="Traditional" summary={summary?.traditional ?? null} />
        <SummaryCard title="System" summary={summary?.system ?? null} />
        <article className="saving-card"><span>中位数节省</span><strong>{summary?.time_saved_percent == null ? "暂无对比" : `${summary.time_saved_percent.toFixed(1)}%`}</strong><small>{summary?.traditional && summary?.system ? "来自当前本机试验" : "两种流程各完成至少一次后显示"}</small></article>
      </div>
      <div className="notice neutral">{summary?.disclaimer ?? "本页结果来自本机实际测试，不代表真实野外生产效率。"}</div>
    </section>
  );
}
