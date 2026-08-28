import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./components/AppShell";
import BenchmarkPage from "./pages/BenchmarkPage";
import CalibrationPage from "./pages/CalibrationPage";
import CapturePage from "./pages/CapturePage";
import HomePage from "./pages/HomePage";
import RecordPage from "./pages/RecordPage";
import ResultPage from "./pages/ResultPage";
import ScenarioPage from "./pages/ScenarioPage";
import ShowcasePage from "./pages/ShowcasePage";
import TechnologyPage from "./pages/TechnologyPage";

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/capture" element={<CapturePage />} />
        <Route path="/showcase" element={<ShowcasePage />} />
        <Route path="/result/:id" element={<ResultPage />} />
        <Route path="/result" element={<ResultPage />} />
        <Route path="/record/:id" element={<RecordPage />} />
        <Route path="/scenario" element={<ScenarioPage />} />
        <Route path="/technology" element={<TechnologyPage />} />
        <Route path="/benchmark" element={<BenchmarkPage />} />
        <Route path="/calibration" element={<CalibrationPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
