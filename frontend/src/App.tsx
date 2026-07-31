import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import EmployeeDashboard from "./pages/EmployeeDashboard";
import ResultPage from "./pages/ResultPage";
import TestPage from "./pages/TestPage";
import TrainingPage from "./pages/TrainingPage";

import AdminParticipantsPage from "./pages/admin/AdminParticipantsPage";
import AdminTestPage from "./pages/admin/AdminTestPage";
import AttendanceFormPage from "./pages/admin/AttendanceFormPage";
import CreateTestPage from "./pages/admin/CreateTestPage";
import EmployeeTrainingFilePage from "./pages/admin/EmployeeTrainingFilePage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<EmployeeDashboard />} />

        <Route path="/training/:id" element={<TrainingPage />} />
        <Route path="/test/:id" element={<TestPage />} />
        <Route path="/result/:id" element={<ResultPage />} />
        <Route path="/admin/results/:id" element={<ResultPage />} />

        <Route path="/admin/trainings" element={<AdminTestPage />} />
        <Route path="/admin/trainings/create" element={<CreateTestPage />} />
        <Route path="/admin/trainings/:id/edit" element={<CreateTestPage />} />
        <Route
          path="/admin/trainings/:id/participants"
          element={<AdminParticipantsPage />}
        />
        <Route
          path="/admin/trainings/:id/attendance-form"
          element={<AttendanceFormPage />}
        />
        <Route
          path="/admin/trainings/:id/participants/:employeeId"
          element={<EmployeeTrainingFilePage />}
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;