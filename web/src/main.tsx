import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { loadKeystore } from './state/keystore.ts'
import './index.css'

// Hydrate the keystore (migrating from localStorage if needed) before
// React mounts so guards like `hasWrappedKey()` give the right answer
// on the first render.
await loadKeystore()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
