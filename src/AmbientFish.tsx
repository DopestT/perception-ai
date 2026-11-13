import { useEffect, useRef } from 'react'
import type { ExperienceMode } from './PlasmaPortal'
import { encounterDelay, encounterDuration, swimPath } from './lib/ambient-fish-motion'

type RGB = readonly [number, number, number]
type Colors = readonly [RGB, RGB]

const experienceColors: Record<ExperienceMode, Colors> = {
  discover: [[16, 190, 132], [232, 159, 53]],
  perceive: [[41, 191, 229], [242, 133, 80]],
  search: [[41, 112, 242], [81, 214, 226]],
  forecast: [[63, 189, 176], [234, 176, 75]],
}

function lerp(a: number, b: number, amount: number) { return a + (b - a) * amount }

function ambientColor(mode: ExperienceMode, x: number): RGB {
  const [start, end] = experienceColors[mode]
  const blend = Math.max(0, Math.min(1, (x - 0.15) / 0.7))
  return [
    Math.round(lerp(start[0], end[0], blend)),
    Math.round(lerp(start[1], end[1], blend)),
    Math.round(lerp(start[2], end[2], blend)),
  ]
}

function rgba(color: RGB, alpha: number) {
  return `rgba(${color[0]},${color[1]},${color[2]},${alpha})`
}

function drawCreature(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  heading: number,
  tailPhase: number,
  colors: Colors,
  opacity: number,
) {
  const [base, accent] = colors
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(heading)
  ctx.scale(size / 110, size / 110)
  ctx.globalAlpha = Math.min(0.7, Math.max(0, opacity * 0.64))
  ctx.globalCompositeOperation = 'screen'
  const tail = Math.sin(tailPhase) * 9
  const bodyPulse = Math.sin(tailPhase - 0.9) * 1.7

  // Translucent fins move a beat behind the body, like a real swimming fish.
  ctx.fillStyle = rgba(accent, 0.36)
  ctx.beginPath()
  ctx.moveTo(-38, -1)
  ctx.quadraticCurveTo(-57, -6 + tail, -74, -25 + tail)
  ctx.quadraticCurveTo(-64, -1 + tail * 0.75, -75, 25 + tail)
  ctx.quadraticCurveTo(-53, 8 + tail * 0.45, -38, 1)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = rgba(base, 0.44)
  ctx.beginPath()
  ctx.moveTo(-24, -11)
  ctx.quadraticCurveTo(-8, -33 - bodyPulse, 19, -18)
  ctx.quadraticCurveTo(6, -12, -24, -11)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(-21, 9)
  ctx.quadraticCurveTo(-8, 29 + bodyPulse, 17, 15)
  ctx.quadraticCurveTo(2, 11, -21, 9)
  ctx.fill()

  const sheen = ctx.createLinearGradient(-48, -20, 58, 23)
  sheen.addColorStop(0, rgba(base, 0.25))
  sheen.addColorStop(0.52, rgba(base, 0.66))
  sheen.addColorStop(1, rgba(accent, 0.4))
  ctx.shadowColor = rgba(base, 0.42)
  ctx.shadowBlur = 16
  ctx.fillStyle = sheen
  ctx.beginPath()
  ctx.moveTo(52, 0)
  ctx.bezierCurveTo(36, -8, 20, -18, -8, -17)
  ctx.bezierCurveTo(-24, -17, -40, -7, -46, 0)
  ctx.bezierCurveTo(-34, 12, -12, 20 + bodyPulse, 11, 15)
  ctx.bezierCurveTo(34, 11, 48, 4, 52, 0)
  ctx.closePath()
  ctx.fill()
  ctx.shadowBlur = 0

  // A slightly delayed pectoral fin, a subtle gill line, and an eye.
  ctx.strokeStyle = rgba(accent, 0.56)
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(16, -7)
  ctx.quadraticCurveTo(3, 3, 16, 10)
  ctx.stroke()

  ctx.fillStyle = rgba(accent, 0.23)
  ctx.beginPath()
  ctx.moveTo(14, 2)
  ctx.quadraticCurveTo(0, 19 + Math.sin(tailPhase - 1.4) * 3, -16, 16)
  ctx.quadraticCurveTo(-1, 5, 14, 2)
  ctx.fill()

  ctx.fillStyle = rgba([241, 248, 244], 0.65)
  ctx.beginPath()
  ctx.arc(36, -3, 2.1, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/**
 * Lightweight overlay behind all interactive controls.
 * It never reacts to, records, or profiles a visitor's actions.
 */
export function AmbientFish({ experienceMode }: { experienceMode: ExperienceMode }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const modeRef = useRef(experienceMode)
  useEffect(() => { modeRef.current = experienceMode }, [experienceMode])

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d', { alpha: true })
    if (!canvas || !context) return

    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    let reduceMotion = media.matches
    let width = 1
    let height = 1
    let visible = document.visibilityState === 'visible'
    let inView = true
    let raf = 0
    let lastFrame = 0
    let passage = 0
    let encounterStart = 0
    let nextEncounter = performance.now() + 4200
    const resize = () => {
      const bounds = canvas.getBoundingClientRect()
      width = Math.max(1, bounds.width)
      height = Math.max(1, bounds.height)
      const ratio = Math.min(1.5, window.devicePixelRatio || 1)
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
    }
    const onVisibility = () => {
      visible = document.visibilityState === 'visible'
      if (visible && nextEncounter < performance.now() - 30000) {
        nextEncounter = performance.now() + 4000
        encounterStart = 0
      }
    }
    const onMotionChange = () => {
      reduceMotion = media.matches
      context.clearRect(0, 0, width, height)
    }
    const intersection = new IntersectionObserver((entries) => {
      inView = entries[0]?.isIntersecting ?? false
      if (!inView) context.clearRect(0, 0, width, height)
    }, { threshold: 0 })
    intersection.observe(canvas)
    media.addEventListener('change', onMotionChange)
    document.addEventListener('visibilitychange', onVisibility)
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      if (!visible || !inView || reduceMotion || now - lastFrame < 32) return
      lastFrame = now
      context.clearRect(0, 0, width, height)
      if (!encounterStart && now >= nextEncounter) encounterStart = now
      if (!encounterStart) return

      const duration = encounterDuration(passage)
      const progress = (now - encounterStart) / duration
      if (progress >= 1) {
        passage += 1
        encounterStart = 0
        nextEncounter = now + encounterDelay(passage)
        return
      }

      const path = swimPath(progress, passage)
      const base = ambientColor(modeRef.current, path.x)
      // Variants of the same local hue blend into the moving plasma.
      const lighter: RGB = [
        Math.round(lerp(base[0], 242, 0.17)),
        Math.round(lerp(base[1], 242, 0.17)),
        Math.round(lerp(base[2], 242, 0.17)),
      ]
      const direction = passage % 2 === 0 ? 1 : -1
      const size = Math.max(70, Math.min(128, width * 0.12))
      const heading = (direction < 0 ? Math.PI : 0) + path.slope * (width / Math.max(height, 1)) * 0.6
      drawCreature(context, path.x * width, path.y * height, size,
        heading, now / 1000 * 10.5, [base, lighter], path.opacity)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      intersection.disconnect()
      media.removeEventListener('change', onMotionChange)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])
  return <canvas className="ambient-fish-canvas" ref={canvasRef} aria-hidden="true" />
}
