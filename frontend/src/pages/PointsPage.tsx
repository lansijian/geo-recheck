import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getPoints } from "../api/client";
import type { Point } from "../types";

const BASELINE_LABELS: Record<Point["baseline_status"], string> = {
  missing: "未建档",
  confirmed: "已建档",
};

export default function PointsPage() {
  const [points, setPoints] = useState<Point[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getPoints()
      .then((items) => { if (active) setPoints(items); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "监测点列表加载失败。"); });
    return () => { active = false; };
  }, []);

  return (
    <section className="page points-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">用户自建监测点</p>
          <h1>裂缝管理</h1>
          <p>为每条墙缝建立带标靶的监测点，采集基线后即可开始复测。</p>
        </div>
        <Link className="button primary" to="/points/new">新建监测点</Link>
      </div>

      {error ? <div className="notice error" role="alert">{error}</div> : null}

      {points === null && !error ? <div className="empty">正在加载监测点列表…</div> : null}
      {points !== null && points.length === 0 ? <div className="empty">还没有监测点，点击“新建监测点”开始。</div> : null}

      {points && points.length > 0 ? (
        <ul className="point-list" aria-label="监测点列表">
          {points.map((point) => (
            <li className="point-row" data-testid="point-row" key={point.monitor_point_id}>
              <Link to={`/points/${point.monitor_point_id}`}>
                <div className="point-row-main">
                  <strong>{point.monitor_point_id}</strong>
                  <span>{point.monitor_point_name}</span>
                </div>
                <div className="point-row-meta">
                  <span>{point.structure_name}</span>
                  <span className={`baseline-badge ${point.baseline_status}`}>{BASELINE_LABELS[point.baseline_status]}</span>
                  <span className="point-row-change">
                    {point.last_confirmed_opening_since_baseline_mm != null
                      ? `较基线累计 ${point.last_confirmed_opening_since_baseline_mm >= 0 ? "+" : ""}${point.last_confirmed_opening_since_baseline_mm.toFixed(1)} mm`
                      : "尚无已确认记录"}
                  </span>
                  {point.last_confirmed_opening_since_baseline_mm != null && point.last_confirmed_camera_profile_is_demo ? (
                    <span className="notice error compact" role="alert">未标定相机，毫米值仅供参考。</span>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
