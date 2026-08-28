export type Point = {
  hazard_id: string;
  hazard_name: string;
  monitor_point_id: string;
  monitor_point_name: string;
  structure_id: string;
  structure_name: string;
  location_description: string;
  latitude: number;
  longitude: number;
  baseline_mm: number;
  is_demo_location: boolean;
  last_capture_time?: string | null;
  last_distance_mm?: number | null;
  demo_ready?: boolean;
};

export type Evidence = {
  original: string | null;
  undistorted: string | null;
  rectified: string | null;
  rectified_left: string | null;
  rectified_right: string | null;
  overlay: string | null;
};

export type QualityMetrics = {
  marker_ids?: number[];
  marker_count?: number;
  blur_variance?: number;
  clipping_ratio?: number;
  min_marker_edge_px?: number;
  view_angle_deg?: number | null;
  reprojection_rmse_px?: number | null;
};

export type Measurement = Point & {
  id: string;
  capture_time: string;
  observer_name: string | null;
  previous_distance_mm: number | null;
  current_distance_mm: number | null;
  delta_mm: number | null;
  quality_score: number;
  status: string;
  human_confirmed: boolean;
  location_match: boolean | null;
  location_mode: "browser" | "demo" | "unavailable";
  quality_reasons: string[];
  quality_metrics?: QualityMetrics;
  evidence: Evidence;
  previous_evidence?: { rectified: string | null; capture_time: string } | null;
  camera_profile?: { name: string; is_demo_profile: boolean };
  marker_ids?: number[];
  remark?: string | null;
};

export type ModeSummary = {
  count: number;
  median_ms: number;
  p90_ms: number;
  min_ms: number;
  max_ms: number;
};

export type BenchmarkSummary = {
  traditional: ModeSummary | null;
  system: ModeSummary | null;
  time_saved_percent: number | null;
  total_trials: number;
  disclaimer: string;
};
