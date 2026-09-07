import { useEffect, useRef } from 'react'

export type PlasmaMode = 'idle' | 'hover' | 'focused' | 'typing' | 'charging' | 'absorbing' | 'auth' | 'transitioning'
export type ExperienceMode = 'discover' | 'perceive' | 'search'

const experienceValues: Record<ExperienceMode, number> = {
  discover: 0,
  perceive: 1,
  search: 2,
}

export function PlasmaPortal({ mode, experienceMode, energy = 0 }: { mode: PlasmaMode; experienceMode: ExperienceMode; energy?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const modeRef = useRef(mode)
  const experienceRef = useRef(experienceMode)
  const energyRef = useRef(energy)

  useEffect(() => { modeRef.current = mode }, [mode])
  useEffect(() => { experienceRef.current = experienceMode }, [experienceMode])
  useEffect(() => { energyRef.current = energy }, [energy])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext('webgl', { antialias: false, alpha: true, premultipliedAlpha: false })
    if (!gl) return

    const vertexSource = `
      attribute vec2 aPosition;
      void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }
    `

    const fragmentSource = `
      precision mediump float;
      uniform vec2 uResolution;
      uniform vec2 uPointer;
      uniform float uTime;
      uniform float uEnergy;
      uniform float uFocus;
      uniform float uSubmit;
      uniform float uAuth;
      uniform float uExperience;

      float hash(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * noise(p);
          p = p * 2.03 + 17.17;
          a *= 0.5;
        }
        return v;
      }

      vec3 palette(float t, float side, float experience) {
        vec3 discoverA = mix(vec3(0.01, 0.48, 0.29), vec3(0.12, 0.98, 0.67), t);
        vec3 discoverB = mix(vec3(1.0, 0.42, 0.02), vec3(1.0, 0.86, 0.22), t);
        vec3 discover = mix(discoverA, discoverB, side);

        vec3 perceiveA = mix(vec3(0.03, 0.55, 1.0), vec3(0.28, 0.96, 1.0), t);
        vec3 perceiveB = mix(vec3(1.0, 0.12, 0.02), vec3(1.0, 0.72, 0.18), t);
        vec3 perceive = mix(perceiveA, perceiveB, side);

        vec3 searchA = mix(vec3(0.01, 0.18, 0.92), vec3(0.12, 0.55, 1.0), t);
        vec3 searchB = mix(vec3(0.0, 0.62, 0.94), vec3(0.45, 0.98, 1.0), t);
        vec3 search = mix(searchA, searchB, side);

        vec3 discoverToPerceive = mix(discover, perceive, smoothstep(0.0, 1.0, experience));
        vec3 base = mix(discoverToPerceive, search, smoothstep(1.0, 2.0, experience));
        return mix(base, vec3(1.0), smoothstep(0.78, 1.0, t) * 0.35);
      }

      void main() {
        vec2 frag = gl_FragCoord.xy;
        vec2 uv = (frag - 0.5 * uResolution.xy) / min(uResolution.x, uResolution.y);
        uv.y += 0.015;

        float aspect = uResolution.x / uResolution.y;
        vec2 pointer = (uPointer - 0.5) * vec2(aspect, 1.0);
        float pointerInfluence = exp(-5.5 * distance(uv, pointer)) * 0.045;

        float speed = 0.085 + uEnergy * 0.08 + uSubmit * 0.14;
        float t = uTime * speed;
        vec2 warp = uv;
        float n1 = fbm(warp * 2.0 + vec2(t, -t * 0.55));
        float n2 = fbm(warp * 4.5 + vec2(-t * 0.7, t * 0.42));
        warp += vec2(n1 - 0.5, n2 - 0.5) * (0.12 + uEnergy * 0.04 + pointerInfluence);

        float xScale = 0.96 - uSubmit * 0.12;
        float yScale = 0.58 - uSubmit * 0.06;
        vec2 ellipseP = vec2(warp.x / xScale, warp.y / yScale);
        float ringDist = abs(length(ellipseP) - 0.98);

        float turbulence = fbm(warp * 8.0 + t * 0.5);
        float ringWidth = 0.075 + turbulence * 0.055 + uFocus * 0.012;
        float ring = 1.0 - smoothstep(ringWidth, ringWidth + 0.055, ringDist);

        float side = smoothstep(-0.16, 0.24, uv.x + (n1 - 0.5) * 0.18);
        float shimmer = 0.52 + 0.48 * sin((uv.x * 5.0 - uv.y * 3.0 + n2 * 4.0) + uTime * 0.35);
        float localEnergy = clamp(0.42 + 0.5 * turbulence + 0.22 * shimmer + uEnergy * 0.3 + uFocus * 0.16 + uSubmit * 0.5, 0.0, 1.0);
        vec3 color = palette(localEnergy, side, uExperience);

        float halo = exp(-4.8 * abs(length(vec2(uv.x / 1.02, uv.y / 0.64)) - 1.0));
        halo *= 0.18 + uFocus * 0.12 + uEnergy * 0.11;

        float floor = exp(-26.0 * abs(uv.y + 0.43)) * exp(-1.9 * abs(uv.x));
        floor *= 0.22 + 0.12 * sin(uv.x * 18.0 + uTime * 0.45 + n1 * 3.0);

        float centerVoid = 1.0 - smoothstep(0.2, 0.76, length(vec2(uv.x / 0.9, uv.y / 0.48)));
        float authDim = mix(1.0, 0.58, uAuth);
        float alpha = (ring * (0.48 + localEnergy * 0.42) + halo + floor) * authDim;
        alpha *= 1.0 - centerVoid * 0.24;

        gl_FragColor = vec4(color * (0.62 + localEnergy * 0.62), clamp(alpha, 0.0, 0.95));
      }
    `

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)
      if (!shader) return null
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.warn('Perception plasma shader compile failed', gl.getShaderInfoLog(shader))
        gl.deleteShader(shader)
        return null
      }
      return shader
    }

    const vertex = compile(gl.VERTEX_SHADER, vertexSource)
    const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource)
    if (!vertex || !fragment) return

    const program = gl.createProgram()
    if (!program) return
    gl.attachShader(program, vertex)
    gl.attachShader(program, fragment)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return
    gl.useProgram(program)

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
    const position = gl.getAttribLocation(program, 'aPosition')
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

    const resolution = gl.getUniformLocation(program, 'uResolution')
    const pointerUniform = gl.getUniformLocation(program, 'uPointer')
    const timeUniform = gl.getUniformLocation(program, 'uTime')
    const energyUniform = gl.getUniformLocation(program, 'uEnergy')
    const focusUniform = gl.getUniformLocation(program, 'uFocus')
    const submitUniform = gl.getUniformLocation(program, 'uSubmit')
    const authUniform = gl.getUniformLocation(program, 'uAuth')
    const experienceUniform = gl.getUniformLocation(program, 'uExperience')

    let raf = 0
    let start = performance.now()
    let px = 0.5
    let py = 0.5
    let tx = 0.5
    let ty = 0.5
    let smoothEnergy = 0
    let smoothFocus = 0
    let smoothSubmit = 0
    let smoothAuth = 0
    let smoothExperience = experienceValues[experienceRef.current]
    let visible = document.visibilityState === 'visible'

    const onPointer = (event: PointerEvent) => {
      tx = event.clientX / Math.max(window.innerWidth, 1)
      ty = 1 - event.clientY / Math.max(window.innerHeight, 1)
    }
    const onVisibility = () => { visible = document.visibilityState === 'visible' }
    window.addEventListener('pointermove', onPointer, { passive: true })
    document.addEventListener('visibilitychange', onVisibility)

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      const width = Math.max(1, Math.floor(rect.width * dpr))
      const height = Math.max(1, Math.floor(rect.height * dpr))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
        gl.viewport(0, 0, width, height)
      }
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const render = (now: number) => {
      raf = requestAnimationFrame(render)
      if (!visible) return
      resize()
      const dt = Math.min((now - start) / 1000, 0.032)
      start = now
      px += (tx - px) * Math.min(1, dt * 2.4)
      py += (ty - py) * Math.min(1, dt * 2.4)

      const currentMode = modeRef.current
      const targetFocus = currentMode === 'focused' || currentMode === 'typing' ? 1 : 0
      const targetSubmit = currentMode === 'charging' ? 0.58 : currentMode === 'absorbing' || currentMode === 'transitioning' ? 1 : 0
      const targetAuth = currentMode === 'auth' ? 1 : 0
      const targetExperience = experienceValues[experienceRef.current]
      smoothEnergy += (energyRef.current - smoothEnergy) * 0.08
      smoothFocus += (targetFocus - smoothFocus) * 0.07
      smoothSubmit += (targetSubmit - smoothSubmit) * 0.055
      smoothAuth += (targetAuth - smoothAuth) * 0.06
      smoothExperience = reducedMotion ? targetExperience : smoothExperience + (targetExperience - smoothExperience) * 0.055

      gl.uniform2f(resolution, canvas.width, canvas.height)
      gl.uniform2f(pointerUniform, px, py)
      gl.uniform1f(timeUniform, reducedMotion ? 0.0 : now / 1000)
      gl.uniform1f(energyUniform, reducedMotion ? 0.06 : smoothEnergy)
      gl.uniform1f(focusUniform, reducedMotion ? 0.0 : smoothFocus)
      gl.uniform1f(submitUniform, reducedMotion ? 0.0 : smoothSubmit)
      gl.uniform1f(authUniform, smoothAuth)
      gl.uniform1f(experienceUniform, smoothExperience)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
    }

    raf = requestAnimationFrame(render)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onPointer)
      document.removeEventListener('visibilitychange', onVisibility)
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
      gl.deleteShader(vertex)
      gl.deleteShader(fragment)
    }
  }, [])

  return <canvas ref={canvasRef} className="plasma-canvas" aria-hidden="true" />
}
