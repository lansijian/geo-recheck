import type { AIReview, Measurement } from "../../types";
import { OBSERVATION_LABELS, type ShowcaseCase, type ShowcaseStep } from "./showcaseData";

type PhoneFrameProps = {
  activeCase: ShowcaseCase;
  step: ShowcaseStep;
  mode: "showcase" | "live";
  liveBusy: boolean;
  liveMessage: string;
  liveMeasurement: Measurement | null;
  liveReview: AIReview | null;
  decision: "pending" | "accepted" | "rejected";
  recordId: string | null;
  onPrimary: () => void;
  onDecision: (decision: "accepted" | "rejected") => void;
  onOpenRecord: () => void;
};

function CameraView({ src, label, closeup = false }: { src: string; label: string; closeup?: boolean }) {
  return <div className={`phone-camera ${closeup ? "closeup" : ""}`}><img src={src} alt={label} /><span className="phone-reticle" /><div><i>●</i>{label}</div></div>;
}

export default function PhoneFrame({ activeCase, step, mode, liveBusy, liveMessage, liveMeasurement, liveReview, decision, recordId, onPrimary, onDecision, onOpenRecord }: PhoneFrameProps) {
  const liveOpening = liveMeasurement?.opening_delta_mm ?? liveMeasurement?.delta_mm ?? null;
  const opening = mode === "live" && liveMeasurement ? liveOpening : activeCase.openingDeltaMm;
  const qualityPassed = mode === "live" && liveMeasurement ? liveMeasurement.status !== "rejected" : activeCase.qualityPassed;
  const liveFinding = liveReview?.items.find((item) => item.type !== "none") ?? liveReview?.items[0];
  const aiLabel = liveFinding ? OBSERVATION_LABELS[liveFinding.type] ?? liveFinding.type : activeCase.aiLabel;
  const aiEvidence = liveFinding?.evidence ?? activeCase.aiEvidence;
  const modeLabel = mode === "showcase" ? "演示模式 · 本地已验证样例" : "实时模式 · 本机后端 + StepFun";

  return (
    <section className="showcase-phone-column" aria-label="巡查员手机模拟器" data-testid="showcase-phone">
      <div className="phone-mode-label">{modeLabel}</div>
      <div className="phone-frame">
        <div className="phone-hardware"><span /></div>
        <div className="phone-screen">
          <div className="phone-status"><span>19:45</span><b>GeoReCheck</b><span>▮▮▮</span></div>
          <div className="phone-appbar"><span>今日巡查</span><strong>{step.number} / 08</strong></div>

          {step.id === "task" ? <div className="phone-content phone-task"><span className="phone-kicker">今日任务 · 待执行</span><h2>复测这栋房屋的墙体裂缝</h2><dl><div><dt>点位</dt><dd>MP-03</dd></div><div><dt>对象</dt><dd>CRACK-W01</dd></div><div><dt>检查</dt><dd>裂缝 · 水迹 · 表面变化</dd></div></dl><p>{activeCase.location}</p><button onClick={onPrimary}>开始巡查</button></div> : null}

          {step.id === "arrive" ? <div className="phone-content phone-arrive"><div className="mini-map"><span className="map-line" /><i className="map-person">巡</i><b className="map-pin">点位</b></div><span className="phone-kicker">距离监测点 6 m</span><h2>已到达房屋前</h2><p>先观察完整现场，再按顺序拍摄全景和裂缝近景。</p><button onClick={onPrimary}>确认到达</button></div> : null}

          {step.id === "capture_context" ? <div className="phone-content phone-capture"><CameraView src={activeCase.context} label="现场全景取景框" /><h2>先拍一张现场全景</h2><p>保留房屋、挡墙和排水区域。</p><button onClick={onPrimary}>拍摄全景</button></div> : null}

          {step.id === "capture_closeup" ? <div className="phone-content phone-capture"><CameraView src={activeCase.current} label="裂缝近景取景框" closeup /><h2>再拍裂缝近景</h2><p>让裂缝和左右复测贴完整入镜。</p><button onClick={onPrimary}>拍摄近景</button></div> : null}

          {step.id === "processing" ? <div className="phone-content phone-processing"><div className="processing-orbit"><span /><i /></div><span className="phone-kicker">{liveBusy ? "实时处理中" : "本地样例回放"}</span><h2>{liveMessage || "正在处理两条职责链"}</h2><ul><li className="done"><b>✓</b>复测标志识别</li><li className="done"><b>✓</b>拍摄角度校正</li><li className={liveBusy ? "active" : "done"}><b>{liveBusy ? "…" : "✓"}</b>几何相对变化</li><li className={liveBusy ? "pending" : "done"}><b>{liveBusy ? "04" : "✓"}</b>AI 可见变化复核</li></ul><small>{mode === "showcase" ? "演示模式：读取本地已验证样例结果，不调用外部网络。" : "实时模式：请求可能需要 30–90 秒；失败不影响几何结果。"}</small></div> : null}

          {step.id === "result" ? <div className="phone-content phone-result"><span className={`quality-chip ${qualityPassed ? "passed" : "failed"}`}>{qualityPassed ? "图片质量通过" : "图片质量不合格"}</span><div className="phone-opening"><small>裂缝较上次变化</small><strong>{opening == null ? "未输出" : `${opening >= 0 ? "+" : ""}${opening.toFixed(1)} mm`}</strong><span>OpenCV 几何测量</span></div><div className="phone-ai-result"><span>AI 可见变化提示</span><strong>{qualityPassed ? aiLabel : "图片覆盖不足"}</strong><p>{qualityPassed ? aiEvidence : activeCase.aiEvidence}</p></div><div className="result-source"><span>毫米值：几何</span><span>可见变化：AI</span></div><button onClick={onPrimary}>{qualityPassed ? "进入人工确认" : "查看拒绝原因"}</button></div> : null}

          {step.id === "confirm" ? <div className="phone-content phone-confirm"><span className="phone-kicker">需要监测员确认</span><h2>{qualityPassed ? aiLabel : "本次不能形成毫米结果"}</h2><div className="confirm-evidence"><img src={activeCase.current} alt="待人工确认的本次近景" /><p>{qualityPassed ? aiEvidence : activeCase.aiEvidence}</p></div>{qualityPassed ? <div className="phone-decision"><button className={decision === "accepted" ? "selected" : ""} onClick={() => onDecision("accepted")}>确认可见</button><button className={decision === "rejected" ? "selected" : ""} onClick={() => onDecision("rejected")}>不采纳</button></div> : null}<label>现场备注<input defaultValue={qualityPassed ? "已核对现场与影像" : "需重新拍摄清晰近景"} /></label><button className="primary-action" onClick={onPrimary}>{qualityPassed ? "确认并生成记录" : "保存失败原因"}</button></div> : null}

          {step.id === "record" ? <div className="phone-content phone-record"><div className={`record-check ${qualityPassed ? "" : "rejected"}`}>{qualityPassed ? "✓" : "!"}</div><span className="phone-kicker">{qualityPassed ? "记录已生成" : "失败证据已留存"}</span><h2>{recordId ?? activeCase.recordCode}</h2><dl><div><dt>裂缝变化</dt><dd>{opening == null ? "未输出" : `${opening >= 0 ? "+" : ""}${opening.toFixed(1)} mm`}</dd></div><div><dt>人工结论</dt><dd>{qualityPassed ? (decision === "rejected" ? "AI 提示未采纳" : `${aiLabel} · 已确认`) : "质量不合格 · 重新拍摄"}</dd></div><div><dt>影像证据</dt><dd>全景 / 近景 / 校正图</dd></div></dl><p>{qualityPassed ? "几何结果、图像证据与人工确认已进入同一条记录。" : "系统没有编造毫米数，保留失败原因供后续复核。"}</p><button onClick={onOpenRecord}>{mode === "live" && recordId && qualityPassed ? "查看正式记录" : "重新演示"}</button></div> : null}
        </div>
      </div>
      <p className="phone-disclaimer">{mode === "showcase" ? "明确标注的本地样例回放" : "真实调用状态以接口返回为准"}</p>
    </section>
  );
}
