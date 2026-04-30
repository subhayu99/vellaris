/* External links and internal route handoffs. Single source so the
 * repo URL, docs URL, and "/app" handoff stay consistent across every
 * marketing component.
 *
 * DOCS_URL is intentionally a same-origin path (not docs.vellaris.dev).
 * The /docs routes live in the SPA; clicks should stay in-app instead of
 * bouncing to a separate domain. */

export const REPO_URL = 'https://github.com/subhayu99/vellaris'
export const APP_ROUTE = '/app'

export const DOCS_URL = '/docs'
export const DOCS_INSTALL = '/docs/install'
export const DOCS_QUICKSTART = '/docs/quickstart'
export const DOCS_TRUST = '/docs/trust-model'
export const DOCS_CLI = '/docs/cli'
export const DOCS_SDK = '/docs/sdk'
export const DOCS_DEPLOY = '/docs/deployment'
export const DOCS_PROTOCOL = '/docs/protocol'
export const DOCS_API = '/docs/api'
