// 픽셀 아트 아이들. 그림 파일 없이 칸(셀) 단위로 그린다 — 도형을 칸 가운데에서 재서 칠하고,
// 테두리는 칠한 칸 바깥 한 칸(4방향)에 두른다. 부품을 뒤에서 앞으로 겹치면 앞 부품의 테두리가
// 뒤 부품 위로 지나가 경계선이 저절로 생긴다.
//
// 좌표: 칸 (x, y), 발바닥 줄이 y = 0, 위로 갈수록 y 가 작다(음수). 가운데가 x = 0.

export const CELL = 2 // 배율 1 에서 한 칸의 CSS 픽셀
const OX = 17 // x = -17 … 17
const OY = 37 // y = -37 … 0
const COLS = OX * 2 + 1
const ROWS = OY + 1

const INK = '#4a3a36'
const EYE = '#2b2220'
const WHITE = '#ffffff'
const BLUSH = '#ffa9bb'
const BLUSH_DARK = '#ef7f98'
const MOUTH = '#ef7f8f'
const TEAR = '#78bef0'
const EAR_PINK = '#f7b8c4'

/** 위가 둥글고 아래가 살짝 납작한 찹쌀떡. n 이 2 보다 크면 모서리가 차오른다. */
function mochi(cx, cy, w, h, n = 2.3, bump = 0) {
  return (x, y) => {
    const dx = Math.abs(x - cx) / w
    const dy = Math.abs(y - cy) / (y > cy ? h * 0.92 : h)
    const k = Math.pow(dx, n) + Math.pow(dy, n)
    // 복슬털: 테두리 칸을 번갈아 깎아 삐죽삐죽하게.
    const cut = bump && ((x * 5 + y * 3) & 3) === 0 ? bump : 0
    return k <= 1 - cut
  }
}
const circle = (cx, cy, r) => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r
const oval = (cx, cy, rx, ry) => (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1
function tri(ax, ay, bx, by, cx, cy) {
  const side = (px, py, qx, qy, rx, ry) => (px - rx) * (qy - ry) - (qx - rx) * (py - ry)
  return (x, y) => {
    const d1 = side(x, y, ax, ay, bx, by)
    const d2 = side(x, y, bx, by, cx, cy)
    const d3 = side(x, y, cx, cy, ax, ay)
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))
  }
}
const either = (...fs) => (x, y) => fs.some((f) => f(x, y))
const mirror = (make) => either(make(1), make(-1))

/**
 * 일곱 아이. body 는 몸 모양, back 은 몸보다 뒤에 그리는 부품들, paint 는 몸 안에 칠하는 무늬,
 * face 는 눈·입·볼 자리. 칸 좌표다.
 */
const KINDS = {
  chiikawa: {
    color: '#fffdf9',
    body: mochi(0, -12, 11.5, 10.3),
    back: [{ shape: mirror((s) => circle(s * 7, -21.6, 2.3)), color: '#fffdf9' }],
    face: { ex: 5.5, ey: -13.5, eye: [4, 4], my: -9.5, bx: 9, by: -10, mouth: 'v' },
    arms: 11,
  },
  hachiware: {
    color: '#fffdf9',
    body: mochi(0, -12, 12, 10.4),
    back: [
      { shape: mirror((s) => tri(s * 11.8, -15, s * 10.6, -25.5, s * 4.4, -20.6)), color: '#7fa4d3' },
    ],
    // 위는 파랗고, 이마 가운데가 하얀 「八」자로 갈린다.
    paint: [
      {
        shape: (x, y) => y < -16.4 - (Math.abs(x) > 8 ? (Math.abs(x) - 8) * 0.3 : 0) && Math.abs(x) > (y + 22.2) * 0.62,
        color: '#7fa4d3',
        edge: '#5f84b8',
      },
    ],
    face: { ex: 5.5, ey: -13.5, eye: [4, 4], my: -9.5, bx: 9, by: -10, mouth: 'w' },
    arms: 11.5,
  },
  usagi: {
    color: '#fbefc3',
    body: mochi(0, -12.2, 10, 10.6, 2.15),
    back: [
      { shape: mirror((s) => oval(s * 3.4, -27.5, 2.2, 7)), color: '#fbefc3' },
      { shape: mirror((s) => oval(s * 3.4, -27.5, 0.8, 4.8)), color: EAR_PINK, plain: true },
    ],
    face: { ex: 4.5, ey: -13, eye: [2, 2], my: -10, bx: 7.5, by: -10, mouth: 'w', brow: true },
    arms: 9.5,
  },
  momonga: {
    color: '#fffdf9',
    body: mochi(0, -11.5, 11.5, 9.9),
    back: [
      { shape: mochi(-11.5, -13, 4.6, 7.8, 2, 0.25), color: '#bfe6f7' },
      { shape: mirror((s) => circle(s * 8, -20.6, 3)), color: '#fffdf9' },
      { shape: mirror((s) => circle(s * 8, -20.8, 1.2)), color: EAR_PINK, plain: true },
    ],
    face: { ex: 5.5, ey: -13, eye: [4, 5], my: -9, bx: 9.5, by: -9, mouth: 'w', whisker: true },
    arms: 11,
  },
  kurimanju: {
    color: '#fdedd0',
    body: mochi(0, -11.5, 11.5, 9.9),
    back: [],
    paint: [{ shape: (x, y) => y < -15 + ((x & 1) === 0 ? 0.6 : 0), color: '#a9724e', edge: '#86563a' }],
    face: { ex: 4.5, ey: -12, eye: [2, 2], my: -9, bx: 8, by: -9, mouth: 'v' },
    arms: 11,
  },
  rakko: {
    color: '#fbf1d3',
    body: mochi(0, -12, 11, 10.2, 2.1, 0.12),
    back: [
      {
        // 하얀 망토. 어깨에서 아래로 넓게.
        shape: (x, y) => y >= -9 && y <= -1 && Math.abs(x) <= 9.5 + (y + 9) * 0.45,
        color: WHITE,
      },
    ],
    face: { ex: 4.5, ey: -13, eye: [2, 2], my: -9.5, bx: 8, by: -10, mouth: 'line', brows: true, scar: true },
    arms: 10.5,
  },
  shisa: {
    color: '#fdf3dc',
    body: mochi(0, -12, 11.5, 10.3),
    back: [
      {
        shape: mirror((s) => either(circle(s * 9.6, -20, 2.7), circle(s * 11.8, -15.6, 2.8), circle(s * 12.2, -10.8, 2.4))),
        color: '#f19a50',
      },
      // 곱슬마다 가운데에 진한 점 — 말린 털.
      {
        shape: mirror((s) => either(circle(s * 9.6, -20, 0.6), circle(s * 11.8, -15.6, 0.6), circle(s * 12.2, -10.8, 0.6))),
        color: '#c9702c',
        plain: true,
      },
      { shape: mirror((s) => circle(s * 5.6, -22.2, 1.9)), color: '#fdf3dc' },
    ],
    face: { ex: 5.5, ey: -13.5, eye: [4, 4], my: -9.5, bx: 9, by: -10, mouth: 'w', shisaBrow: true },
    arms: 11,
  },
}

export function hasPixel(kind) {
  return kind in KINDS
}

// ─── 칸 그리드

function makeGrid() {
  return new Array(COLS * ROWS).fill(null)
}
const at = (x, y) => (y + OY) * COLS + (x + OX)
const inside = (x, y) => x >= -OX && x <= OX && y >= -OY && y <= 0

/** 부품 하나를 그리드에 얹는다: 바깥 한 칸에 테두리, 안을 색으로. */
function stamp(grid, shape, color, plain = false) {
  const filled = []
  for (let y = -OY; y <= 0; y++) for (let x = -OX; x <= OX; x++) if (shape(x, y)) filled.push([x, y])
  if (!plain) {
    for (const [x, y] of filled) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx
        const ny = y + dy
        if (inside(nx, ny) && !shape(nx, ny)) grid[at(nx, ny)] = INK
      }
    }
  }
  for (const [x, y] of filled) grid[at(x, y)] = color
}

function put(grid, x, y, color) {
  x = Math.round(x)
  y = Math.round(y)
  if (inside(x, y)) grid[at(x, y)] = color
}

/** 팔: 어깨에서 나온 작은 혹. 자세마다 칸 모양이 다르다(오른팔 기준, 왼팔은 뒤집는다). */
const ARM = {
  down: [[0, 0], [1, 0], [1, 1], [1, 2], [2, 2]],
  out: [[0, 0], [1, 0], [2, 0], [2, 1], [3, 1]],
  up: [[0, 0], [1, -1], [1, 0], [2, -2], [2, -1]],
  sit: [[0, 1], [-1, 1], [-1, 2], [-2, 2]],
}

function drawArms(grid, spec, arms) {
  const cells = ARM[arms] || ARM.down
  const y0 = -8
  for (const s of [-1, 1]) {
    const set = new Set(cells.map(([dx, dy]) => `${Math.round(s * (spec.arms + dx))},${y0 + dy}`))
    stamp(grid, (x, y) => set.has(`${x},${y}`), spec.color)
  }
}

/** 다리: 몸 밑 짧은 막대 둘. legs = 'stand' | 'left' | 'right' | 'sit'. */
function drawLegs(grid, spec, legs) {
  for (const s of [-1, 1]) {
    const lift = (legs === 'left' && s < 0) || (legs === 'right' && s > 0) ? 1 : 0
    if (legs === 'sit') {
      stamp(grid, (x, y) => y === -1 && x * s >= 4 && x * s <= 7, spec.color)
    } else {
      stamp(grid, (x, y) => y >= -3 && y <= -1 - lift && x * s >= 3 && x * s <= 5, spec.color)
    }
  }
}

// ─── 얼굴

function drawEyes(grid, f, face) {
  const [w, h] = f.eye
  for (const s of [-1, 1]) {
    const cx = s * f.ex
    const left = Math.round(cx - (w - 1) / 2)
    const top = Math.round(f.ey - (h - 1) / 2)
    const mid = Math.round(f.ey)
    switch (face) {
      case 'blink':
        for (let i = -1; i < w + 1; i++) put(grid, left + i, mid, EYE)
        break
      case 'sleep':
        put(grid, left - 1, mid, EYE)
        for (let i = 0; i < w; i++) put(grid, left + i, mid + 1, EYE)
        put(grid, left + w, mid, EYE)
        break
      case 'joy':
        put(grid, left - 1, mid + 1, EYE)
        for (let i = 0; i < w; i++) put(grid, left + i, mid, EYE)
        put(grid, left + w, mid + 1, EYE)
        break
      case 'squint': {
        // 왼눈 > , 오른눈 <
        const near = s < 0 ? left + w - 1 : left
        const far = s < 0 ? left - 1 : left + w
        put(grid, far, mid - 1, EYE)
        put(grid, near, mid, EYE)
        put(grid, far, mid + 1, EYE)
        break
      }
      case 'cry':
        put(grid, left - 1, mid, EYE)
        for (let i = 0; i < w; i++) put(grid, left + i, mid + 1, EYE)
        put(grid, left + w, mid, EYE)
        for (let i = 2; i <= 4; i++) put(grid, left + (w > 2 ? 1 : 0), mid + i, TEAR)
        break
      default: {
        // 세로로 긴 동그란 눈: 큰 눈은 네 귀퉁이를 깎는다. 반짝이는 오른쪽 위.
        const big = face === 'surprise' ? 1 : 0
        const ww = w + big
        const hh = h + big
        const x0 = left - (big && s < 0 ? 1 : 0)
        const y0 = top - big
        for (let y = 0; y < hh; y++) {
          for (let x = 0; x < ww; x++) {
            const corner = ww >= 3 && hh >= 4 && (y === 0 || y === hh - 1) && (x === 0 || x === ww - 1)
            if (!corner) put(grid, x0 + x, y0 + y, EYE)
          }
        }
        if (ww >= 3) put(grid, x0 + ww - 2, y0 + 1, WHITE)
        if (ww >= 4) put(grid, x0 + 1, y0 + hh - 2, WHITE)
      }
    }
  }
}

function drawMouth(grid, f, face, talking) {
  const y = Math.round(f.my)
  if (face === 'surprise') {
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) put(grid, dx - 0.5, y + dy, EYE)
    return
  }
  if (talking) {
    for (let dx = -1; dx <= 1; dx++) put(grid, dx, y, EYE)
    put(grid, -2, y + 1, EYE)
    for (let dx = -1; dx <= 1; dx++) put(grid, dx, y + 1, MOUTH)
    put(grid, 2, y + 1, EYE)
    for (let dx = -1; dx <= 1; dx++) put(grid, dx, y + 2, EYE)
    return
  }
  if (face === 'cry') {
    for (const [dx, dy] of [[-2, 1], [-1, 0], [0, 1], [1, 0], [2, 1]]) put(grid, dx, y + dy, EYE)
    return
  }
  const shapes = {
    v: [[-1, 0], [0, 1], [1, 0]],
    w: [[-2, 0], [-1, 1], [0, 0], [1, 1], [2, 0]],
    line: [[-1, 0], [0, 0], [1, 0]],
  }
  for (const [dx, dy] of shapes[f.mouth] || shapes.v) put(grid, dx, y + dy, EYE)
}

function drawCheeks(grid, f) {
  for (const s of [-1, 1]) {
    const left = Math.round(s * f.bx - 1.5)
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 4; dx++) {
        put(grid, left + dx, f.by + dy, (dx + dy) % 2 === 1 && dx < 3 ? BLUSH_DARK : BLUSH)
      }
    }
  }
}

function drawExtras(grid, f, face) {
  if (f.brow && face !== 'cry') {
    // 우사기: 눈 위 높이 뜬 눈썹.
    for (const s of [-1, 1]) for (let i = -1; i <= 1; i++) put(grid, s * f.ex + i, f.ey - 3 - (i === 0 ? 1 : 0), EYE)
  }
  if (f.brows) {
    // 랏코: 굵고 곧은 눈썹.
    for (const s of [-1, 1]) for (let i = -1; i <= 1; i++) put(grid, s * (f.ex + i), f.ey - 2 - (i * s < 0 ? 0 : 0), EYE)
  }
  if (f.shisaBrow) {
    for (const s of [-1, 1]) {
      put(grid, s * f.ex - 1, f.ey - 3.5, '#f19a50')
      put(grid, s * f.ex, f.ey - 4.5, '#f19a50')
      put(grid, s * f.ex + 1, f.ey - 3.5, '#f19a50')
    }
  }
  if (f.scar) {
    // 랏코 이마의 별 흉터.
    for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) put(grid, -4 + dx, -18 + dy, INK)
  }
  if (f.whisker) {
    for (const s of [-1, 1]) {
      put(grid, s * 11, -11, INK)
      put(grid, s * 11, -13, INK)
    }
  }
}

// ─── 굽기와 저장

const cache = new Map()

function canvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

/**
 * 한 아이의 한 순간을 1칸 = 1픽셀 캔버스로 굽는다. 같은 조합은 다시 굽지 않는다.
 * arms: down|out|up|sit, legs: stand|left|right|sit, face: expression() 값, talking: 입을 벌렸나.
 */
export function pixelSprite(kind, arms, legs, face, talking) {
  const key = `${kind}|${arms}|${legs}|${face}|${talking ? 1 : 0}`
  let c = cache.get(key)
  if (c) return c
  const spec = KINDS[kind] || KINDS.chiikawa
  const grid = makeGrid()
  for (const part of spec.back) stamp(grid, part.shape, part.color, part.plain)
  drawLegs(grid, spec, legs)
  drawArms(grid, spec, arms)
  stamp(grid, spec.body, spec.color)
  for (const p of spec.paint || []) {
    const paint = (x, y) => spec.body(x, y) && p.shape(x, y)
    for (let y = -OY; y <= 0; y++) {
      for (let x = -OX; x <= OX; x++) {
        if (!paint(x, y)) continue
        const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => spec.body(x + dx, y + dy) && !paint(x + dx, y + dy))
        grid[at(x, y)] = edge ? p.edge : p.color
      }
    }
  }
  drawCheeks(grid, spec.face)
  drawEyes(grid, spec.face, face)
  drawMouth(grid, spec.face, face, talking)
  drawExtras(grid, spec.face, face)

  c = canvas(COLS, ROWS)
  const ctx = c.getContext('2d')
  for (let y = -OY; y <= 0; y++) {
    for (let x = -OX; x <= OX; x++) {
      const color = grid[at(x, y)]
      if (!color) continue
      ctx.fillStyle = color
      ctx.fillRect(x + OX, y + OY, 1, 1)
    }
  }
  cache.set(key, c)
  return c
}

/** 캔버스 크기(칸). 발바닥 줄이 맨 아래, 가운데가 x = 0. */
export const PIXEL_SIZE = { cols: COLS, rows: ROWS }
