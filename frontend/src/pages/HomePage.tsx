import { Link } from "react-router-dom";

const PEOPLE_SOURCE = "https://gz.people.com.cn/n2/2026/0522/c361324-41588761.html";

export default function HomePage() {
  return (
    <section className="page story-home">
      <div className="story-hero">
        <div className="story-copy">
          <p className="eyebrow">真实场景 · 贵州仁怀 · 2026-05-22</p>
          <h1>每天至少巡查 3 次，<br />他仍要拿尺复测这条墙缝。</h1>
          <p className="story-lead">仁怀茅台镇地灾监测员冯邦华，现场丈量墙体裂缝、比对每日数据，再填写巡查台账。</p>
          <blockquote>“我每天巡查隐患点不低于3次。”</blockquote>
          <div className="hero-actions">
            <Link className="button primary large" to="/capture?demo=1">一分钟演示：复测这条墙缝</Link>
            <Link className="text-link" to="/scenario">为什么自动设备仍不能替代这一步</Link>
          </div>
          <p className="source-caption">场景依据：<a href={PEOPLE_SOURCE} target="_blank" rel="noreferrer">人民网贵州 2026-05-22 公开报道</a></p>
        </div>
        <aside className="field-card" aria-label="真实巡查工作卡">
          <div className="field-card-head"><span>公开工作场景复原</span><b>仁怀 · 茅台镇</b></div>
          <div className="monitor-person" aria-hidden="true"><span>冯</span><i /></div>
          <h2>基层地灾监测员</h2>
          <p>工具 + 检测记录册<br />进入隐患点现场复测</p>
          <div className="frequency"><strong>≥ 3</strong><span>次 / 日<br />汛期巡查</span></div>
          <small>不使用新闻人物肖像，仅引用公开姓名与工作事实</small>
        </aside>
      </div>

      <section className="workflow-section">
        <div>
          <p className="eyebrow">现在的真实动作</p>
          <h2>量一次、比一次、记一次</h2>
        </div>
        <ol className="manual-flow">
          <li><span>01</span><strong>拿尺量</strong></li>
          <li><span>02</span><strong>翻历史</strong></li>
          <li><span>03</span><strong>计算变化</strong></li>
          <li><span>04</span><strong>拍照留痕</strong></li>
          <li><span>05</span><strong>填写记录</strong></li>
        </ol>
      </section>

      <section className="human-tech-note">
        <div><span className="signal-dot" /><strong>当地已经有自动化监测设备</strong></div>
        <p>自动设备负责连续感知；人工现场复测仍然每天进行。我们不再造一个管理平台，只补“现实墙缝 → 数字变化 → 人工确认 → 既有系统”这一层。</p>
      </section>

      <section className="promise-strip">
        <p>不是预测山什么时候塌。</p>
        <strong>只是把量一次、比一次、记一次，变成拍一次、确认一次。</strong>
      </section>

      <p className="provenance-note">演示墙面来自 CC BY 4.0 公开建筑裂缝数据；位移为受控仿真；根据公开工作场景复原，非真实监测记录。</p>
    </section>
  );
}
