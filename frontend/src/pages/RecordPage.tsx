import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { evidenceUrl, getInspection } from "../api/client";
import type { Measurement } from "../types";

function Evidence({ src, alt, label }: { src: string | null; alt: string; label: string }) {
  const url = evidenceUrl(src);
  return url ? <figure><img src={url} alt={alt} /><figcaption>{label}</figcaption></figure> : <div className="evidence-empty">{label}：暂无影像</div>;
}

export default function RecordPage() {
  const { id = "" } = useParams();
  const [record, setRecord] = useState<Measurement | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getInspection(id).then((value) => { if (active) setRecord(value); }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "记录加载失败"); });
    return () => { active = false; };
  }, [id]);

  if (error) return <section className="page"><div className="notice error">{error}</div></section>;
  if (!record) return <section className="page"><div className="empty">正在生成墙体裂缝复测记录…</div></section>;
  const opening = record.opening_delta_mm ?? record.delta_mm;

  return (
    <section className="page record-page">
      <div className="record-toolbar no-print"><div><p className="eyebrow">已自动留痕 · 人工确认完成</p><h1>墙体裂缝复测记录</h1></div><div><button className="button" type="button" onClick={() => window.print()}>打印 / 导出 PDF</button><Link className="button primary" to="/">返回首页</Link></div></div>
      <article className="paper-record">
        <header><div><p>贵州仁怀 · 公开工作场景复原</p><h2>墙体裂缝复测记录</h2></div><span>记录编号：{record.id}</span></header>
        <section className="record-opening"><span>本次较上次张开</span><strong>{opening != null && opening >= 0 ? "+" : ""}{opening?.toFixed(1) ?? "—"} mm</strong><small>不构成灾害风险判断</small></section>
        <dl className="record-grid">
          <div><dt>监测时间</dt><dd>{new Date(record.capture_time).toLocaleString("zh-CN", { hour12: false })}</dd></div>
          <div><dt>记录人</dt><dd>{record.observer_name ?? "—"}</dd></div>
          <div><dt>监测点</dt><dd>贵州仁怀 · 墙体裂缝复测</dd></div>
          <div><dt>裂缝编号</dt><dd>{record.crack_id}</dd></div>
          <div><dt>位置描述</dt><dd>{record.location_description}</dd></div>
          <div><dt>场景类型</dt><dd>墙体裂缝复测</dd></div>
          <div><dt>张开变化</dt><dd className="record-delta">{opening != null && opening >= 0 ? "+" : ""}{opening?.toFixed(1) ?? "—"} mm</dd></div>
          <div><dt>剪切变化</dt><dd>{record.shear_delta_mm == null ? "未输出" : `${record.shear_delta_mm >= 0 ? "+" : ""}${record.shear_delta_mm.toFixed(1)} mm`}</dd></div>
          <div><dt>质量状态</dt><dd>{record.status === "confirmed" ? "通过 · 已确认" : record.status}</dd></div>
          <div><dt>人工确认</dt><dd>{record.human_confirmed ? "已确认" : "未确认"}</dd></div>
          <div><dt>测量方法</dt><dd>墙面正视化相对变形</dd></div>
          <div><dt>数据性质</dt><dd>公开场景复原 / 受控仿真</dd></div>
          <div className="wide"><dt>备注</dt><dd>{record.remark || "无"}</dd></div>
        </dl>
        <section className="record-evidence"><h3>自动带出的影像证据</h3><div><Evidence src={record.evidence.original} alt="记录中的本次原始墙体照片" label="原始照片" /><Evidence src={record.evidence.rectified} alt="记录中的墙面正视校正图" label="正视校正图" /><Evidence src={record.evidence.overlay} alt="记录中的视觉复测贴检测图" label="点位识别图" /></div></section>
        <p className="record-boundary">本记录由系统自动生成并经人工确认。真实工作人员故事来自公开报道；墙体图片来自 CC BY 4.0 公开数据；毫米位移为受控仿真，非真实贵州监测数据。</p>
      </article>
      <section className="closing-statement"><span>不是预测山什么时候塌。</span><strong>只是把量一次、比一次、记一次，变成拍一次、确认一次。</strong></section>
    </section>
  );
}
