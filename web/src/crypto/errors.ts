/**
 * Typed exception hierarchy mirroring `src/vellaris/core/errors.py`.
 *
 * All crypto failures extend {@link VellarisCryptoError} so callers can catch
 * a single base; subclasses let them distinguish *why* an operation failed
 * (decrypt vs signature vs KDF vs wire format vs key format).
 */

export class VellarisCryptoError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'VellarisCryptoError'
  }
}

export class DecryptError extends VellarisCryptoError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'DecryptError'
  }
}

export class SignatureError extends VellarisCryptoError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'SignatureError'
  }
}

export class KdfError extends VellarisCryptoError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'KdfError'
  }
}

export class WireFormatError extends VellarisCryptoError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'WireFormatError'
  }
}

export class KeyFormatError extends VellarisCryptoError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'KeyFormatError'
  }
}
