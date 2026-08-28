import { PUBLIC_PHASES, type FieldStep, type ShowcaseCase } from "./showcaseData";

export default function ShowcaseSidebar({ step, activeCase, isPlaying }: { step: FieldStep; activeCase: ShowcaseCase; isPlaying: boolean }) {
  const currentIndex = PUBLIC_PHASES.findIndex((phase) => phase.id === step.publicPhase);
  return (
    <aside className="showcase-sidebar" aria-label="本次巡查步骤" data-testid="showcase-sidebar">
      <header><span>FIELD INSPECTION</span><h2>本次巡查</h2><small>{isPlaying ? "自动推进中" : step.id === "human_confirm" ? "等待监测员操作" : "手动控制"}</small></header>
      <ol className="showcase-timeline five-steps">
        {PUBLIC_PHASES.map((phase, index) => <li className={index === currentIndex ? "active" : index < currentIndex ? "done" : ""} key={phase.id}><span>{index < currentIndex ? "✓" : phase.number}</span><strong>{phase.label}</strong></li>)}
      </ol>
      <section className="current-explanation"><span>当前动作 · {step.label}</span><h3>{step.sceneTitle}</h3><p>{step.explanation}</p></section>
      <section className="inspection-facts"><h3>数据链状态</h3><div><b>几何</b><span>本机 FastAPI / OpenCV</span></div><div><b>AI</b><span>StepFun 实测回放 · run {activeCase.ai_replay.source_run}</span></div><div><b>记录</b><span>本机 SQLite 真实写入</span></div><div><b>人工</b><span>确认前绝不自动采纳</span></div></section>
      <section className="job-value"><h3>同一个空间，同一条证据链</h3><p>房屋、挡墙、排水沟和裂缝点存在于同一个 Three.js 场景。手机全景与近景由这个场景的摄像机拍摄，裂缝墙面纹理同时作为几何证据源。</p></section>
      <section className="replay-proof"><strong>AI 实测回放</strong><span>{activeCase.ai_replay.provider}</span><span>{activeCase.ai_replay.model}</span><span>{(activeCase.ai_replay.original_latency_ms / 1000).toFixed(1)} s</span><small>验证日期 {activeCase.ai_replay.validated_date}</small></section>
      <section className="showcase-boundary"><strong>能力边界</strong><span>不判断灾害风险</span><span>不自动预警</span><span>不替代专业设备</span><span>人工决定是否采纳</span></section>
    </aside>
  );
}
