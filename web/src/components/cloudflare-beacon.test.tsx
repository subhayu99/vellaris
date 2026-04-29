import { afterEach, describe, expect, it } from 'vitest'

import { trackPageview } from './cloudflare-beacon.tsx'

afterEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})

describe('trackPageview', () => {
  // The PROD guard short-circuits in the test environment (PROD = false), so
  // calling the function must be a no-op — no <script> insertion, no beacon
  // request. This is what stops dev/test runs from leaking analytics.
  it('does not inject a beacon script in non-prod / no-token mode', () => {
    expect(document.querySelector('script[data-cf-beacon]')).toBeNull()
    trackPageview('/connect')
    expect(document.querySelector('script[data-cf-beacon]')).toBeNull()
  })

  it('returns void on every call regardless of input', () => {
    expect(trackPageview('/connect')).toBeUndefined()
    expect(trackPageview('/signup')).toBeUndefined()
    expect(trackPageview('/login')).toBeUndefined()
  })
})
