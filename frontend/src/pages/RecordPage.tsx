import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { evidenceUrl, getInspection } from "../api/client";
import type { Measurement } from "../types";

export default function RecordPage() {
  const { id = "" } = useParams();
  const [record, setRecord] = useState<Measurement | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getInspection(id).then((value) => { if (active) setRecord(value); }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "记录加载失败");
    });
    return () => { active = false; };
  }, [id]);

  if (error) return <section className="page"><div className="notice error">{error}</div></section>;
  if (!record) return <section className="page"><div className="empty">正在生成巡查记录…</div></section>;

  return (
    <section className="page record-page">
      <div className="record-toolbar no-print">
        <div><p className="eyebrow">已自动留痕</p><h1>地质灾害简易监测记录</h1></div>
        <div><button className="button" type="button" onClick={() => window.print()}>打印 / 导出 PDF</button><Link className="button primary" to="/">返回今日复测</Link></div>
      </div>
      <article className="paper-record">
        <header><h2>地质灾害简易监测记录</h2><span>记录编号：{record.id}</span></header>
        <dl className="record-grid">
          <div><dt>监测时间</dt><dd>{new Date(record.capture_time).toLocaleString("zh-CN", { hour12: false })}</dd></div>
          <div><dt>记录人</dt><dd>{record.observer_name ?? "—"}</dd></div>
          <div><dt>隐患点编号</dt><dd>{record.hazard_id}</dd></div>
          <div><dt>监测点编号</dt><dd>{record.monitor_point_id}</dd></div>
          <div><dt>构筑物编号</dt><dd>{record.structure_id}</dd></div>
          <div><dt>监测方法</dt><dd>双侧视觉标靶摄影测量</dd></div>
          <div className="wide"><dt>位置描述</dt><dd>{record.location_description}</dd></div>
          <div><dt>经纬度</dt><dd>{record.latitude.toFixed(4)}, {record.longitude.toFixed(4)}（{record.location_mode === "demo" ? "演示" : "浏览器"}）</dd></div>
          <div><dt>质量状态</dt><dd>{record.status === "confirmed" ? "通过 · 已确认" : record.status}</dd></div>
          <div><dt>图像质量</dt><dd>{(record.quality_score * 100).toFixed(0)} / 100</dd></div>
          <div><dt>上一期数值</dt><dd>{record.previous_distance_mm?.toFixed(1)} mm</dd></div>
          <div><dt>本期数值</dt><dd>{record.current_distance_mm?.toFixed(1)} mm</dd></div>
          <div><dt>变化量</dt><dd className="record-delta">{record.delta_mm != null && record.delta_mm >= 0 ? "+" : ""}{record.delta_mm?.toFixed(1)} mm</dd></div>
          <div><dt>人工确认</dt><dd>{record.human_confirmed ? "已确认" : "未确认"}</dd></div>
          <div className="wide"><dt>备注</dt><dd>{record.remark || "无"}</dd></div>
        </dl>
        <section className="record-evidence">
          <h3>影像证据</h3>
          <div>
            {evidenceUrl(record.evidence.original) ? <figure><img src={evidenceUrl(record.evidence.original)!} alt="本次上传的原始照片" /><figcaption>原始照片</figcaption></figure> : <div className="evidence-empty">原始照片：暂无历史证据</div>}
            {evidenceUrl(record.evidence.overlay) ? <figure><img src={evidenceUrl(record.evidence.overlay)!} alt="标靶检测叠加图" /><figcaption>检测与测量叠加图</figcaption></figure> : null}
            {evidenceUrl(record.evidence.rectified) ? <figure><img src={evidenceUrl(record.evidence.rectified)!} alt="透视校正对比图" /><figcaption>左右标靶正视化</figcaption></figure> : <div className="evidence-empty">正视化图：暂无历史证据</div>}
          </div>
        </section>
        <p className="record-boundary">本记录为演示系统自动生成并经人工确认。它记录视觉锚点相对位移，不构成灾害风险判断、预警或撤离依据。</p>
      </article>
    </section>
  );
}
