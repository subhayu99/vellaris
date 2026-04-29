/*
 * Marketing landing page — direct port of
 *   ~/Downloads/Vellaris (1)/landing/app.jsx
 *
 * Section order matches the prototype's JSX. Theme + reveal-on-scroll
 * stay at the root so the footer's theme toggle and every section's
 * `.reveal` wrapper share a single source.
 */

import { useRef } from 'react'
import { useRevealOnScroll, useTheme } from './hooks.ts'
import { NavBar } from './nav-bar.tsx'
import { Hero } from './hero.tsx'
import { HowItWorks } from './how-it-works.tsx'
import { Clients } from './clients.tsx'
import { Architecture } from './architecture.tsx'
import { Features } from './features.tsx'
import { FAQ } from './faq.tsx'
import { LivingTerminal } from './living-terminal.tsx'
import { GetStarted } from './get-started.tsx'
import { Footer } from './footer.tsx'
import './marketing.css'

export default function Marketing() {
  const rootRef = useRef<HTMLDivElement>(null)
  const [theme, toggleTheme] = useTheme()
  useRevealOnScroll(rootRef)

  return (
    <div className="marketing-root" ref={rootRef} id="top">
      <NavBar theme={theme} onToggleTheme={toggleTheme} />
      <main>
        <Hero />
        <div className="reveal">
          <HowItWorks />
        </div>
        <div className="reveal">
          <Clients />
        </div>
        <div className="reveal">
          <Architecture />
        </div>
        <div className="reveal">
          <Features />
        </div>
        <div className="reveal">
          <FAQ />
        </div>
        <div className="reveal">
          <LivingTerminal />
        </div>
        <div className="reveal">
          <GetStarted />
        </div>
      </main>
      <Footer theme={theme} onToggleTheme={toggleTheme} />
    </div>
  )
}
