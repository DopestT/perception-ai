import { FormEvent, ReactNode, useState } from 'react'
import { resolveFrontDoorInput } from './lib/front-door-intake'

type FrontDoorBoundaryProps = {
  children: ReactNode
}

type FrontDoorNotice = {
  message: string
  top: number
  left: number
  width: number
}

export function FrontDoorBoundary({ children }: FrontDoorBoundaryProps) {
  const [notice, setNotice] = useState<FrontDoorNotice | null>(null)

  const captureSubmit = (event: FormEvent<HTMLDivElement>) => {
    const target = event.target
    if (!(target instanceof HTMLFormElement) || !target.classList.contains('hero-input-shell')) return

    const input = target.querySelector<HTMLInputElement>('input')
    const resolution = resolveFrontDoorInput(input?.value ?? '')
    if (resolution.kind === 'ignore') return
    if (resolution.kind === 'objective') {
      setNotice(null)
      return
    }

    event.preventDefault()
    event.stopPropagation()

    const rect = target.getBoundingClientRect()
    setNotice({
      message: resolution.message,
      top: rect.bottom + 14,
      left: rect.left + rect.width / 2,
      width: Math.min(Math.max(rect.width, 280), 640),
    })
  }

  const clearNoticeOnInput = () => {
    if (notice) setNotice(null)
  }

  return (
    <div style={{ display: 'contents' }} onSubmitCapture={captureSubmit} onInputCapture={clearNoticeOnInput}>
      {children}
      {notice && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            top: notice.top,
            left: notice.left,
            width: notice.width,
            maxWidth: 'calc(100vw - 32px)',
            transform: 'translateX(-50%)',
            zIndex: 80,
            boxSizing: 'border-box',
            padding: '11px 16px',
            border: '1px solid rgba(255, 255, 255, 0.16)',
            borderRadius: 999,
            background: 'rgba(12, 14, 14, 0.88)',
            color: 'rgba(255, 250, 238, 0.94)',
            boxShadow: '0 18px 50px rgba(0, 0, 0, 0.28)',
            backdropFilter: 'blur(18px)',
            WebkitBackdropFilter: 'blur(18px)',
            fontSize: 12,
            lineHeight: 1.45,
            letterSpacing: '0.02em',
            textAlign: 'center',
            pointerEvents: 'none',
          }}
        >
          {notice.message}
        </div>
      )}
    </div>
  )
}
