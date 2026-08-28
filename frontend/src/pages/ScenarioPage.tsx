const PEOPLE_SOURCE = "https://gz.people.com.cn/n2/2026/0522/c361324-41588761.html";
const PLATFORM_SOURCE = "https://movement.gzstv.com/rtf-live/314/";

export default function ScenarioPage() {
  return (
    <section className="page source-page">
      <header className="source-hero">
        <p className="eyebrow">真实场景 · 贵州仁怀</p>
        <h1>自动监测已经存在，人工现场复测仍然每天发生。</h1>
        <p>本页只说明公开报道中的岗位、动作与系统边界；演示数据不是仁怀真实监测记录。</p>
      </header>
      <div className="scenario-grid">
        <article>
          <span className="card-number">01</span>
          <h2>真实的人</h2>
          <p>仁怀茅台镇地灾监测员冯邦华，汛期坚持巡查隐患点。</p>
          <blockquote>“我每天巡查隐患点不低于3次。”</blockquote>
        </article>
        <article>
          <span className="card-number">02</span>
          <h2>真实动作</h2>
          <p className="action-chain">丈量墙缝 <b>→</b> 比对每日数据 <b>→</b> 填写巡查台账</p>
          <p>这是本项目压缩的重复动作，不是虚构的新岗位。</p>
        </article>
        <article>
          <span className="card-number">03</span>
          <h2>为什么还人工</h2>
          <p>当地已有自动化监测设备。设备负责连续感知，基层人员仍需进入现场巡查、核查并记录。</p>
          <p>我们的定位是“人防 + 技防”之间的 measurement layer。</p>
        </article>
      </div>
      <div className="source-links">
        <a href={PEOPLE_SOURCE} target="_blank" rel="noreferrer">人民网贵州，2026-05-22：查看公开报道</a>
        <a href={PLATFORM_SOURCE} target="_blank" rel="noreferrer">贵州“地灾智防”公开定位：查看来源</a>
      </div>
    </section>
  );
}
