/**
 * HTTP / API failure types raised by {@link VellarisClient}.
 *
 * Two categories:
 *
 * - `VellarisAPIError` — server returned a non-2xx status (auth, conflict,
 *   etc.). Carries the `status` and parsed `detail` so callers can branch
 *   without inspecting message strings.
 * - `VellarisNetworkError` — request never reached a server (DNS, TLS, CORS,
 *   offline). Wraps the underlying `cause` for debugging.
 */

export class VellarisAPIError extends Error {
  readonly status: number
  readonly detail: string

  constructor(status: number, detail: string) {
    super(`HTTP ${status}: ${detail}`)
    this.name = 'VellarisAPIError'
    this.status = status
    this.detail = detail
  }
}

export class VellarisNetworkError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'VellarisNetworkError'
  }
}
