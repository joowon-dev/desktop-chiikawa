// 아이들을 그린다. 그림 파일 없이 캔버스 도형으로만 — 앱이 가볍고, 크기를 바꿔도 안 깨진다.
//
// 발이 (0, 0) 이고 몸은 위로 CHAR_H(46) 만큼이다. 모든 종이 같은 뼈대(몸통·머리·팔·발·
// 얼굴)를 쓰고, 귀·무늬·꼬리 같은 「그 아이다운 것」만 종마다 따로 얹는다.

import { CELL, PIXEL_SIZE, hasPixel, pixelSprite } from './pixel.js'

const LINE = '#4a3a36'

/**
 * 그림 폴더에서 불러온 그림. 있으면 도형 대신 이걸 그린다. 그림 하나로 걷기·뛰기·앉기를
 * 다 하므로 자세는 늘이고 줄이고 기울이는 것(pose)으로만 낸다.
 */
const sprites = new Map()
export function setSprite(kind, image) {
  sprites.set(kind, image)
}
export function hasDrawing(kind) {
  return sprites.has(kind) || hasPixel(kind)
}

/** 그림 높이(px, 배율 1 기준). 도형 아이들과 키를 맞춘다. */
const SPRITE_H = 50

function drawSprite(ctx, ch, image, p, h = SPRITE_H) {
  const w = (image.width / image.height) * h // 캔버스(여백을 자른 것)든 Image 든
  const f = ch.facing < 0 ? -1 : 1
  if (p.lie > 0) {
    // 누워 자기: 발을 축으로 옆으로 눕는다. 다 누우면 키가 w 인 가로 그림이 된다.
    const a = (Math.PI / 2) * p.lie * -f
    const cy = -h / 2 + (h / 2 - w / 2) * p.lie // 그림 중심의 높이를 서서히 내린다
    ctx.translate(0, cy)
    ctx.rotate(a)
    ctx.scale(f * p.sx, p.sy)
    ctx.drawImage(image, -w / 2, -h / 2, w, h)
    return
  }
  // 회전 축을 몸 가운데로 — 발로 돌리면 공중제비가 발을 축으로 돈다.
  const spinning = ch.mode === 'air' && ch.spin
  ctx.translate(0, -p.lift - (spinning ? h / 2 : 0))
  ctx.rotate(p.rot)
  ctx.scale(p.sx * f, p.sy)
  ctx.drawImage(image, -w / 2, spinning ? -h / 2 : -h, w, h)
}

/** 손에 든 것(먹을 것·잔·칼). 그림 문자로 그린다. 아이의 앞쪽 손 높이에. */
export function drawProp(ctx, ch) {
  if (ch.mode !== 'ground' || !ch.prop) return
  if (ch.action !== 'eat' && ch.action !== 'drink' && ch.action !== 'train') return
  const f = ch.facing < 0 ? -1 : 1
  const t = ch.anim
  const age = ch.actionAge || 0
  let x = f * 21
  let y = -20
  let rot = 0
  let size = 16
  if (ch.action === 'eat') {
    // 입으로 가져갔다 내렸다.
    const up = Math.max(0, Math.sin(t * 4.5))
    x = f * (21 - up * 8)
    y = -18 - up * 10
  } else if (ch.action === 'drink') {
    const ph = (age * 0.5) % 1
    const up = ph < 0.4 ? Math.sin((ph / 0.4) * Math.PI) : 0
    x = f * (21 - up * 8)
    y = -20 - up * 12
    rot = -f * up * 0.9
  } else {
    const ph = (age * 1.6) % 1
    rot = ph < 0.25 ? f * (-0.9 + (ph / 0.25) * 2.4) : f * -0.5
    x = f * 30 // 몸 밖으로 — 몸 너비 절반이 25px 남짓이다
    y = -22
    size = 18
  }
  ctx.save()
  ctx.translate(ch.x + x * scale, ch.y + y * scale)
  ctx.rotate(rot)
  ctx.font = `${size * scale}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  if (f < 0 && ch.action === 'train') ctx.scale(-1, 1)
  ctx.fillText(ch.prop, 0, 0)
  ctx.restore()
}

/** 놀람 「!」. 머리 위에 통 튀어나왔다 사라진다. */
export function drawExclaim(ctx, ch) {
  if (!ch.exclaim) return
  const k = ch.exclaim
  const pop = k > 0.85 ? (1 - k) / 0.15 : 1
  ctx.save()
  ctx.globalAlpha = Math.min(1, k * 3)
  ctx.translate(ch.x + (ch.say ? -20 : 14) * scale, ch.y - (SPRITE_H + 10) * scale) // 말풍선이 있으면 왼쪽으로 비킨다
  ctx.scale(pop, pop)
  ctx.font = `900 ${18 * scale}px -apple-system, sans-serif`
  ctx.textAlign = 'center'
  ctx.lineWidth = 3
  ctx.strokeStyle = '#ffffff'
  ctx.strokeText('!', 0, 0)
  ctx.fillStyle = '#e8434f'
  ctx.fillText('!', 0, 0)
  ctx.restore()
}

export function getScale() {
  return scale
}

function ellipse(ctx, x, y, rx, ry, rot = 0) {
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2)
}

function fillStroke(ctx, fill) {
  ctx.fillStyle = fill
  ctx.fill()
  ctx.stroke()
}

/** 몸 자세. 행동·속도·찌그러짐에서 늘이고 줄이고 기울이는 값을 뽑는다. 도형·그림 둘 다 쓴다. */
function pose(ch) {
  let sx = 1
  let sy = 1
  let lift = 0
  let rot = 0
  let step = 0
  let arms = 'down'
  let lie = 0 // 0 서 있음 … 1 완전히 누움
  const t = ch.anim
  const age = ch.actionAge || 0
  const f = ch.facing < 0 ? -1 : 1

  if (ch.mode === 'air') {
    const stretch = Math.min(0.16, Math.abs(ch.vy) / 4000)
    sy += stretch
    sx -= stretch * 0.6
    arms = ch.vy < 0 ? 'up' : 'out'
    if (ch.spin) rot += ch.spin * ch.airT // 공중제비
  } else {
    switch (ch.action) {
      case 'walk': {
        // 뒤뚱뒤뚱: 좌우로 기울며 통통.
        const w = Math.sin(t * 11)
        lift = Math.abs(w) * 3
        step = w
        rot = w * 0.09
        break
      }
      case 'crouch':
        sy = 0.78
        sx = 1.16
        break
      case 'sit':
        // 털썩 앉았다가 숨쉬기.
        sy = 0.86 + Math.min(1, age * 6) * 0 + Math.sin(t * 2) * 0.012
        sx = 1.09
        if (age < 0.15) { sy = 0.75; sx = 1.18 }
        arms = 'sit'
        break
      case 'sleep':
        lie = Math.min(1, age / 0.5)
        sy = 1 + Math.sin(t * 1.6) * 0.03 // 새근새근
        arms = 'sit'
        break
      case 'cheer':
        lift = Math.abs(Math.sin(t * 9)) * 7
        arms = 'up'
        break
      case 'dance': {
        const b = Math.sin(t * 8)
        rot = b * 0.28
        lift = Math.abs(Math.cos(t * 8)) * 6
        sx = 1 + Math.cos(t * 16) * 0.05
        arms = 'up'
        break
      }
      case 'eat':
        // 냠냠: 위아래로 오물오물.
        sy = 1 - Math.abs(Math.sin(t * 9)) * 0.07
        sx = 1 + Math.abs(Math.sin(t * 9)) * 0.04
        break
      case 'cry':
        rot = Math.sin(t * 34) * 0.035
        sy = 0.95
        break
      case 'weed': {
        // 쭈그려 잡고(0~0.55) → 쑥 뽑고(0.55~0.75) → 숨 고르기.
        const ph = (age * 0.9) % 1
        if (ph < 0.55) {
          sy = 0.84
          sx = 1.08
          rot = f * 0.32
        } else if (ph < 0.75) {
          const k = (ph - 0.55) / 0.2
          lift = Math.sin(k * Math.PI) * 9
          rot = f * (0.32 - k * 0.6)
          sy = 1.08
          arms = 'up'
        } else {
          rot = -f * 0.08
        }
        break
      }
      case 'sing':
        rot = Math.sin(t * 3) * 0.14
        lift = Math.abs(Math.sin(t * 6)) * 2
        sy = 1 + Math.sin(t * 6) * 0.03
        break
      case 'drink': {
        // 꿀꺽(뒤로 젖힘) → 하~
        const ph = (age * 0.5) % 1
        rot = ph < 0.4 ? -f * 0.22 * Math.sin((ph / 0.4) * Math.PI) : 0
        sy = ph > 0.45 && ph < 0.7 ? 1.06 : 1
        break
      }
      case 'pose':
        rot = f * 0.16
        sx = 1.04
        lift = age < 0.2 ? Math.sin((age / 0.2) * Math.PI) * 8 : 0
        arms = 'up'
        break
      case 'train': {
        // 휘두르기: 빠르게 기울였다 돌아오고, 가끔 뛰어오른다.
        const ph = (age * 1.6) % 1
        rot = ph < 0.25 ? f * Math.sin((ph / 0.25) * Math.PI) * 0.4 : 0
        lift = ph > 0.5 && ph < 0.7 ? Math.sin(((ph - 0.5) / 0.2) * Math.PI) * 10 : 0
        break
      }
      default:
        sy = 1 + Math.sin(t * 2.4) * 0.015 // 숨쉬기
    }
    if (ch.happy > 0 && ch.action !== 'sleep') {
      arms = 'up'
      lift = Math.max(lift, Math.abs(Math.sin(t * 10)) * 4)
    }
  }

  // 내려앉은 직후 납작.
  if (ch.squash > 0) {
    sy *= 1 - 0.3 * ch.squash
    sx *= 1 + 0.24 * ch.squash
  }
  // 창이 흔들리면 휘청.
  if (ch.shake > 0) {
    rot += Math.sin(t * 38) * 0.25 * (ch.shake / 0.5)
    arms = 'up'
  }
  return { sx, sy, lift, rot, step, arms, lie }
}

/** 눈을 감고 있나. 아이마다 다른 박자로 깜박인다. */
function blinking(ch) {
  const period = 3.2 + (ch.id % 5) * 0.37
  return (ch.anim % period) < 0.12
}

/**
 * 그리는 크기 배율. 메뉴의 「크기」. **그림만** 키운다 — 월드(걷기·가림 판정)는 기본
 * 크기로 계산하므로, 크게 하면 앞 창 가장자리에서 조금 더 일찍 잘려 보일 뿐이다.
 */
let scale = 1
export function setScale(value) {
  scale = value
}

export function drawChar(ctx, ch) {
  const p = pose(ch)

  ctx.save()
  ctx.translate(ch.x, ch.y)
  ctx.scale(scale, scale)

  // 그림자는 자세와 상관없이 창 윗변에 붙는다.
  if (ch.mode === 'ground') {
    ellipse(ctx, 0, 0, 14 * p.sx, 2.6)
    ctx.fillStyle = 'rgba(40, 30, 30, 0.13)'
    ctx.fill()
  }

  const image = sprites.get(ch.kind)
  if (image) {
    drawSprite(ctx, ch, image, p)
    ctx.restore()
    return
  }

  // 그림이 없으면 픽셀 아트로. 자세(눕기·공중제비·늘이고 줄이기)는 그림과 같은 길로 낸다.
  const sitting = ch.mode === 'ground' && (ch.action === 'sit' || ch.action === 'sleep')
  const legs = sitting ? 'sit' : ch.mode === 'air' ? 'stand' : p.step > 0.35 ? 'left' : p.step < -0.35 ? 'right' : 'stand'
  const face = expression(ch)
  const talking = !!ch.say || face === 'joy' || face === 'sing'
  const sprite = pixelSprite(ch.kind, p.arms, legs, face, talking)
  ctx.imageSmoothingEnabled = false
  drawSprite(ctx, ch, sprite, p, PIXEL_SIZE.rows * CELL)
  ctx.restore()
}

/** 지금 얼굴. 행동과 기분에서 고른다. */
function expression(ch) {
  const ground = ch.mode === 'ground'
  if (ground && ch.action === 'sleep') return 'sleep'
  if (ground && ch.action === 'cry') return 'cry'
  if (ch.shake > 0) return 'squint'
  if (ground && ch.action === 'crouch') return 'squint'
  if (ground && ch.action === 'weed' && ((ch.actionAge || 0) * 0.9) % 1 < 0.75) return 'squint'
  if (ch.exclaim > 0.5) return 'surprise'
  if (ground && (ch.action === 'cheer' || ch.action === 'dance')) return 'joy'
  if (ch.happy > 0) return 'joy'
  if (ground && ch.action === 'sing') return 'sing'
  if (blinking(ch)) return 'blink'
  return 'open'
}

/** 말풍선. 아이 머리 위에. */
export function drawBubble(ctx, ch) {
  if (!ch.say) return
  const text = ch.say.text
  const alpha = Math.min(1, ch.say.t * 4)
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.font = '600 12px -apple-system, "Apple SD Gothic Neo", "Hiragino Sans", sans-serif'
  const w = Math.ceil(ctx.measureText(text).width) + 14
  const h = 22
  const top = (ch.kind === 'usagi' ? 70 : 58) * scale
  const x = ch.x - w / 2
  const y = ch.y - top - h
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 10)
  ctx.moveTo(ch.x - 4, y + h)
  ctx.lineTo(ch.x, y + h + 6)
  ctx.lineTo(ch.x + 4, y + h)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
  ctx.strokeStyle = LINE
  ctx.lineWidth = 1.2
  ctx.fill()
  ctx.stroke()
  // 꼬리와 상자가 만나는 줄을 지운다.
  ctx.fillRect(ch.x - 3.4, y + h - 1.4, 6.8, 2)
  ctx.fillStyle = LINE
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, ch.x, y + h / 2 + 0.5)
  ctx.restore()
}

/** 자는 아이 머리 위 Zz. */
export function drawZzz(ctx, ch) {
  if (ch.mode !== 'ground' || ch.action !== 'sleep') return
  ctx.save()
  ctx.fillStyle = LINE
  ctx.font = '700 11px -apple-system, sans-serif'
  for (let i = 0; i < 3; i++) {
    const phase = (ch.anim * 0.6 + i / 3) % 1
    ctx.globalAlpha = Math.sin(phase * Math.PI) * 0.8
    ctx.fillText('z', ch.x + (12 + phase * 14) * scale, ch.y - (44 + phase * 22) * scale)
  }
  ctx.restore()
}

/** 착지·튀어나옴·사라짐 효과. fx = { type, x, y, age }. */
export function drawEffect(ctx, fx) {
  const k = fx.age / fx.life
  ctx.save()
  if (fx.type === 'pop') {
    // 반짝이 여섯 개가 퍼지며 사라진다.
    ctx.globalAlpha = 1 - k
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3
      const r = 10 + k * 34
      star(ctx, fx.x + Math.cos(a) * r, fx.y - 22 + Math.sin(a) * r * 0.7, 4 * (1 - k * 0.5), i % 2 ? '#ffd86b' : '#ff9fb8')
    }
  } else if (fx.type === 'land') {
    ctx.globalAlpha = 0.5 * (1 - k)
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = 'rgba(75, 58, 53, 0.4)'
    for (const s of [-1, 1]) {
      ellipse(ctx, fx.x + s * (12 + k * 14), fx.y - 3 - k * 4, 4 + k * 3, 3 + k * 2)
      ctx.fill()
      ctx.stroke()
    }
  } else if (fx.type === 'puff') {
    ctx.globalAlpha = 0.7 * (1 - k)
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = 'rgba(75, 58, 53, 0.5)'
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2
      ellipse(ctx, fx.x + Math.cos(a) * (8 + k * 16), fx.y + Math.sin(a) * (8 + k * 12), 7 + k * 4, 6 + k * 3)
      ctx.fill()
      ctx.stroke()
    }
  }
  ctx.restore()
}

function star(ctx, x, y, r, color) {
  ctx.beginPath()
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2
    const rr = i % 2 ? r * 0.4 : r
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
  }
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
}

export const EFFECT_LIFE = { pop: 0.6, land: 0.35, puff: 0.5 }
