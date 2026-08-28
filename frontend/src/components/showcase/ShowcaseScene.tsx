import type { CSSProperties } from "react";
import type { ShowcaseCase, ShowcaseStep } from "./showcaseData";

export default function ShowcaseScene({ activeCase, stepIndex, step }: { activeCase: ShowcaseCase; stepIndex: number; step: ShowcaseStep }) {
  const sceneProgress = Math.min(1, stepIndex / 5);
  return (
    <section className="showcase-scene" aria-label="基层巡查现场可视化" data-testid="showcase-scene">
      <header>
        <div><span>现场视角</span><strong>{step.sceneTitle}</strong></div>
        <small>2.5D 场景编排 · 非真实贵州现场影像</small>
      </header>
      <div className={`scene-stage scene-step-${step.id}`} style={{ "--scene-progress": sceneProgress } as CSSProperties}>
        <img src={activeCase.context} alt="公开场景构成的房屋巡查现场" />
        <div className="scene-shade" />
        <svg className="walk-path" viewBox="0 0 600 380" aria-hidden="true">
          <path d="M72 333 C145 310 176 269 253 244 S383 196 455 124" />
        </svg>
        <div className="field-worker" aria-label="巡查员沿路径接近监测点"><span /><i /><b>巡查员</b></div>
        <div className="scene-target"><span /><strong>CRACK-W01</strong><small>墙体裂缝复测点</small></div>
        <div className="scene-context-callout"><span>现场上下文</span><strong>房屋 · 挡墙 · 排水区域</strong></div>
        <div className="scene-camera-reticle" aria-hidden="true"><i /><i /><i /><i /></div>
        <div className="scene-caption"><span>{step.number}</span><div><strong>{step.label}</strong><small>{activeCase.shortLabel}</small></div></div>
      </div>
      <footer className="scene-role-strip">
        <span><b>量</b> OpenCV 几何</span><span><b>看</b> StepFun 可见变化</span><span><b>确认</b> 监测员</span><span><b>留痕</b> GeoReCheck</span>
      </footer>
    </section>
  );
}
