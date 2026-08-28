const PMC_SOURCE = "https://isprs-archives.copernicus.org/articles/XLVI-5-W1-2022/245/2022/";
const STANDARD_SOURCE = "https://xxgk.mot.gov.cn/jigou/glj/202006/P020240521540719369352.pdf";
const DATASET_SOURCE = "https://data.mendeley.com/datasets/jwsn7tfbrp/1";

export default function TechnologyPage() {
  return (
    <section className="page source-page">
      <header className="source-hero compact-source">
        <p className="eyebrow">技术依据 · 主动说明已有方法</p>
        <h1>我们没有发明摄影测量，只把它放进基层复测工作流。</h1>
      </header>
      <div className="technology-layers">
        <article>
          <span>已有工程方法</span>
          <h2>裂缝两侧观测标志 + 近景摄影测量</h2>
          <p>JTG/T 3660—2020 可作为工程裂缝监测方法旁证，不等同于贵州地灾基层专门规范。</p>
        </article>
        <article>
          <span>我们的核心</span>
          <h2>身份、正视化、相对变形、质量门控、自动留痕</h2>
          <p>左贴建立墙面毫米坐标，比较右贴相对位置，分别输出张开与剪切变化；不把板中心绝对距离冒充裂缝宽度。</p>
        </article>
        <article>
          <span>可选 AI</span>
          <h2>只辅助看见裂缝，不参与毫米值</h2>
          <p>当前默认关闭。毫米结果和质量门控均由确定性几何算法产生，AI 不参与风险判断。</p>
        </article>
      </div>
      <section className="position-table" aria-label="现有方案与本项目定位">
        <h2>不是替代，而是补上人工巡查最后一公里</h2>
        <div className="comparison-row comparison-head"><span>方案</span><span>已有价值</span><span>我们补的位置</span></div>
        <div className="comparison-row"><strong>卷尺 / 拉线 + 台账</strong><span>便宜、熟悉、能看完整现场</span><span>把量、比、记压缩成一次拍照和一次确认</span></div>
        <div className="comparison-row"><strong>GNSS / 裂缝计 / 雨量计</strong><span>连续、专业、全天候</span><span>不替代设备，只服务人工现地复测</span></div>
        <div className="comparison-row"><strong>地灾智防 / 业务平台</strong><span>任务、数据、上报全过程管理</span><span>把现实墙缝先“测成数据”，未来作为插件接入</span></div>
      </section>
      <div className="source-links">
        <a href={PMC_SOURCE} target="_blank" rel="noreferrer">ISPRS 2022 PhotoMicrometer Contrast 类似研究</a>
        <a href={STANDARD_SOURCE} target="_blank" rel="noreferrer">交通运输部 JTG/T 3660—2020 官方 PDF</a>
        <a href={DATASET_SOURCE} target="_blank" rel="noreferrer">Özgenel 建筑混凝土裂缝数据集 · CC BY 4.0</a>
      </div>
      <p className="provenance-note">真实工作人员故事来自贵州公开报道；墙体图片来自公开数据；毫米位移为受控仿真，不是真实贵州监测数据。</p>
    </section>
  );
}
