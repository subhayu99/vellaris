import { Navigate, Route, Routes } from 'react-router-dom'
import { ConnectRoute } from './routes/connect.tsx'
import { DashboardRoute } from './routes/dashboard.tsx'
import { DocDetailRoute } from './routes/doc-detail.tsx'
import { LoginRoute } from './routes/login.tsx'
import { SettingsRoute } from './routes/settings.tsx'
import { SignupRoute } from './routes/signup.tsx'
import { UploadRoute } from './routes/upload.tsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/connect" replace />} />
      <Route path="/connect" element={<ConnectRoute />} />
      <Route path="/signup" element={<SignupRoute />} />
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/dashboard" element={<DashboardRoute />} />
      <Route path="/upload" element={<UploadRoute />} />
      <Route path="/doc/:id" element={<DocDetailRoute />} />
      <Route path="/settings" element={<SettingsRoute />} />
      <Route path="/home" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/connect" replace />} />
    </Routes>
  )
}
