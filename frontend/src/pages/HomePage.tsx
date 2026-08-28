import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getPoints } from "../api/client";
import type { Point } from "../types";

function formatTime(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "暂无记录";
}

export default function HomePage() {
  const [points, setPoints] = useState<Point[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getPoints()
      .then((items) => {
        if (active) setPoints(items);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "点位加载失败");
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="page page-home">
      <div className="page-heading">
        <div>
          <p className="eyebrow">2026-08-28 · 演示任务</p>
          <h1>今日复测</h1>
          <p>固定视觉标靶复拍、毫米级相对位移比较与巡查记录留痕。</p>
        </div>
        <div className="demo-location-flag">演示位置数据</div>
      </div>

      <section className="golden-entry" aria-label="演示入口">
        <div>
          <span className="eyebrow">比赛 Golden Path</span>
          <h2>一键完成标靶识别与 +5 mm 复测</h2>
          <p>自动加载内置照片、调用真实测量 API，并进入可刷新的结果页。</p>
        </div>
        <Link className="button primary large" to="/capture?demo=1">一键演示：+5 mm / 20°</Link>
      </section>

      {error ? <div className="notice error" role="alert">{error}</div> : null}
      <div className="point-list" aria-live="polite">
        {points.map((point) => (
          <article className="point-row" key={point.monitor_point_id}>
            <div className="point-status" aria-hidden="true"><span /></div>
            <div className="point-main">
              <span className="muted">{point.hazard_id}</span>
              <h2>{point.monitor_point_id === "MP-03" ? "遵义桐梓 · 挡墙裂缝" : point.hazard_name}</h2>
              <p>{point.monitor_point_id} · {point.structure_name}</p>
            </div>
            <dl className="point-meta">
              <div><dt>上次复测</dt><dd>{formatTime(point.last_capture_time)}</dd></div>
              <div><dt>上一期数值</dt><dd>{point.last_distance_mm?.toFixed(1) ?? "—"} mm</dd></div>
            </dl>
            {point.demo_ready ? (
              <div className="point-actions">
                <span className="ready-label">可复测</span>
                <Link className="button" to="/capture">开始复测</Link>
              </div>
            ) : (
              <span className="muted">仅登记 · 暂无标靶样本</span>
            )}
          </article>
        ))}
        {points.length === 0 && !error ? <div className="empty">正在读取本地点位…</div> : null}
      </div>

      <aside className="scope-note">
        <strong>工作边界</strong>
        <p>Marker ID 是点位主身份；GPS 只做二次校验。出现模糊、遮挡、角度过大或历史突变时，系统拒绝给出可确认的毫米结果。</p>
      </aside>
    </section>
  );
}
