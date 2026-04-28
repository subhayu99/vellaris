import { Navigate, Route, Routes } from 'react-router-dom'
import { ConnectRoute } from './routes/connect.tsx'
import { LoginRoute } from './routes/login.tsx'
import { SignupRoute } from './routes/signup.tsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/connect" replace />} />
      <Route path="/connect" element={<ConnectRoute />} />
      <Route path="/signup" element={<SignupRoute />} />
      <Route path="/login" element={<LoginRoute />} />
      <Route path="*" element={<Navigate to="/connect" replace />} />
    </Routes>
  )
}
