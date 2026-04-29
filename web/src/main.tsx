import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import './index.css'

// `import.meta.env.BASE_URL` is whatever Vite's `base:` resolved to —
// "/" in dev and "/<project>/" on GitHub Pages. Anchoring BrowserRouter
// to it means every <Link to="/login"> resolves under the project
// prefix without per-link edits.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
