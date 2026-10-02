// 렌더러. 셸이 주는 창 목록을 월드에 넣고, 고정 타임스텝으로 돌리고, 그린다.
//
// 셸(맥)은 window.sneaky 를 만들어 준다. 없으면 브라우저로 연 것이라 가짜 창을 띄운다 —
// 앱을 빌드하지 않고도 걷기·점프·가림을 눈으로 볼 수 있게.

import { STEP } from '../game/constants.js'
import { createWorld, drainEvents, resize, setMaxChars, setMouse, setWindows, step } from '../game/engine.js'
import { EFFECT_LIFE, drawBubble, drawChar, drawEffect, drawZzz, setScale } from '../render/draw.js'
import { startDemo } from './demo.js'

const canvas = document.getElementById('stage')
const ctx = canvas.getContext('2d', { alpha: true })
const bridge = window.sneaky

const world = createWorld({
  seed: (Date.now() & 0x7fffffff) >>> 0, // 시드만 바깥에서. 월드 안은 결정론이다.
  w: window.innerWidth,
  h: window.innerHeight,
  maxChars: bridge?.maxChars ?? undefined,
})

/** 캔버스를 화면 크기에 맞춘다. 레티나에서는 실제 픽셀이 두 배다. */
function fit() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = Math.max(1, Math.round(window.innerWidth))
  const h = Math.max(1, Math.round(window.innerHeight))
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
  resize(world, w, h)
  return dpr
}
let dpr = fit()
window.addEventListener('resize', () => {
  dpr = fit()
})

// ───────────────────────────────── 셸 ↔ 월드

/** 셸이 주는 창은 [id, x, y, w, h] 배열이다(짧게 보내려고). 앞에서 뒤 순서. */
function applyWindows(list) {
  setWindows(world, list.map(([id, x, y, w, h]) => ({ id, x, y, w, h })))
}

if (bridge) {
  bridge.onWindows((list, mouse) => {
    applyWindows(list)
    setMouse(world, mouse ? { x: mouse[0], y: mouse[1] } : null)
  })
  bridge.onMaxChars((n) => setMaxChars(world, n))
  if (bridge.scale) setScale(bridge.scale)
  bridge.onScale(setScale)
  bridge.send({ type: 'ready' })
  if (bridge.debug) {
    // CHIIKAWA_DEBUG=1 로 띄우면 3 초마다 월드 요약을 셸 stderr 로.
    setInterval(() => {
      const wins = world.windows.map((w) => `${w.id}@${w.x},${w.y} ${w.w}x${w.h} segs=${JSON.stringify(world.segs.get(w.id))}`)
      const chars = world.chars.map((c) => `${c.kind}:${c.mode}/${c.action}@${Math.round(c.x)},${Math.round(c.y)} win=${c.win}`)
      bridge.send({ type: 'log', text: `t=${world.t.toFixed(1)}\n  ${wins.join('\n  ')}\n  ${chars.join('\n  ')}` })
    }, 3000)
  }
} else {
  window.__world = world // 데모에서만. 콘솔로 들여다보려고.
  startDemo({
    onWindows: applyWindows,
    onMouse: (m) => setMouse(world, m),
  })
}

// ───────────────────────────────── 돌리기

const effects = []
let last = performance.now()
let acc = 0

function frame(now) {
  // 잠들었다 깨면(창이 숨었다 보이면) 밀린 시간을 한꺼번에 돌리지 않는다.
  acc += Math.min(0.25, (now - last) / 1000)
  last = now
  while (acc >= STEP) {
    step(world)
    acc -= STEP
  }
  for (const e of drainEvents(world)) effects.push({ ...e, age: 0, life: EFFECT_LIFE[e.type] || 0.4 })
  for (const fx of effects) fx.age += (now - (fx.last ?? now)) / 1000
  for (const fx of effects) fx.last = now

  draw()
  requestAnimationFrame(frame)

if (!bridge) {
  // 데모 전용: 시간을 손으로 감는다. 탭이 뒤에 있으면 rAF 가 안 돌아서, 자동 확인할 때 쓴다.
  window.__tick = (seconds) => {
    for (let i = 0; i < Math.round(seconds / STEP); i++) step(world)
    for (const e of drainEvents(world)) effects.push({ ...e, age: 0, life: EFFECT_LIFE[e.type] || 0.4 })
    draw()
  }
}
}

/**
 * 뒤 창부터 앞 창 순서로: 그 창 자리를 비우고, 그 창 위에 선 아이들을 그린다.
 * 그러면 앞 창이 자기 자리를 비울 때 뒤 창 위 아이들의 가려진 부분이 같이 지워진다 —
 * 창이 아이를 가리는 것처럼 보인다. 날고 있는 아이는 마지막에, 모든 창 위에 그린다.
 */
function draw() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, world.screen.w, world.screen.h)

  const ground = new Map()
  for (const ch of world.chars) {
    if (ch.mode !== 'ground') continue
    if (!ground.has(ch.win)) ground.set(ch.win, [])
    ground.get(ch.win).push(ch)
  }

  for (let i = world.windows.length - 1; i >= 0; i--) {
    const win = world.windows[i]
    ctx.clearRect(win.x, win.y, win.w, win.h)
    const list = ground.get(win.id)
    if (!list) continue
    for (const ch of list) drawChar(ctx, ch)
    for (const ch of list) {
      drawZzz(ctx, ch)
      drawBubble(ctx, ch)
    }
  }

  for (const ch of world.chars) if (ch.mode === 'air') drawChar(ctx, ch)

  for (let i = effects.length - 1; i >= 0; i--) {
    if (effects[i].age >= effects[i].life) effects.splice(i, 1)
    else drawEffect(ctx, effects[i])
  }
}

requestAnimationFrame(frame)

if (!bridge) {
  // 데모 전용: 시간을 손으로 감는다. 탭이 뒤에 있으면 rAF 가 안 돌아서, 자동 확인할 때 쓴다.
  window.__tick = (seconds) => {
    for (let i = 0; i < Math.round(seconds / STEP); i++) step(world)
    for (const e of drainEvents(world)) effects.push({ ...e, age: 0, life: EFFECT_LIFE[e.type] || 0.4 })
    draw()
  }
}
