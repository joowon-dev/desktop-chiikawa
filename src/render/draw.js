// 아이들을 그린다. 그림 파일 없이 캔버스 도형으로만 — 앱이 가볍고, 크기를 바꿔도 안 깨진다.
//
// 발이 (0, 0) 이고 몸은 위로 CHAR_H(46) 만큼이다. 모든 종이 같은 뼈대(몸통·머리·팔·발·
// 얼굴)를 쓰고, 귀·무늬·꼬리 같은 「그 아이다운 것」만 종마다 따로 얹는다.

const LINE = '#4b3a35'
const BLUSH = 'rgba(255, 140, 160, 0.55)'
const PINK = '#ffc4cf'

const LOOKS = {
  chiikawa: { body: '#ffffff', eye: 2.3 },
  hachiware: { body: '#ffffff', eye: 2.3, cap: '#7f9fcc' },
  usagi: { body: '#f9e7a4', eye: 1.7 },
  momonga: { body: '#ffffff', eye: 3.1 },
  kurimanju: { body: '#f4ddb6', eye: 2.0, cap: '#b7794a' },
  rakko: { body: '#b8a294', eye: 1.9, muzzle: '#f1e8de' },
  shisa: { body: '#f4c96f', eye: 2.4, mane: '#d98f3a' },
}

/**
 * 그림 폴더에서 불러온 그림. 있으면 도형 대신 이걸 그린다. 그림 하나로 걷기·뛰기·앉기를
 * 다 하므로 자세는 늘이고 줄이고 기울이는 것(pose)으로만 낸다.
 */
const sprites = new Map()
export function setSprite(kind, image) {
  sprites.set(kind, image)
}
export function hasDrawing(kind) {
  return sprites.has(kind) || kind in LOOKS
}

/** 그림 높이(px, 배율 1 기준). 도형 아이들과 키를 맞춘다. */
const SPRITE_H = 50

function drawSprite(ctx, ch, image, p) {
  const h = SPRITE_H
  const w = (image.width / image.height) * h // 캔버스(여백을 자른 것)든 Image 든
  ctx.translate(0, -p.lift)
  ctx.rotate(p.rot)
  ctx.scale(p.sx * (ch.facing < 0 ? -1 : 1), p.sy)
  ctx.drawImage(image, -w / 2, -h, w, h)
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

/** 몸 자세. 행동·속도·찌그러짐에서 늘이고 줄이는 값을 뽑는다. */
function pose(ch) {
  let sx = 1
  let sy = 1
  let lift = 0
  let rot = 0
  let step = 0
  let arms = 'down'
  const t = ch.anim

  if (ch.mode === 'air') {
    const stretch = Math.min(0.16, Math.abs(ch.vy) / 4000)
    sy += stretch
    sx -= stretch * 0.6
    arms = ch.vy < 0 ? 'up' : 'out'
  } else {
    switch (ch.action) {
      case 'walk':
        lift = Math.abs(Math.sin(t * 11)) * 2.2
        step = Math.sin(t * 11)
        rot = Math.sin(t * 11) * 0.04
        break
      case 'crouch':
        sy = 0.8
        sx = 1.14
        break
      case 'sit':
        sy = 0.92
        sx = 1.05
        arms = 'sit'
        break
      case 'sleep':
        sy = 0.9 + Math.sin(t * 2) * 0.02
        sx = 1.06
        arms = 'sit'
        break
      case 'cheer':
        lift = Math.abs(Math.sin(t * 9)) * 6
        arms = 'up'
        break
      default:
        sy = 1 + Math.sin(t * 2.4) * 0.015 // 숨쉬기
    }
    if (ch.happy > 0 && ch.action !== 'sleep') {
      arms = 'up'
      lift = Math.max(lift, Math.abs(Math.sin(t * 10)) * 3)
    }
  }

  // 내려앉은 직후 납작.
  if (ch.squash > 0) {
    sy *= 1 - 0.28 * ch.squash
    sx *= 1 + 0.22 * ch.squash
  }
  // 창이 흔들리면 휘청.
  if (ch.shake > 0) {
    rot += Math.sin(t * 38) * 0.22 * (ch.shake / 0.5)
    arms = 'up'
  }
  return { sx, sy, lift, rot, step, arms }
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
  const look = LOOKS[ch.kind] || LOOKS.chiikawa
  const p = pose(ch)

  ctx.save()
  ctx.translate(ch.x, ch.y)
  ctx.scale(scale, scale)

  // 그림자는 자세와 상관없이 창 윗변에 붙는다.
  if (ch.mode === 'ground') {
    ellipse(ctx, 0, 0, 13 * p.sx, 2.6)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.14)'
    ctx.fill()
  }

  const image = sprites.get(ch.kind)
  if (image) {
    drawSprite(ctx, ch, image, p)
    ctx.restore()
    return
  }

  ctx.translate(0, -p.lift)
  ctx.rotate(p.rot)
  ctx.scale(p.sx * (ch.facing < 0 ? -1 : 1), p.sy)
  ctx.lineWidth = 1.5
  ctx.strokeStyle = LINE
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  const sitting = ch.mode === 'ground' && (ch.action === 'sit' || ch.action === 'sleep')

  // 뒤에 있는 것: 꼬리, 귀.
  if (ch.kind === 'momonga') drawMomongaTail(ctx, look, ch)
  drawEars(ctx, ch.kind, look, ch)

  // 발.
  if (sitting) {
    ellipse(ctx, -7, -2.5, 5, 3, -0.3)
    fillStroke(ctx, look.body)
    ellipse(ctx, 7, -2.5, 5, 3, 0.3)
    fillStroke(ctx, look.body)
  } else {
    const a = ch.mode === 'air' ? 1.5 : p.step * 2
    ellipse(ctx, -5.5, -2.2 - Math.max(0, a), 4.5, 2.6)
    fillStroke(ctx, look.body)
    ellipse(ctx, 5.5, -2.2 - Math.max(0, -a), 4.5, 2.6)
    fillStroke(ctx, look.body)
  }

  // 몸통.
  ellipse(ctx, 0, sitting ? -8 : -9.5, 12.5, sitting ? 8 : 9)
  fillStroke(ctx, look.body)

  // 팔.
  drawArms(ctx, look, p.arms, ch)

  // 머리.
  ellipse(ctx, 0, -27, 18.5, 15.5)
  fillStroke(ctx, look.body)
  if (ch.kind === 'hachiware') drawHachiwareCap(ctx, look)
  if (ch.kind === 'kurimanju') drawKurimanjuTop(ctx, look)
  if (ch.kind === 'rakko') drawRakkoFace(ctx, look)

  drawFace(ctx, ch, look)

  ctx.restore()
}

function drawEars(ctx, kind, look, ch) {
  switch (kind) {
    case 'chiikawa':
      // 작고 동그란 곰돌이 귀.
      for (const s of [-1, 1]) {
        ellipse(ctx, s * 10.5, -39.5, 5, 4.6)
        fillStroke(ctx, look.body)
      }
      break
    case 'hachiware':
      // 뾰족한 고양이 귀, 파란색.
      for (const s of [-1, 1]) {
        ctx.beginPath()
        ctx.moveTo(s * 16.5, -34)
        ctx.lineTo(s * 13.5, -48.5)
        ctx.lineTo(s * 4.5, -40)
        ctx.closePath()
        fillStroke(ctx, look.cap)
      }
      break
    case 'usagi': {
      // 긴 귀. 걸을 때 살짝 흔들린다.
      const wob = Math.sin(ch.anim * 6) * 0.08
      for (const s of [-1, 1]) {
        ellipse(ctx, s * 6.5, -50, 4.6, 14, s * (0.12 + wob))
        fillStroke(ctx, look.body)
        ellipse(ctx, s * 6.5, -50, 2, 9, s * (0.12 + wob))
        ctx.fillStyle = PINK
        ctx.fill()
      }
      break
    }
    case 'kurimanju':
      for (const s of [-1, 1]) {
        ellipse(ctx, s * 11, -39, 4.6, 4.2)
        fillStroke(ctx, look.cap)
      }
      break
    case 'rakko':
      for (const s of [-1, 1]) {
        ellipse(ctx, s * 14, -36, 3.6, 3.4)
        fillStroke(ctx, look.body)
      }
      break
    case 'shisa':
      // 머리를 둘러싼 곱슬 갈기.
      for (let i = 0; i < 9; i++) {
        const a = Math.PI * (0.95 + (i / 8) * 1.1)
        ellipse(ctx, Math.cos(a) * 18, -27 + Math.sin(a) * 15.5, 5.2, 5.2)
        fillStroke(ctx, look.mane)
      }
      break
    case 'momonga':
      // 옆으로 넓게 벌어진 귀.
      for (const s of [-1, 1]) {
        ctx.beginPath()
        ctx.moveTo(s * 9, -38)
        ctx.quadraticCurveTo(s * 24, -50, s * 22, -32)
        ctx.closePath()
        fillStroke(ctx, look.body)
        ctx.beginPath()
        ctx.moveTo(s * 11, -37)
        ctx.quadraticCurveTo(s * 21, -45, s * 19.5, -34)
        ctx.closePath()
        ctx.fillStyle = PINK
        ctx.fill()
      }
      break
  }
}

/** 하치와레의 「팔(八)자로 갈린」 파란 머리 무늬. 머리 안쪽으로만 칠한다. */
function drawHachiwareCap(ctx, look) {
  ctx.save()
  ellipse(ctx, 0, -27, 18.5, 15.5)
  ctx.clip()
  ctx.beginPath()
  ctx.moveTo(-20, -23)
  ctx.quadraticCurveTo(-10, -26, -3, -36)
  ctx.lineTo(0, -40)
  ctx.lineTo(3, -36)
  ctx.quadraticCurveTo(10, -26, 20, -23)
  ctx.lineTo(20, -50)
  ctx.lineTo(-20, -50)
  ctx.closePath()
  ctx.fillStyle = look.cap
  ctx.fill()
  ctx.restore()
  // 테두리를 다시 그어 무늬 위로 선이 살게.
  ellipse(ctx, 0, -27, 18.5, 15.5)
  ctx.stroke()
}

/** 쿠리만쥬: 밤만쥬처럼 머리 위가 구운 갈색. */
function drawKurimanjuTop(ctx, look) {
  ctx.save()
  ellipse(ctx, 0, -27, 18.5, 15.5)
  ctx.clip()
  ellipse(ctx, 0, -44, 26, 13)
  ctx.fillStyle = look.cap
  ctx.fill()
  ctx.restore()
  ellipse(ctx, 0, -27, 18.5, 15.5)
  ctx.stroke()
}

/** 랏코: 입 둘레가 밝고, 눈썹이 진하다. */
function drawRakkoFace(ctx, look) {
  ellipse(ctx, 0, -21.5, 8, 5.5)
  ctx.fillStyle = look.muzzle
  ctx.fill()
  ctx.lineWidth = 1.6
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(s * 3.8, -32.5)
    ctx.lineTo(s * 8.8, -31.5)
    ctx.stroke()
  }
  ctx.lineWidth = 1.5
}

function drawMomongaTail(ctx, look, ch) {
  const sway = Math.sin(ch.anim * 3) * 0.12
  ellipse(ctx, -15, -20, 9, 16, -0.5 + sway)
  fillStroke(ctx, look.body)
  // 털 결.
  ctx.beginPath()
  ctx.moveTo(-18, -28)
  ctx.quadraticCurveTo(-14, -22, -17, -15)
  ctx.stroke()
}

function drawArms(ctx, look, arms, ch) {
  for (const s of [-1, 1]) {
    switch (arms) {
      case 'up': {
        const wave = Math.sin(ch.anim * 12 + s) * 0.25
        ellipse(ctx, s * 15, -18, 3.6, 6, s * (-0.7 + wave))
        break
      }
      case 'out':
        ellipse(ctx, s * 15, -12, 3.4, 5.6, s * -1.3)
        break
      case 'sit':
        ellipse(ctx, s * 9, -9, 3.4, 4.6, s * 0.4)
        break
      default:
        ellipse(ctx, s * 12.5, -9.5, 3.4, 5.2, s * 0.35)
    }
    fillStroke(ctx, look.body)
  }
}

function drawFace(ctx, ch, look) {
  const asleep = ch.mode === 'ground' && ch.action === 'sleep'
  const closed = asleep || blinking(ch) || (ch.mode === 'ground' && ch.action === 'crouch')
  const ex = 6.3
  const ey = -27

  // 볼터치.
  for (const s of [-1, 1]) {
    ellipse(ctx, s * 11.5, -22, 3.6, 2.1)
    ctx.fillStyle = BLUSH
    ctx.fill()
  }

  ctx.fillStyle = LINE
  if (closed) {
    ctx.lineWidth = 1.4
    for (const s of [-1, 1]) {
      ctx.beginPath()
      if (asleep) ctx.arc(s * ex, ey - 0.5, 2.6, 0.15 * Math.PI, 0.85 * Math.PI)
      else {
        ctx.moveTo(s * ex - 2.6, ey)
        ctx.lineTo(s * ex + 2.6, ey)
      }
      ctx.stroke()
    }
  } else {
    const r = look.eye
    for (const s of [-1, 1]) {
      ellipse(ctx, s * ex, ey, r, r * 1.25)
      ctx.fillStyle = '#2d2321'
      ctx.fill()
      if (r > 1.9) {
        ellipse(ctx, s * ex + r * 0.3, ey - r * 0.45, r * 0.38, r * 0.38)
        ctx.fillStyle = '#ffffff'
        ctx.fill()
      }
    }
  }

  // 입.
  ctx.lineWidth = 1.3
  const talking = ch.say || ch.action === 'cheer' || ch.happy > 0
  ctx.beginPath()
  if (ch.kind === 'usagi' && talking) {
    // 우사기는 크게 벌린다.
    ctx.ellipse(0, -20.5, 3.8, 3.2, 0, 0, Math.PI)
    ctx.closePath()
    ctx.fillStyle = '#e86a7a'
    ctx.fill()
    ctx.stroke()
  } else if (talking) {
    ctx.ellipse(0, -21, 2.2, 2, 0, 0, Math.PI)
    ctx.closePath()
    ctx.fillStyle = '#e86a7a'
    ctx.fill()
    ctx.stroke()
  } else if (ch.kind === 'hachiware') {
    // ω
    ctx.moveTo(-3, -21.5)
    ctx.quadraticCurveTo(-1.5, -19, 0, -21.5)
    ctx.quadraticCurveTo(1.5, -19, 3, -21.5)
    ctx.stroke()
  } else {
    ctx.moveTo(-1.6, -21)
    ctx.quadraticCurveTo(0, -19.6, 1.6, -21)
    ctx.stroke()
  }
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
