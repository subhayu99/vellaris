import { Navigate, Route, Routes } from 'react-router-dom'
import { DocsRoute } from './docs/Docs.tsx'
import Marketing from './marketing/Marketing.tsx'
import { ConnectRoute } from './routes/connect.tsx'
import { DashboardRoute } from './routes/dashboard.tsx'
import { DocDetailRoute } from './routes/doc-detail.tsx'
import { LoginRoute } from './routes/login.tsx'
import { RecoverRoute } from './routes/recover.tsx'
import { SettingsRoute } from './routes/settings.tsx'
import { SignupRoute } from './routes/signup.tsx'
import { UploadRoute } from './routes/upload.tsx'

// Marketing was originally React.lazy-loaded so /login+ visits wouldn't
// download the landing-page chunk. With the merged build it's only ~11 KB
// JS + 5 KB CSS gzipped — paying ~600ms of blank-screen Suspense for that
// saving on / cold loads is the wrong trade. Eager-imported now; revisit
// if the marketing chunk grows materially.

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Marketing />} />
      <Route path="/docs" element={<DocsRoute />} />
      <Route path="/docs/:slug" element={<DocsRoute />} />
      <Route path="/app" element={<Navigate to="/connect" replace />} />
      <Route path="/connect" element={<ConnectRoute />} />
      <Route path="/signup" element={<SignupRoute />} />
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/recover" element={<RecoverRoute />} />
      <Route path="/dashboard" element={<DashboardRoute />} />
      <Route path="/upload" element={<UploadRoute />} />
      <Route path="/doc/:id" element={<DocDetailRoute />} />
      <Route path="/settings" element={<SettingsRoute />} />
      <Route path="/home" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
