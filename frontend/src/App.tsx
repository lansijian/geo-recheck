import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./components/AppShell";
import BenchmarkPage from "./pages/BenchmarkPage";
import CalibrationPage from "./pages/CalibrationPage";
import CapturePage from "./pages/CapturePage";
import HomePage from "./pages/HomePage";
import PointDetailPage from "./pages/PointDetailPage";
import PointFormPage from "./pages/PointFormPage";
import PointsPage from "./pages/PointsPage";
import RecordPage from "./pages/RecordPage";
import ResultPage from "./pages/ResultPage";
import ScenarioPage from "./pages/ScenarioPage";
const ShowcasePage = lazy(() => import("./pages/ShowcasePage"));
import TechnologyPage from "./pages/TechnologyPage";

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/capture" element={<CapturePage />} />
        <Route path="/showcase" element={<Suspense fallback={<section className="page"><div className="empty">正在载入三维现场…</div></section>}><ShowcasePage /></Suspense>} />
        <Route path="/result/:id" element={<ResultPage />} />
        <Route path="/result" element={<ResultPage />} />
        <Route path="/record/:id" element={<RecordPage />} />
        <Route path="/scenario" element={<ScenarioPage />} />
        <Route path="/technology" element={<TechnologyPage />} />
        <Route path="/benchmark" element={<BenchmarkPage />} />
        <Route path="/calibration" element={<CalibrationPage />} />
        <Route path="/points" element={<PointsPage />} />
        <Route path="/points/new" element={<PointFormPage />} />
        <Route path="/points/:monitorPointId" element={<PointDetailPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
