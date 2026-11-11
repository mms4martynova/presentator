import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import { useAuth } from './AuthContext.jsx'
import LoginPage from './pages/LoginPage.jsx'
import GeneratePage from './pages/GeneratePage.jsx'
import TasksPage from './pages/TasksPage.jsx'
import TaskPage from './pages/TaskPage.jsx'
import TemplatesPage from './pages/TemplatesPage.jsx'
import TemplatePage from './pages/TemplatePage.jsx'
import CorporateTemplatesPage from './pages/CorporateTemplatesPage.jsx'
import CorporateTemplatePage from './pages/CorporateTemplatePage.jsx'

function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  if (loading) return null
  return user ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<GeneratePage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="tasks/:taskId" element={<TaskPage />} />
        <Route path="templates" element={<TemplatesPage />} />
        <Route path="templates/:templateId" element={<TemplatePage />} />
        <Route path="corporate-templates" element={<CorporateTemplatesPage />} />
        <Route path="corporate-templates/:templateId" element={<CorporateTemplatePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
