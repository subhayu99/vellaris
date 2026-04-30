/*
 * Docs route — same chrome as the marketing site (sticky nav, theme
 * toggle, footer) wrapped around a 2-column docs shell. The slug param
 * picks which page to render; /docs (no slug) shows the index hub.
 *
 * On <900px the sidebar collapses; the MobileRail renders a horizontal
 * scrollable chip rail directly under the global nav.
 */

import { useEffect, type ComponentType } from 'react'
import { Navigate, useLocation, useParams } from 'react-router-dom'
import { useTheme } from '../marketing/hooks.ts'
import { Footer } from '../marketing/footer.tsx'
import '../marketing/marketing.css'
import { DocsNavBar } from './docs-nav-bar.tsx'
import { DocsSidebar } from './sidebar.tsx'
import { MobileRail } from './mobile-rail.tsx'
import { DocsIndexPage } from './pages/index-page.tsx'
import { InstallPage } from './pages/install.tsx'
import { QuickstartPage } from './pages/quickstart.tsx'
import { TrustModelPage } from './pages/trust-model.tsx'
import { CLIReferencePage } from './pages/cli.tsx'
import { SDKPage } from './pages/sdk.tsx'
import { DeploymentPage } from './pages/deployment.tsx'
import { ProtocolPage } from './pages/protocol.tsx'
import { ApiPage } from './pages/api.tsx'
import './docs.css'

const PAGES: Record<string, ComponentType> = {
  quickstart: QuickstartPage,
  install: InstallPage,
  'trust-model': TrustModelPage,
  cli: CLIReferencePage,
  sdk: SDKPage,
  deployment: DeploymentPage,
  protocol: ProtocolPage,
  api: ApiPage,
}

export function DocsRoute() {
  const { slug } = useParams<{ slug?: string }>()
  const location = useLocation()
  const [theme, toggleTheme] = useTheme()

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [location.pathname])

  if (slug && !(slug in PAGES)) {
    return <Navigate to="/docs" replace />
  }

  const Page = slug ? PAGES[slug] : DocsIndexPage

  return (
    <div className="marketing-root docs-root">
      <DocsNavBar theme={theme} onToggleTheme={toggleTheme} />
      <MobileRail />
      <main className="docs-shell">
        <DocsSidebar />
        <Page />
      </main>
      <Footer theme={theme} onToggleTheme={toggleTheme} />
    </div>
  )
}
