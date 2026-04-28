import { Routes, Route, Navigate } from 'react-router-dom'

function Placeholder({ name }: { name: string }) {
  return (
    <main className="mx-auto max-w-xl px-6 py-16 text-center">
      <h1 className="text-fg font-serif text-4xl tracking-tight">{name}</h1>
      <p className="text-fg-2 mt-4">Coming next in Phase 4 implementation.</p>
    </main>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/connect" replace />} />
      <Route path="/connect" element={<Placeholder name="Connect to a Vellaris server" />} />
      <Route path="/signup" element={<Placeholder name="Create your account" />} />
      <Route path="/login" element={<Placeholder name="Sign in" />} />
      <Route path="*" element={<Placeholder name="Not found" />} />
    </Routes>
  )
}
