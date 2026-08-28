import type { PropsWithChildren } from "react";
import { NavLink } from "react-router-dom";

export default function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink className="brand" to="/" aria-label="返回今日复测">
          <span className="brand-mark" aria-hidden="true">复</span>
          <span>
            <strong>地灾复测</strong>
            <small>基层地灾视觉复测与自动留痕系统</small>
          </span>
        </NavLink>
        <nav aria-label="主导航">
          <NavLink to="/">今日复测</NavLink>
          <NavLink to="/benchmark">用时对比</NavLink>
          <NavLink to="/calibration">相机标定</NavLink>
        </nav>
      </header>
      <main>{children}</main>
      <footer>
        <span>本系统辅助重复测量与留痕，不预测滑坡，不替代人工巡查或专业监测设备。</span>
        <span>V0.2 · 浏览器闭环</span>
      </footer>
    </div>
  );
}
