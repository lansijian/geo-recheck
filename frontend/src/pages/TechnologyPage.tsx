const STEP_SOURCE = "https://platform.stepfun.com/docs/zh/guides/developer/image-chat";
const STANDARD_SOURCE = "https://xxgk.mot.gov.cn/jigou/glj/202006/P020240521540719369352.pdf";
const DATASET_SOURCE = "https://data.mendeley.com/datasets/hxrry6krs7/1";

export default function TechnologyPage() {
  return (
    <section className="page source-page">
      <header className="source-hero"><p className="eyebrow">V0.4 技术分工</p><h1>一个系统里，两种能力各守边界。</h1><p>确定性几何回答“变化了多少”；多模态模型补充“还有什么肉眼可见变化”；人工决定哪些内容进入巡查记录。</p></header>
      <div className="technology-layers v04-layers">
        <article><span>01 · 量</span><h2>OpenCV 几何测量</h2><p>AprilTag 身份、墙面正视化、相对张开与剪切、质量门控、证据图。毫米值只由这里产生。</p></article>
        <article><span>02 · 看</span><h2>StepFun 多模态复核</h2><p>按明确顺序比较现场全景、上次近景、本次近景；只描述有图像证据的水迹、剥落、覆盖和标志状态。</p></article>
        <article><span>03 · 确认</span><h2>监测员逐条处置</h2><p>每条 AI 观察默认为 pending；接受、拒绝或编辑后，只有确认项才能进入正式记录。</p></article>
      </div>
      <section className="architecture-flow" aria-label="V0.4 数据流"><div>现场三图</div><span>→</span><div><b>几何 CV</b><small>+4.8 mm</small></div><div><b>StepFun VLM</b><small>可见变化</small></div><span>→</span><div><b>人工复核</b><small>接受 / 拒绝</small></div><span>→</span><div>巡查记录</div></section>
      <section className="position-table"><h2>失败隔离与禁止事项</h2><div className="comparison-row comparison-head"><span>层</span><span>可以做</span><span>不能做</span></div><div className="comparison-row"><strong>几何</strong><span>输出相对张开、剪切与质量状态</span><span>质量不合格时不得输出可确认毫米值</span></div><div className="comparison-row"><strong>AI</strong><span>辅助比较可见现象，失败可重试</span><span>不得估算毫米、判断安全、风险或行动</span></div><div className="comparison-row"><strong>人工</strong><span>确认、拒绝或编辑观察项</span><span>未确认模型文本不进入正式记录</span></div></section>
      <div className="source-links"><a href={STEP_SOURCE} target="_blank" rel="noreferrer">阶跃星辰官方图片理解文档</a><a href={STANDARD_SOURCE} target="_blank" rel="noreferrer">交通运输部 JTG/T 3660—2020</a><a href={DATASET_SOURCE} target="_blank" rel="noreferrer">真实墙体场景数据 · CC BY 4.0</a></div>
    </section>
  );
}
