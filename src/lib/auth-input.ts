export type AuthPasswordMode = 'signin' | 'signup'

export function validateEmailPassword(password: string, mode: AuthPasswordMode = 'signin') {
  const trimmed = password.trim()

  if (!trimmed) {
    return 'Enter your password to continue.'
  }

  if (mode === 'signup' && trimmed.length < 8) {
    return 'Use at least 8 characters for your password.'
  }

  return ''
}
