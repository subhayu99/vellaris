/*
 * Marketing landing page — direct port of
 *   ~/Downloads/Vellaris (1)/landing/app.jsx
 *
 * Section components are added incrementally; this shell handles the
 * marketing scope class, theme persistence, and reveal-on-scroll
 * wiring that the prototype put in app.jsx.
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
import './marketing.css'

export default function Marketing() {
  const rootRef = useRef<HTMLDivElement>(null)
  // Theme state lives here so the toggle in the footer (added later)
  // can flip dark/light for the whole document.
  useTheme()
  useRevealOnScroll(rootRef)

  return (
    <div className="marketing-root" ref={rootRef} id="top">
      <NavBar />
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
        {/* Sections land in subsequent commits:
            LivingTerminal · GetStarted · Footer */}
      </main>
    </div>
  )
}
