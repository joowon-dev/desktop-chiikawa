// 작은 효과들: 하트·음표·눈물·풀잎·부스러기·입김·반짝이·땀·발밑 먼지.
//
// 월드가 아니라 렌더러 것이다 — 보기 좋으라고 있는 것이라 결정론이 필요 없어서
// Math.random() 을 쓴다(src/game/ 밖이다). 아이의 행동을 보고 매 프레임 조금씩 뿌린다.

import { getScale } from './draw.js'

const NOTE_COLORS = ['#ff7aa8', '#6fa8ff', '#ffb84d', '#8fd16a', '#b98cff']
const SPARKLE_COLORS = ['#ffd86b', '#ff9fb8', '#9fd8ff', '#ffffff']

const particles = []
const MAX = 400

/** 행동마다 1 초에 몇 개를 뿌리나. 소수점 아래는 확률로. */
function rate(ch) {
  const r = {}
  if (ch.mode === 'air') {
    if (ch.spin) r.sparkle = 18
    return r
  }
  switch (ch.action) {
    case 'dance': r.note = 2.6; break
    case 'sing': r.note = 3.2; break
    case 'cry': r.tear = 9; break
    case 'eat': r.crumb = 5; break
    case 'drink': r.breath = 1.1; break
    case 'pose': r.sparkle = 7; break
    case 'train': r.swoosh = 1.6; break
    case 'cheer': r.star = 4; break
    case 'walk': if (ch.kind === 'usagi' || ch.kind === 'rakko') r.dust = 4; break
    case 'weed': {
      // 쑥 뽑는 순간에만 풀잎이 튄다.
      const ph = ((ch.actionAge || 0) * 0.9) % 1
      if (ph > 0.55 && ph < 0.7) r.grass = 40
      break
    }
  }
  if (ch.love > 0) r.heart = 3.5
  if (ch.shake > 0) r.sweat = 6
  return r
}

/** 아이들을 보고 새 효과를 뿌린다. visible(ch) 가 거짓인 아이(창 뒤에 가려진)는 건너뛴다. */
export function emit(chars, dt, visible) {
  const s = getScale()
  for (const ch of chars) {
    if (ch.mode === 'gone' || !visible(ch)) continue
    const f = ch.facing < 0 ? -1 : 1
    const headY = ch.y - 50 * s
    for (const [type, perSecond] of Object.entries(rate(ch))) {
      let n = perSecond * dt
      while (n > 0) {
        if (n < 1 && Math.random() > n) break
        n -= 1
        spawn(type, ch, f, headY, s)
      }
    }
  }
  if (particles.length > MAX) particles.splice(0, particles.length - MAX)
}

function spawn(type, ch, f, headY, s) {
  const r = Math.random
  const base = { type, age: 0, rot: 0, vr: 0, gravity: 0 }
  switch (type) {
    case 'heart':
      particles.push({ ...base, x: ch.x + (r() - 0.5) * 30 * s, y: headY + 4 * s, vx: (r() - 0.5) * 20, vy: -40 - r() * 25,
        life: 1.3, size: (8 + r() * 5) * s, color: r() < 0.5 ? '#ff6b8f' : '#ff9fb8', wobble: r() * 6 })
      break
    case 'note':
      particles.push({ ...base, x: ch.x + f * 12 * s, y: headY + 10 * s, vx: f * (15 + r() * 20), vy: -35 - r() * 20,
        life: 1.5, size: (11 + r() * 5) * s, color: NOTE_COLORS[Math.floor(r() * NOTE_COLORS.length)],
        text: r() < 0.5 ? '♪' : '♫', wobble: r() * 6 })
      break
    case 'tear':
      for (const side of [-1, 1]) {
        particles.push({ ...base, x: ch.x + side * 8 * s, y: headY + 20 * s, vx: side * (30 + r() * 30), vy: -40 - r() * 30,
          gravity: 420, life: 0.7, size: 2.6 * s, color: '#7cc4ff' })
      }
      break
    case 'crumb':
      particles.push({ ...base, x: ch.x + f * 10 * s, y: ch.y - 22 * s, vx: (r() - 0.5) * 60, vy: -30 - r() * 40,
        gravity: 500, life: 0.6, size: 1.6 * s, color: r() < 0.5 ? '#e8c27a' : '#ffffff' })
      break
    case 'breath':
      particles.push({ ...base, x: ch.x + f * 14 * s, y: ch.y - 24 * s, vx: f * 18, vy: -14,
        life: 1.4, size: 4 * s, color: '#ffffff', grow: 6 * s })
      break
    case 'sparkle':
      particles.push({ ...base, x: ch.x + (r() - 0.5) * 50 * s, y: ch.y - r() * 55 * s, vx: 0, vy: -10,
        life: 0.7, size: (3 + r() * 3) * s, color: SPARKLE_COLORS[Math.floor(r() * SPARKLE_COLORS.length)], vr: 3 })
      break
    case 'star':
      particles.push({ ...base, x: ch.x + (r() - 0.5) * 30 * s, y: headY, vx: (r() - 0.5) * 80, vy: -60 - r() * 40,
        gravity: 200, life: 0.9, size: (4 + r() * 2) * s, color: SPARKLE_COLORS[Math.floor(r() * 3)], vr: 5 })
      break
    case 'swoosh':
      particles.push({ ...base, x: ch.x + f * 22 * s, y: ch.y - 26 * s, vx: 0, vy: 0, life: 0.3, size: 20 * s, f })
      break
    case 'dust':
      particles.push({ ...base, x: ch.x - f * 8 * s, y: ch.y - 2, vx: -f * (10 + r() * 15), vy: -8 - r() * 8,
        life: 0.45, size: 3 * s, color: '#ffffff', grow: 3 * s })
      break
    case 'grass':
      particles.push({ ...base, x: ch.x + f * 10 * s, y: ch.y - 2, vx: (r() - 0.3) * f * 120, vy: -120 - r() * 120,
        gravity: 600, life: 0.9, size: (3 + r() * 2.5) * s, color: r() < 0.5 ? '#6cc04a' : '#9ad86a', vr: (r() - 0.5) * 14 })
      break
    case 'sweat':
      particles.push({ ...base, x: ch.x + (r() < 0.5 ? -1 : 1) * 16 * s, y: headY + 6 * s, vx: (r() - 0.5) * 50, vy: -50,
        gravity: 400, life: 0.6, size: 2.4 * s, color: '#9fd8ff' })
      break
  }
}

/** 땅에 떨어진 효과(착지 먼지·튀어나옴 반짝이)를 뿌린다. */
export function burst(type, x, y, n = 8) {
  const s = getScale()
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    particles.push({ type: 'sparkle', age: 0, rot: 0, vr: 4, gravity: 0, x, y: y - 25 * s, vx: Math.cos(a) * 80, vy: Math.sin(a) * 60 - 20,
      life: 0.6, size: 4 * s, color: SPARKLE_COLORS[i % SPARKLE_COLORS.length] })
  }
  if (type === 'heart') {
    for (let i = 0; i < 4; i++) {
      particles.push({ type: 'heart', age: 0, rot: 0, vr: 0, gravity: 0, x: x + (i - 1.5) * 12 * s, y: y - 50 * s, vx: 0, vy: -50,
        life: 1.1, size: 9 * s, color: '#ff6b8f', wobble: i })
    }
  }
}

/** 지금 떠 있는 효과 수. 렌더러가 「그릴 게 없나」를 볼 때 쓴다. */
export function count() {
  return particles.length
}

export function update(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]
    p.age += dt
    if (p.age >= p.life) {
      particles.splice(i, 1)
      continue
    }
    p.vy += (p.gravity || 0) * dt
    p.x += p.vx * dt + (p.wobble != null ? Math.sin(p.age * 6 + p.wobble) * 12 * dt : 0)
    p.y += p.vy * dt
    p.rot += (p.vr || 0) * dt
  }
}

export function draw(ctx) {
  for (const p of particles) {
    const k = p.age / p.life
    ctx.save()
    ctx.globalAlpha = k < 0.15 ? k / 0.15 : 1 - Math.max(0, (k - 0.6) / 0.4)
    ctx.translate(p.x, p.y)
    ctx.rotate(p.rot)
    switch (p.type) {
      case 'heart': heart(ctx, p.size, p.color); break
      case 'note':
        ctx.font = `700 ${p.size}px -apple-system, sans-serif`
        ctx.textAlign = 'center'
        ctx.lineWidth = 2.5
        ctx.strokeStyle = '#ffffff'
        ctx.strokeText(p.text, 0, 0)
        ctx.fillStyle = p.color
        ctx.fillText(p.text, 0, 0)
        break
      case 'tear':
      case 'sweat':
        drop(ctx, p.size, p.color)
        break
      case 'crumb':
        ctx.beginPath()
        ctx.arc(0, 0, p.size, 0, Math.PI * 2)
        ctx.fillStyle = p.color
        ctx.fill()
        break
      case 'breath':
      case 'dust': {
        const r = p.size + (p.grow || 0) * k
        ctx.beginPath()
        ctx.arc(0, 0, r, 0, Math.PI * 2)
        ctx.fillStyle = p.color
        ctx.globalAlpha *= 0.75
        ctx.fill()
        ctx.strokeStyle = 'rgba(75, 58, 53, 0.25)'
        ctx.stroke()
        break
      }
      case 'sparkle':
      case 'star':
        star(ctx, p.size, p.color)
        break
      case 'grass':
        ctx.beginPath()
        ctx.ellipse(0, 0, p.size * 0.45, p.size * 1.3, 0, 0, Math.PI * 2)
        ctx.fillStyle = p.color
        ctx.fill()
        break
      case 'swoosh':
        ctx.beginPath()
        ctx.arc(0, 0, p.size, -Math.PI * 0.8, -Math.PI * 0.1)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
        ctx.lineWidth = 3
        ctx.stroke()
        ctx.strokeStyle = 'rgba(75, 58, 53, 0.35)'
        ctx.lineWidth = 1
        ctx.stroke()
        break
    }
    ctx.restore()
  }
}

function heart(ctx, s, color) {
  ctx.beginPath()
  ctx.moveTo(0, s * 0.35)
  ctx.bezierCurveTo(-s * 1.1, -s * 0.35, -s * 0.5, -s * 1.05, 0, -s * 0.45)
  ctx.bezierCurveTo(s * 0.5, -s * 1.05, s * 1.1, -s * 0.35, 0, s * 0.35)
  ctx.fillStyle = color
  ctx.fill()
  ctx.lineWidth = 1
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
  ctx.stroke()
}

function drop(ctx, s, color) {
  ctx.beginPath()
  ctx.moveTo(0, -s * 1.6)
  ctx.quadraticCurveTo(s, 0, 0, s)
  ctx.quadraticCurveTo(-s, 0, 0, -s * 1.6)
  ctx.fillStyle = color
  ctx.fill()
}

function star(ctx, r, color) {
  ctx.beginPath()
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2
    const rr = i % 2 ? r * 0.4 : r
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
  }
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
}
