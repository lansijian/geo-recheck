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
  homography_rmse_mm?: number | null;
  homography_spread_mm?: number | null;
  planar_position_mm?: number[] | null;
  dual_pnp_position_mm?: number[] | null;
  legacy_board_center_distance_mm?: number | null;
  processing_ms?: number | null;
};

export type Measurement = Point & {
  id: string;
  capture_time: string;
  observer_name: string | null;
  previous_distance_mm: number | null;
  current_distance_mm: number | null;
  delta_mm: number | null;
  crack_id: string;
  scene_type: string;
  baseline_crack_width_mm: number | null;
  opening_delta_mm: number | null;
  shear_delta_mm: number | null;
  out_of_plane_delta_mm: number | null;
  measurement_mode: string;
  detector_type: string;
  data_provenance: {
    story: string;
    story_source: string;
    wall_dataset: string;
    wall_source: string;
    license: string;
    deformation: string;
    is_real_guizhou_monitoring_data: boolean;
  };
  quality_score: number;
  status: string;
  human_confirmed: boolean;
  location_match: boolean | null;
  location_mode: "browser" | "demo" | "unavailable";
  quality_reasons: string[];
  quality_metrics?: QualityMetrics;
  evidence: Evidence;
  previous_evidence?: { original: string | null; rectified: string | null; capture_time: string } | null;
  camera_profile?: { name: string; is_demo_profile: boolean };
  marker_ids?: number[];
  remark?: string | null;
  demo_case_id?: string | null;
  ai_review?: AIReview | null;
  record_text?: string;
};

export type AIObservationType =
  | "new_crack"
  | "crack_extension"
  | "seepage_or_water_stain"
  | "spalling_or_peeling"
  | "wall_surface_change"
  | "marker_damage"
  | "coverage_missing"
  | "other_visible_change"
  | "none";

export type AIReviewItem = {
  id: number;
  type: AIObservationType;
  state: "new" | "worsened" | "stable" | "uncertain" | "not_visible";
  evidence: string;
  confidence: "high" | "medium" | "low";
  requires_human_check: true;
  human_status: "pending" | "accepted" | "rejected" | "edited";
  edited_evidence: string | null;
};

export type AIReview = {
  id: string;
  inspection_id: string;
  provider: "stepfun";
  model: string;
  status: "running" | "completed" | "failed";
  created_at: string;
  latency_ms: number | null;
  attempts: number;
  error_code: string | null;
  error_message: string | null;
  items: AIReviewItem[];
  parsed?: {
    scene_consistency: "same_location" | "likely_same" | "uncertain";
    coverage_complete: boolean | null;
    missing_views: string[];
    record_draft: string;
    disclaimer: string;
  } | null;
};

export type AIStatus = {
  enabled: boolean;
  provider: "stepfun";
  model: string;
  configured: boolean;
};

export type DemoCase = {
  case_id: string;
  title: string;
  expected_geometry: { opening_delta_mm: number; gate: "accepted" | "rejected" };
  expected_ai_observations: AIObservationType[];
  context_callouts: { id: string; label: string; x: number; y: number }[];
  disclosure: string;
  assets: { context: string; previous_close: string; current_close: string };
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
