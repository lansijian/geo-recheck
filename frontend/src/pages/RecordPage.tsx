import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { evidenceUrl, getInspection } from "../api/client";
import type { Measurement } from "../types";
import { loadShowcaseSessionRecord } from "../utils/showcaseSession";

function Evidence({ src, alt, label }: { src: string | null | undefined; alt: string; label: string }) {
  const url = evidenceUrl(src);
  return url ? <figure><img src={url} alt={alt} /><figcaption>{label}</figcaption></figure> : <div className="evidence-empty">{label}：暂无影像</div>;
}

export default function RecordPage() {
  const { id = "" } = useParams();
  const [record, setRecord] = useState<Measurement | null>(null);
  const [error, setError] = useState("");
  const [isShowcaseSession, setIsShowcaseSession] = useState(false);

  useEffect(() => {
    let active = true;
    const sessionRecord = loadShowcaseSessionRecord(id);
    if (sessionRecord) {
      setRecord(sessionRecord);
      setIsShowcaseSession(true);
      return () => { active = false; };
    }
    getInspection(id).then((value) => { if (active) setRecord(value); }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "记录加载失败"); });
    return () => { active = false; };
  }, [id]);

  if (error) return <section className="page"><div className="notice error">{error}</div></section>;
  if (!record) return <section className="page"><div className="empty">正在生成墙体裂缝复测记录…</div></section>;
  const cumulative = record.opening_since_baseline_mm;
  const cumulativeText = cumulative == null ? "—" : `${cumulative >= 0 ? "+" : ""}${cumulative.toFixed(1)} mm`;
  const perPeriod = record.opening_delta_mm;
  const perPeriodText = perPeriod == null ? "—" : `${perPeriod >= 0 ? "+" : ""}${perPeriod.toFixed(1)} mm`;
  const confirmedItems = record.ai_review?.items.filter((item) => item.human_status === "accepted" || item.human_status === "edited") ?? [];
  const rejectedItems = record.ai_review?.items.filter((item) => item.human_status === "rejected") ?? [];
  const caseBase = record.demo_case_id ? `/demo-cases/${record.demo_case_id}` : null;
  const isDemoRecord = record.data_provenance.mode === "demo" || Boolean(record.demo_case_id);

  return (
    <section className="page record-page">
      <div className="record-toolbar no-print"><div><p className="eyebrow">几何结果 + 人工确认的 AI 观察</p><h1>巡查复测记录</h1></div><div><button className="button" type="button" onClick={() => window.print()}>打印 / 导出 PDF</button><Link className="button primary" to="/">返回首页</Link></div></div>
      {isShowcaseSession ? <div className="notice" role="status">路演会话记录：保存在当前浏览器标签页中，用于稳定演示；正式部署需接入持久化数据库。</div> : null}
      {record.camera_profile_is_demo ? <div className="notice error" role="alert">未标定相机，毫米值仅供参考。</div> : null}
      <article className="paper-record">
        <header><div><p>{record.monitor_point_name} · {record.structure_name} · {record.scene_type}</p><h2>墙体裂缝巡查复测记录</h2></div><span>记录编号：{record.id}</span></header>
        {record.capture_mode === "baseline" ? (
          <section className="record-opening"><span>几何测量</span><strong>基线已建立</strong><small>本条记录用于建立该监测点的复测基线，不代表一次测得的变化。</small></section>
        ) : (
          <section className="record-opening"><span>几何测量 · 较基线累计</span><strong>{cumulativeText}</strong><small>较上次 {perPeriodText} · 确定性视觉几何</small></section>
        )}
        <section className="record-summary"><h3>自动形成的巡查文字</h3><p>{record.record_text ?? "本次未形成记录文字。"}</p></section>
        <dl className="record-grid">
          <div><dt>监测时间</dt><dd>{new Date(record.capture_time).toLocaleString("zh-CN", { hour12: false })}</dd></div>
          <div><dt>记录人</dt><dd>{record.observer_name ?? "—"}</dd></div>
          <div><dt>监测对象</dt><dd>{record.monitor_point_name}</dd></div>
          <div><dt>裂缝编号</dt><dd>{record.crack_id}</dd></div>
          <div><dt>位置描述</dt><dd>{record.location_description}</dd></div>
          <div><dt>数据性质</dt><dd>{isDemoRecord ? "公开场景复原 / 受控仿真" : "用户点位现场采集 / 几何复测"}</dd></div>
          <div><dt>质量状态</dt><dd>{record.status === "confirmed" ? "通过 · 已确认" : record.status}</dd></div>
          <div><dt>人工确认</dt><dd>{record.human_confirmed ? "已确认" : "未确认"}</dd></div>
          <div className="wide"><dt>备注</dt><dd>{record.remark || "无"}</dd></div>
        </dl>

        <section className="record-ai"><div><h3>AI 观察的人工处置</h3><p>模型：{record.ai_review?.model ?? "本次未完成 AI 复核"}</p></div>
          {confirmedItems.length > 0 ? <ul>{confirmedItems.map((item) => <li key={item.id}><span>已确认写入</span>{item.edited_evidence ?? item.evidence}</li>)}</ul> : <p className="muted">没有 AI 条目被人工采纳，正式记录中不写入模型原始输出。</p>}
          {rejectedItems.length > 0 ? <details><summary>{rejectedItems.length} 条未采纳提示（不进入正式记录）</summary><ul>{rejectedItems.map((item) => <li key={item.id}>{item.evidence}</li>)}</ul></details> : null}
        </section>

        <section className="record-evidence"><h3>现场与算法证据</h3><div>{caseBase ? <Evidence src={`${caseBase}/context.jpg`} alt="记录中的现场全景" label="现场全景" /> : null}<Evidence src={record.evidence.original} alt="记录中的本次原始墙体照片" label="本次近景" /><Evidence src={record.evidence.rectified} alt="记录中的墙面正视校正图" label="正视校正" /></div></section>
        <p className="record-boundary">AI 观察结果经监测员人工确认。本记录不构成地质灾害风险判断。{isDemoRecord ? "工作故事来自公开报道；图像来自 CC BY 4.0 开放数据；变化为受控仿真。" : "图像由现场监测员上传，毫米结果来自 OpenCV 标靶几何测量。"}</p>
      </article>
      <section className="closing-statement"><span>几何算法负责量，阶跃多模态负责看。</span><strong>正式记录由监测员确认。</strong></section>
    </section>
  );
}
