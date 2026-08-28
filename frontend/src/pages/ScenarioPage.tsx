const PEOPLE_SOURCE = "https://gz.people.com.cn/n2/2026/0522/c361324-41588761.html";
const CHECKLIST_SOURCE = "https://www.sohu.com/a/694943081_121106902";

const CHECKS = [
  ["裂", "墙缝", "裂缝宽度、深度与延伸", true],
  ["水", "挡墙渗水", "开裂、渗水、渗砂泥与错落", true],
  ["泉", "地下水", "水量、浑浊度、颜色与渗出形态", false],
  ["木", "树木倾斜", "倾斜度与倾斜方向", false],
  ["坡", "坡面变化", "水田、果园、菜地与水渠错落", false],
  ["石", "松散物", "流失、冲刷与淘蚀", false],
] as const;

export default function ScenarioPage() {
  return (
    <section className="page source-page">
      <header className="source-hero"><p className="eyebrow">真实巡查范围 · 当前刻意只做一小块</p><h1>基层监测员看的是整个现场，不是一张裂缝裁剪图。</h1><p>贵州公开科普列出多类日常目视监测内容。V0.4 只高亮“墙体裂缝 + 可见墙面变化”，其余明确不在当前产品范围内。</p></header>
      <section className="field-checklist" aria-label="六类现场巡查内容">
        {CHECKS.map(([icon, title, description, active]) => <article className={active ? "active" : "future"} key={title}><span aria-hidden="true">{icon}</span><div><h2>{title}</h2><p>{description}</p><small>{active ? "V0.4 当前覆盖" : "当前不做"}</small></div></article>)}
      </section>
      <section className="scenario-boundary"><div><p className="eyebrow">真实的人与动作</p><h2>冯邦华每天巡查隐患点 ≥3 次</h2><p>丈量墙体裂缝 → 比对每日监测数据 → 查看现场 → 填写巡查台账。</p></div><div><p className="eyebrow">产品边界</p><h2>辅助复测与目视补漏</h2><p>不预测滑坡，不输出风险等级，不建议撤离，不代替专业人员或既有监测设备。</p></div></section>
      <div className="source-links"><a href={PEOPLE_SOURCE} target="_blank" rel="noreferrer">人民网贵州：真实监测员工作事实</a><a href={CHECKLIST_SOURCE} target="_blank" rel="noreferrer">来源｜贵州省自然资源厅：日常监测内容</a></div>
    </section>
  );
}
