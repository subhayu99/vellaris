/**
 * Server-connect screen placeholder. Implemented in a follow-up commit.
 */

import { AuthLayout } from './_layout.tsx'
import { VSigil } from '../components/v-sigil.tsx'

export function ConnectRoute() {
  return (
    <AuthLayout>
      <div className="text-center">
        <div className="mb-6 flex justify-center">
          <VSigil size={56} glow />
        </div>
        <h1 className="text-fg font-serif text-3xl tracking-tight">Connect to a Vellaris server</h1>
        <p className="text-fg-2 mt-3">Coming next in this slice.</p>
      </div>
    </AuthLayout>
  )
}
