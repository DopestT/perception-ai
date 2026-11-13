import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { validateEmailPassword } from './auth-input'

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../auth-refinement.css', import.meta.url), 'utf8')

describe('Perception login and account access', () => {
  it('does not reject an existing password solely for being shorter than the sign-up policy', () => {
    expect(validateEmailPassword('legacy', 'signin')).toBeNull()
    expect(validateEmailPassword('legacy', 'signup')).toContain('eight')
    expect(validateEmailPassword('', 'signin')).toContain('Enter your password')
  })

  it('preserves the password verbatim rather than modifying its contents', () => {
    expect(validateEmailPassword('  my pass ', 'signin')).toBeNull()
    expect(validateEmailPassword('abcdefgh', 'signup')).toBeNull()
  })

  it('keeps existing authentication providers and real Supabase actions', () => {
    for (const operation of [
      'requestEmailSignIn(address)',
      'signInWithPassword(address, submittedPassword)',
      'signUpWithPassword(address, submittedPassword)',
      'signInWithOAuthProvider(provider)',
      'signInWithPasskey()',
    ]) {
      expect(app).toContain(operation)
    }
  })

  it('makes email sign-in and password recovery straightforward', () => {
    expect(app).toContain('auth-mode-switch')
    expect(app).toContain('aria-pressed={authMode ===')
    expect(app).toContain('auth-magic-choice')
    expect(app).toContain("changeAuthMode('magic')")
    expect(app).toContain('perception-magic-email')
    expect(app).toContain("new FormData(event.currentTarget).get('email')")
  })

  it('supports Safari password autofill, readable inputs and password visibility', () => {
    expect(app).toContain("new FormData(event.currentTarget)")
    expect(app).toContain("type={showPassword ? 'text' : 'password'}")
    expect(app).toContain('autoComplete={authMode')
    expect(app).toContain('auth-password-toggle')
    expect(styles).toContain('font-size: 16px')
  })

  it('treats the account dialog as a real accessible modal', () => {
    expect(app).toContain('aria-modal="true"')
    expect(app).toContain('authDialogRef')
    expect(app).toContain('onAuthKeyDown')
    expect(app).toContain("event.key === 'Escape'")
    expect(app).toContain("event.key !== 'Tab'")
    expect(app).toContain("document.body.style.overflow = 'hidden'")
    expect(app).toContain("previousFocus?.focus")
    expect(styles).toContain('max-height: calc(100dvh - 32px)')
    expect(styles).toContain('prefers-reduced-motion: reduce')
  })
})
