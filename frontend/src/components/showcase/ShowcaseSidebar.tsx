import { SHOWCASE_STEPS, type ShowcaseStep } from "./showcaseData";

export default function ShowcaseSidebar({ stepIndex, step }: { stepIndex: number; step: ShowcaseStep }) {
  return (
    <aside className="showcase-sidebar" aria-label="当前演示步骤说明" data-testid="showcase-sidebar">
      <header><span>给评委看的解释层</span><h2>现在系统在做什么？</h2></header>
      <ol className="showcase-timeline">
        {SHOWCASE_STEPS.map((item, index) => <li className={index === stepIndex ? "active" : index < stepIndex ? "done" : ""} key={item.id}><span>{index < stepIndex ? "✓" : item.number}</span><strong>{item.label}</strong></li>)}
      </ol>
      <section className="current-explanation"><span>当前步骤 · {step.number}</span><h3>{step.sceneTitle}</h3><p>{step.explanation}</p></section>
      <section className="role-boundary"><h3>四个角色，各守边界</h3><div><b>几何</b><span>量相对变化</span></div><div><b>AI</b><span>看可见现象</span></div><div><b>人工</b><span>确认是否采纳</span></div><div><b>系统</b><span>保存完整证据</span></div></section>
      <section className="job-value"><h3>这个岗位为什么需要它？</h3><p>它补充基层巡查最后一公里，减少来回翻照片、口头描述和手写整理，让裂缝变化、图像证据与人工结论留在同一条记录里。</p></section>
      <section className="showcase-boundary"><strong>能力边界</strong><span>不判断灾害风险</span><span>不自动预警</span><span>不替代专业设备</span><span>不代替人工决策</span></section>
    </aside>
  );
}
