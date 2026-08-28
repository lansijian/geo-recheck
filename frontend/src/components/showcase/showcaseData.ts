export type ShowcaseStepId =
  | "task"
  | "arrive"
  | "capture_context"
  | "capture_closeup"
  | "processing"
  | "result"
  | "confirm"
  | "record";

export type ShowcaseCase = {
  id: "case_03_seepage" | "case_04_spalling" | "case_05_quality_fail";
  shortLabel: string;
  title: string;
  location: string;
  context: string;
  previous: string;
  current: string;
  openingDeltaMm: number | null;
  shearDeltaMm: number | null;
  qualityPassed: boolean;
  aiLabel: string;
  aiEvidence: string;
  recordCode: string;
};

export type ShowcaseStep = {
  id: ShowcaseStepId;
  number: string;
  label: string;
  sceneTitle: string;
  explanation: string;
  durationMs: number;
};

export const SHOWCASE_STEPS: ShowcaseStep[] = [
  { id: "task", number: "01", label: "接到任务", sceneTitle: "今天要复测这栋房屋的墙体裂缝", explanation: "巡查员先确认点位、对象和本次需要检查的内容。", durationMs: 5500 },
  { id: "arrive", number: "02", label: "到达现场", sceneTitle: "沿巡查路径走到房屋前", explanation: "先看完整现场，不从一张裁剪后的裂缝图开始。", durationMs: 6500 },
  { id: "capture_context", number: "03", label: "拍摄全景", sceneTitle: "保留房屋、挡墙和排水区域的上下文", explanation: "全景用于说明裂缝在哪里，以及周围还有哪些可见变化。", durationMs: 6500 },
  { id: "capture_closeup", number: "04", label: "拍摄近景", sceneTitle: "换一个机位拍摄裂缝与左右复测贴", explanation: "近景进入几何测量；不同拍摄角度由复测贴和透视校正处理。", durationMs: 7000 },
  { id: "processing", number: "05", label: "自动处理", sceneTitle: "几何测量与可见变化复核并行完成", explanation: "OpenCV 只负责毫米变化；StepFun 只补充肉眼可见现象。", durationMs: 9500 },
  { id: "result", number: "06", label: "查看结果", sceneTitle: "先看几何数值，再看 AI 提示", explanation: "两条职责链分开展示，AI 不估算也不修改毫米值。", durationMs: 7500 },
  { id: "confirm", number: "07", label: "人工确认", sceneTitle: "监测员决定哪些观察可以写入记录", explanation: "AI 提示默认待确认，可以接受、不采纳或编辑。", durationMs: 7500 },
  { id: "record", number: "08", label: "自动留痕", sceneTitle: "图像、测量和人工结论进入同一条记录", explanation: "正式记录只包含几何结果和人工采纳内容。", durationMs: 0 },
];

export const SHOWCASE_CASES: ShowcaseCase[] = [
  {
    id: "case_03_seepage",
    shortLabel: "裂缝 + 渗水",
    title: "墙体裂缝复测 + 疑似新增水迹",
    location: "贵州仁怀 · MP-03 · WALL-02",
    context: "/demo-cases/case_03_seepage/context.jpg",
    previous: "/demo-cases/case_03_seepage/previous_close.jpg",
    current: "/demo-cases/case_03_seepage/current_close.jpg",
    openingDeltaMm: 4.8,
    shearDeltaMm: 0.9,
    qualityPassed: true,
    aiLabel: "疑似新增水迹",
    aiEvidence: "裂缝右下侧出现新增颜色加深区域，需由监测员现场确认。",
    recordCode: "SHOW-20260828-003",
  },
  {
    id: "case_04_spalling",
    shortLabel: "裂缝 + 剥落",
    title: "小位移 + 局部表面剥落",
    location: "贵州仁怀 · MP-03 · WALL-02",
    context: "/demo-cases/case_04_spalling/context.jpg",
    previous: "/demo-cases/case_04_spalling/previous_close.jpg",
    current: "/demo-cases/case_04_spalling/current_close.jpg",
    openingDeltaMm: 1.2,
    shearDeltaMm: 0,
    qualityPassed: true,
    aiLabel: "疑似局部剥落",
    aiEvidence: "裂缝右侧表面出现新增粗糙缺损区域，需由监测员现场确认。",
    recordCode: "SHOW-20260828-004",
  },
  {
    id: "case_05_quality_fail",
    shortLabel: "图像质量失败",
    title: "照片模糊，无法可靠复核",
    location: "贵州仁怀 · MP-03 · WALL-02",
    context: "/demo-cases/case_05_quality_fail/context.jpg",
    previous: "/demo-cases/case_05_quality_fail/previous_close.jpg",
    current: "/demo-cases/case_05_quality_fail/current_close.jpg",
    openingDeltaMm: null,
    shearDeltaMm: null,
    qualityPassed: false,
    aiLabel: "图片覆盖不足",
    aiEvidence: "复测贴与裂缝边缘过度模糊，系统拒绝输出毫米值并要求重新拍摄。",
    recordCode: "SHOW-20260828-005-REJECTED",
  },
];

export const OBSERVATION_LABELS: Record<string, string> = {
  new_crack: "疑似新裂缝",
  crack_extension: "既有裂缝可见延伸",
  seepage_or_water_stain: "疑似新增水迹",
  spalling_or_peeling: "疑似局部剥落",
  wall_surface_change: "墙面可见变化",
  marker_damage: "复测标志状态变化",
  coverage_missing: "图片覆盖不足",
  other_visible_change: "其他可见变化",
  none: "未见明确新增变化",
};
