/** Validation only. The authentication backend remains the source of truth. */
export type EmailAuthMode = 'signin' | 'signup'

export function validateEmailPassword(password: string, mode: EmailAuthMode): string | null {
  if (!password) return 'Enter your password to continue.'
  if (mode === 'signup' && password.length < 8) {
    return 'Use at least eight characters for a new password.'
  }
  return null
}
