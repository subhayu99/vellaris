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
        {/* Sections land in subsequent commits:
            Hero · HowItWorks · Clients · Architecture · Features · FAQ ·
            LivingTerminal · GetStarted · Footer */}
      </main>
    </div>
  )
}
