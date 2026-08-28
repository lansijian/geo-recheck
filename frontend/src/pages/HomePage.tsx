import { Link } from "react-router-dom";

const PEOPLE_SOURCE = "https://gz.people.com.cn/n2/2026/0522/c361324-41588761.html";
const CALLOUTS = [
  { id: "01", label: "裂缝复测点", left: "34%", top: "51%" },
  { id: "02", label: "墙面 / 挡墙观察", left: "62%", top: "36%" },
  { id: "03", label: "排水 / 渗水观察", left: "72%", top: "76%" },
];

export default function HomePage() {
  return (
    <section className="page story-home">
      <div className="field-hero">
        <div className="story-copy">
          <p className="eyebrow">贵州仁怀 · 真实基层工作</p>
          <h1>每天至少巡查 3 次，现场不只要量这一条缝。</h1>
          <p className="story-lead">监测员冯邦华要丈量墙缝、比对每日数据、看现场变化，再填写巡查台账。</p>
          <ul className="worker-actions" aria-label="基层监测员现场动作">
            <li>丈量墙缝</li><li>比数据</li><li>看现场</li><li>填台账</li>
          </ul>
          <p className="core-sentence"><b>几何算法负责“量”</b><b>阶跃多模态负责“看”</b><b>监测员负责“确认”</b></p>
          <div className="hero-actions">
            <Link className="button primary large" to="/showcase">开始 60 秒现场巡查</Link>
            <Link className="text-link" to="/capture?demo=1&case=case_03_seepage">直接进入技术操作页</Link>
          </div>
          <p className="source-caption">工作事实：<a href={PEOPLE_SOURCE} target="_blank" rel="noreferrer">人民网贵州 2026-05-22 公开报道</a></p>
        </div>
        <figure className="site-overview">
          <img src="/scene-library/site_overview_cc0.jpg" alt="公开 CC0 数据中的完整建筑立面现场图" />
          {CALLOUTS.map((item) => <span className="site-callout" key={item.id} style={{ left: item.left, top: item.top }}><b>{item.id}</b>{item.label}</span>)}
          <figcaption>建筑立面现场上下文 · Pixnio CC0</figcaption>
        </figure>
      </div>

      <section className="field-reality">
        <div><p className="eyebrow">一个小而真实的辅助动作</p><h2>从“全景”走到“近景”，再回到人工记录。</h2></div>
        <p>一线监测不是只量这一条缝，他还要看现场有没有新的可见变化。V0.4 只覆盖墙体裂缝与可见墙面变化，不扩张为风险研判平台。</p>
      </section>

      <ol className="v04-flow" aria-label="一分钟巡查流程">
        <li><span>01</span><strong>现场全景</strong><small>定位观察区域</small></li>
        <li><span>02</span><strong>上次 vs 本次</strong><small>近景几何复测</small></li>
        <li><span>03</span><strong>AI 现场复核</strong><small>补充可见变化</small></li>
        <li><span>04</span><strong>人工确认</strong><small>接受、编辑或删除</small></li>
        <li><span>05</span><strong>巡查记录</strong><small>只写入确认项</small></li>
      </ol>

      <p className="provenance-note">真实工作故事来自公开报道；首屏建筑立面图来自 Pixnio CC0，案例图来自 CC BY 4.0 开放数据；裂缝位移与水迹为受控场景仿真，非真实贵州事故或监测记录。</p>
    </section>
  );
}
