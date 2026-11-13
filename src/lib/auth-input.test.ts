import { describe, expect, it } from 'vitest'
import { validateEmailPassword } from './auth-input'

describe('Perception email password validation', () => {
  it('accepts an existing password without imposing the new account policy', () => {
    expect(validateEmailPassword('legacy', 'signin')).toBeNull()
    expect(validateEmailPassword('legacy', 'signup')).toContain('eight')
    expect(validateEmailPassword('', 'signin')).toContain('Enter your password')
  })

  it('preserves passwords verbatim instead of trimming their contents', () => {
    expect(validateEmailPassword('  my pass ', 'signin')).toBeNull()
    expect(validateEmailPassword('abcdefgh', 'signup')).toBeNull()
  })
})
