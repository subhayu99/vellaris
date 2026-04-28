/**
 * Login screen placeholder. Implemented in a follow-up commit.
 */

import { AuthLayout } from './_layout.tsx'
import { getServerUrl } from '../state/server.ts'

export function LoginRoute() {
  return (
    <AuthLayout serverUrl={getServerUrl()}>
      <div className="text-center">
        <h1 className="text-fg font-serif text-3xl tracking-tight">Sign in</h1>
        <p className="text-fg-2 mt-3">Coming next in this slice.</p>
      </div>
    </AuthLayout>
  )
}
