// 렌더러. 셸이 주는 창 목록을 월드에 넣고, 고정 타임스텝으로 돌리고, 그린다.
//
// 셸(맥)은 window.sneaky 를 만들어 준다. 없으면 브라우저로 연 것이라 가짜 창을 띄운다 —
// 앱을 빌드하지 않고도 걷기·점프·가림을 눈으로 볼 수 있게.

import { STEP } from '../game/constants.js'
import { createWorld, drainEvents, resize, setKinds, setMaxChars, setMouse, setWindows, step } from '../game/engine.js'
import {
  EFFECT_LIFE, drawBubble, drawChar, drawEffect, drawExclaim, drawProp, drawZzz, setScale, setSprite,
} from '../render/draw.js'
import * as fx from '../render/fx.js'
import { segmentAt } from '../game/surfaces.js'
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

// ───────────────────────────────── 그림 폴더

/**
 * 그림 폴더의 그림을 불러온다. 파일 이름이 곧 아이 이름이다(chiikawa.png → chiikawa).
 * 하나라도 불러오면 **그림이 있는 아이들만** 나온다 — 그림과 도형이 섞이면 어색하다.
 * 불러오기 전에 이미 나와 있던 도형 아이들은 그대로 두고, 새로 나오는 아이부터 바뀐다.
 */
/**
 * 둘레의 투명한 여백을 잘라 낸다. 여백째로 키를 맞추면 그림이 작아지고 발이 공중에 뜬다.
 * 잘라 낼 게 없거나 읽을 수 없으면(교차 출처) 원래 그림을 그대로 쓴다.
 */
function trimmed(image) {
  try {
    const w = image.naturalWidth
    const h = image.naturalHeight
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const g = c.getContext('2d')
    g.drawImage(image, 0, 0)
    const data = g.getImageData(0, 0, w, h).data
    let x0 = w, y0 = h, x1 = -1, y1 = -1
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > 12) {
          if (x < x0) x0 = x
          if (x > x1) x1 = x
          if (y < y0) y0 = y
          if (y > y1) y1 = y
        }
      }
    }
    if (x1 < 0 || (x0 === 0 && y0 === 0 && x1 === w - 1 && y1 === h - 1)) return image
    const out = document.createElement('canvas')
    out.width = x1 - x0 + 1
    out.height = y1 - y0 + 1
    out.getContext('2d').drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height)
    return out
  } catch {
    return image
  }
}

function loadSprites(files) {
  const loaded = new Set()
  const kindOf = (file) => file.replace(/\.[^.]+$/, '').toLowerCase()
  const jobs = files.map((file) => new Promise((resolve) => {
    const kind = kindOf(file)
    const image = new Image()
    image.onload = () => {
      setSprite(kind, trimmed(image))
      loaded.add(kind)
      resolve()
    }
    image.onerror = () => {
      console.error(`그림을 못 읽었다: ${file}`)
      resolve()
    }
    image.src = `../sprites/${encodeURIComponent(file)}`
  }))
  Promise.all(jobs).then(() => {
    // 순서는 파일 목록 순서(셸이 이름순으로 준다). 적게 나온 아이부터 나오므로 순서는 동점일 때만 쓴다.
    const kinds = [...new Set(files.map(kindOf))].filter((kind) => loaded.has(kind))
    if (kinds.length) setKinds(world, kinds)
  })
}

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
  loadSprites(bridge.sprites || [])
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
  // 데모에서는 src/sprites/index.json 에 파일 이름 목록을 적어 두면 그걸 쓴다.
  fetch('../sprites/index.json').then((r) => (r.ok ? r.json() : [])).then(loadSprites).catch(() => {})
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
  const dt = Math.min(0.25, (now - last) / 1000)
  acc += dt
  last = now
  while (acc >= STEP) {
    step(world)
    acc -= STEP
  }
  advance(dt)
  draw()
  requestAnimationFrame(frame)
}

/** 효과를 dt 만큼 진행한다: 월드가 낸 사건을 받아 오고, 아이들을 보고 새로 뿌리고, 움직인다. */
function advance(dt) {
  for (const e of drainEvents(world)) {
    effects.push({ ...e, age: 0, life: EFFECT_LIFE[e.type] || 0.4 })
    if (e.type === 'pop') fx.burst('pop', e.x, e.y)
  }
  for (const e of effects) e.age += dt
  fx.emit(world.chars, dt, visible)
  fx.update(dt)
}

/** 이 아이가 지금 보이나 — 앞 창에 가린 아이에게서는 효과가 새 나오면 안 된다. */
function visible(ch) {
  if (ch.mode === 'air') return true
  return !!segmentAt(world.segs.get(ch.win), ch.x)
}

/**
 * 뒤 창부터 앞 창 순서로: 그 창 자리를 비우고, 그 창 위에 선 아이들을 그린다.
 * 그러면 앞 창이 자기 자리를 비울 때 뒤 창 위 아이들의 가려진 부분이 같이 지워진다 —
 * 창이 아이를 가리는 것처럼 보인다. 날고 있는 아이와 효과는 마지막에, 모든 창 위에 그린다.
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
    for (const ch of list) {
      drawChar(ctx, ch)
      drawProp(ctx, ch)
    }
    for (const ch of list) {
      drawZzz(ctx, ch)
      drawExclaim(ctx, ch)
      drawBubble(ctx, ch)
    }
  }

  for (const ch of world.chars) {
    if (ch.mode !== 'air') continue
    drawChar(ctx, ch)
    drawExclaim(ctx, ch)
  }

  fx.draw(ctx)
  for (let i = effects.length - 1; i >= 0; i--) {
    if (effects[i].age >= effects[i].life) effects.splice(i, 1)
    else drawEffect(ctx, effects[i])
  }
}

requestAnimationFrame(frame)

if (!bridge) {
  // 데모 전용: 시간을 손으로 감는다. 탭이 뒤에 있으면 rAF 가 안 돌아서, 자동 확인할 때 쓴다.
  window.__tick = (seconds) => {
    const n = Math.round(seconds / STEP)
    for (let i = 0; i < n; i++) {
      step(world)
      advance(STEP)
    }
    draw()
  }
}
