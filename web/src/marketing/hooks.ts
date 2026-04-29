import { useEffect, useRef, useState } from 'react'

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const fn = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener?.('change', fn)
    return () => mq.removeEventListener?.('change', fn)
  }, [])
  return reduced
}

export type ThemeName = 'dark' | 'light'

export function useTheme(): [ThemeName, () => void] {
  const [theme, setTheme] = useState<ThemeName>(() => {
    if (typeof window === 'undefined') return 'dark'
    const saved = window.localStorage.getItem('vellaris-theme')
    if (saved === 'dark' || saved === 'light') return saved
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  })
  useEffect(() => {
    document.body.dataset.theme = theme
    window.localStorage.setItem('vellaris-theme', theme)
  }, [theme])
  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  return [theme, toggle]
}

export function useRevealOnScroll(rootRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      root.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-visible'))
      return
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('is-visible')
            obs.unobserve(e.target)
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
    )
    root.querySelectorAll('.reveal').forEach((el) => obs.observe(el))
    return () => obs.disconnect()
  }, [rootRef])
}

export interface TermLine {
  kind: 'cmd' | 'out' | 'blank' | 'encrypting'
  text?: string
  meta?: string
  check?: boolean
}

export interface TypewriterState {
  line: number
  char: number
  held: number
}

const TICK_MS = 26

interface TypewriterOptions {
  startWhenVisible?: boolean
  loopAfterMs?: number
  watchSelector?: string
}

export function useTypewriter(
  script: ReadonlyArray<TermLine>,
  options: TypewriterOptions = {},
): TypewriterState {
  const { startWhenVisible = false, loopAfterMs, watchSelector } = options
  const reduced = useReducedMotion()
  const [state, setState] = useState<TypewriterState>({ line: 0, char: 0, held: 0 })
  const [armed, setArmed] = useState(!startWhenVisible)
  const armedRef = useRef(armed)
  armedRef.current = armed

  useEffect(() => {
    if (!startWhenVisible) return
    if (!watchSelector) {
      setArmed(true)
      return
    }
    const el = document.querySelector(watchSelector)
    if (!el) {
      setArmed(true)
      return
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setArmed(true)
          obs.disconnect()
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [startWhenVisible, watchSelector])

  useEffect(() => {
    if (reduced) {
      setState({ line: script.length, char: 0, held: 0 })
      return
    }
    if (!armed) return
    const id = setInterval(() => {
      setState((prev) => stepScript(script, prev))
    }, TICK_MS)
    return () => clearInterval(id)
  }, [armed, reduced, script])

  useEffect(() => {
    if (reduced) return
    if (loopAfterMs == null) return
    if (state.line < script.length) return
    const t = setTimeout(() => setState({ line: 0, char: 0, held: 0 }), loopAfterMs)
    return () => clearTimeout(t)
  }, [state, script, reduced, loopAfterMs])

  return state
}

function stepScript(script: ReadonlyArray<TermLine>, prev: TypewriterState): TypewriterState {
  if (prev.line >= script.length) return prev
  const cur = script[prev.line]
  if (cur.kind === 'blank') return { line: prev.line + 1, char: 0, held: 0 }
  if (cur.kind === 'encrypting') {
    const held = prev.held + 1
    if (held >= 44) return { line: prev.line + 1, char: 0, held: 0 }
    return { ...prev, held }
  }
  if (cur.kind === 'cmd') {
    const text = cur.text ?? ''
    if (prev.char < text.length) return { line: prev.line, char: prev.char + 1, held: 0 }
    const held = prev.held + 1
    if (held >= 9) return { line: prev.line + 1, char: 0, held: 0 }
    return { ...prev, held }
  }
  if (cur.kind === 'out') {
    const held = prev.held + 1
    if (held >= 7) return { line: prev.line + 1, char: 0, held: 0 }
    return { ...prev, held }
  }
  return prev
}
