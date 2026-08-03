import {
  Navigate,
  Outlet,
  RouterProvider,
  createBrowserRouter,
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

function AppLayout() {
  return <Outlet />;
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <EmployeeDashboard /> },
      { path: "training/:id", element: <TrainingPage /> },
      { path: "test/:id", element: <TestPage /> },
      { path: "result/:id", element: <ResultPage /> },
      { path: "admin/results/:id", element: <ResultPage /> },
      { path: "admin/trainings", element: <AdminTestPage /> },
      { path: "admin/trainings/create", element: <CreateTestPage /> },
      { path: "admin/trainings/:id/edit", element: <CreateTestPage /> },
      {
        path: "admin/trainings/:id/participants",
        element: <AdminParticipantsPage />,
      },
      {
        path: "admin/trainings/:id/attendance-form",
        element: <AttendanceFormPage />,
      },
      {
        path: "admin/trainings/:id/participants/:employeeId",
        element: <EmployeeTrainingFilePage />,
      },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

function App() {
  return <RouterProvider router={router} />;
}

export default App;
