import type { PropsWithChildren } from "react";
import { NavLink } from "react-router-dom";

export default function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink className="brand" to="/" aria-label="返回地灾复测首页">
          <span className="brand-mark" aria-hidden="true">复</span>
          <span>
            <strong>地灾复测</strong>
            <small>几何测量 · AI 现场复核 · 人工确认</small>
          </span>
        </NavLink>
        <nav aria-label="主导航">
          <NavLink to="/showcase">现场演示</NavLink>
          <NavLink to="/points">监测点</NavLink>
          <NavLink to="/capture">开始复测</NavLink>
          <details className="settings-menu">
            <summary>技术与设置</summary>
            <div>
              <NavLink to="/scenario">应用场景</NavLink>
              <NavLink to="/technology">技术依据</NavLink>
              <NavLink to="/capture?demo=1&case=case_03_seepage">图片演示</NavLink>
              <NavLink to="/benchmark">用时对比</NavLink>
              <NavLink to="/calibration">相机标定</NavLink>
            </div>
          </details>
        </nav>
      </header>
      <main>{children}</main>
      <footer>
        <span>本系统辅助重复测量与留痕，不预测滑坡，不替代人工巡查或专业监测设备。</span>
        <span>V0.6 · Field Inspector Simulator / 现场复测工作台</span>
      </footer>
    </div>
  );
}
