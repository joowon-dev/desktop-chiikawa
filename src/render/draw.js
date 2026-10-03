// 아이들을 그린다. 그림 파일 없이 캔버스 도형으로만 — 앱이 가볍고, 크기를 바꿔도 안 깨진다.
//
// 발이 (0, 0) 이고 몸은 위로 CHAR_H(46) 만큼이다. 모든 종이 같은 뼈대(몸통·머리·팔·발·
// 얼굴)를 쓰고, 귀·무늬·꼬리 같은 「그 아이다운 것」만 종마다 따로 얹는다.

const LINE = '#4a3a36'
const LW = 1.6
const EYE = '#2b2220'
const BLUSH = 'rgba(255, 150, 172, 0.6)'
const BLUSH_LINE = 'rgba(226, 92, 124, 0.75)'
const MOUTH = '#ef7f8f'
const TEAR = 'rgba(120, 190, 240, 0.9)'

const LOOKS = {
  chiikawa: { body: '#fffdf9', eye: 2.4 },
  hachiware: { body: '#fffdf9', eye: 2.4, cap: '#7fa4d3' },
  usagi: { body: '#fbefc3', eye: 1.5 },
  momonga: { body: '#fffdf9', eye: 3.1 },
  kurimanju: { body: '#fdedd0', eye: 1.6, cap: '#a9724e' },
  rakko: { body: '#fbf1d3', eye: 1.6 },
  shisa: { body: '#fdf3dc', eye: 2.2, mane: '#f19a50' },
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
  const look = LOOKS[ch.kind] || LOOKS.chiikawa
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

  const f = ch.facing < 0 ? -1 : 1
  if (p.lie > 0) {
    // 누워 자기: 몸 가운데를 축으로 옆으로 눕고, 다 누우면 몸 너비의 절반 높이에 뜬다.
    ctx.translate(0, -25 + 6 * p.lie)
    ctx.rotate((Math.PI / 2) * p.lie * -f)
    ctx.translate(0, 25)
  }
  ctx.translate(0, -p.lift)
  ctx.rotate(p.rot)
  ctx.scale(p.sx * f, p.sy)
  ctx.lineWidth = LW
  ctx.strokeStyle = LINE
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  const sitting = ch.mode === 'ground' && (ch.action === 'sit' || ch.action === 'sleep')

  // 뒤에 있는 것.
  if (ch.kind === 'momonga') drawMomongaTail(ctx, ch)
  if (ch.kind === 'rakko') drawRakkoCape(ctx)
  drawEars(ctx, ch.kind, look, ch)
  if (ch.kind === 'shisa') drawShisaMane(ctx, look)

  // 몸 — 머리·몸통·발을 **한 덩어리**로. 겹친 곳에 선이 안 생기게 테두리를 두껍게 먼저 긋고
  // 그 위를 칠한다. 찹쌀떡처럼 머리와 몸이 붙어 보이는 것이 이 그림체의 반이다.
  const fluffy = ch.kind === 'rakko'
  const parts = [
    (c) => (fluffy ? fluff(c, 0, -27, 19.5, 15.5, 30, 0.9) : ellipse(c, 0, -27, 19.5, 15.5)),
    (c) => (fluffy ? fluff(c, 0, -11.5, 16.5, 11.5, 22, 0.8) : ellipse(c, 0, -11.5, 16.5, 11.5)),
  ]
  if (sitting) {
    parts.push((c) => ellipse(c, -8, -2.4, 5, 2.8, -0.25), (c) => ellipse(c, 8, -2.4, 5, 2.8, 0.25))
  } else {
    const a = ch.mode === 'air' ? 1.5 : p.step * 2
    parts.push(
      (c) => ellipse(c, -6, -2.2 - Math.max(0, a), 4.6, 2.6),
      (c) => ellipse(c, 6, -2.2 - Math.max(0, -a), 4.6, 2.6),
    )
  }
  blob(ctx, parts, look.body)

  if (ch.kind === 'hachiware') drawHachiwareCap(ctx, look)
  if (ch.kind === 'kurimanju') drawKurimanjuTop(ctx, look)
  if (ch.kind === 'rakko') drawRakkoMarks(ctx)

  drawArms(ctx, look, p.arms, ch)
  drawFace(ctx, ch, look)

  ctx.restore()
}

/** 여러 도형을 한 덩어리로 칠한다 — 겹친 안쪽에는 선이 남지 않는다. */
function blob(ctx, parts, fill) {
  const lw = ctx.lineWidth
  ctx.lineWidth = lw * 2
  for (const part of parts) {
    part(ctx)
    ctx.stroke()
  }
  ctx.lineWidth = lw
  ctx.fillStyle = fill
  for (const part of parts) {
    part(ctx)
    ctx.fill()
  }
}

/** 복슬복슬한 테두리의 타원 — 바깥으로 작은 털 뭉치가 n 개. */
function fluff(ctx, cx, cy, rx, ry, n, amp) {
  ctx.beginPath()
  for (let i = 0; i <= n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2
    const r = i % 2 ? 1 : 1 + amp / Math.min(rx, ry)
    const x = cx + Math.cos(a) * rx * r
    const y = cy + Math.sin(a) * ry * r
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
}

function drawEars(ctx, kind, look, ch) {
  switch (kind) {
    case 'chiikawa':
      // 머리 위에 반쯤 묻힌 작고 동그란 귀.
      for (const s of [-1, 1]) {
        ellipse(ctx, s * 11, -40, 5, 4.6)
        fillStroke(ctx, look.body)
      }
      break
    case 'hachiware':
      // 뾰족한 고양이 귀. 파랗고 안쪽은 조금 밝다.
      for (const s of [-1, 1]) {
        ctx.beginPath()
        ctx.moveTo(s * 18, -31)
        ctx.quadraticCurveTo(s * 17.5, -44, s * 14.5, -48)
        ctx.quadraticCurveTo(s * 9, -44, s * 4, -40)
        ctx.closePath()
        fillStroke(ctx, look.cap)
      }
      break
    case 'usagi': {
      // 가늘고 긴 귀가 쫑긋. 살짝 흔들린다.
      const wob = Math.sin(ch.anim * 6) * 0.07
      for (const s of [-1, 1]) {
        ctx.save()
        ctx.translate(s * 6, -38)
        ctx.rotate(s * (0.06 + wob))
        ctx.beginPath()
        ctx.moveTo(-3.6, 2)
        ctx.bezierCurveTo(-4.6, -12, -3.6, -24, 0, -26)
        ctx.bezierCurveTo(3.6, -24, 4.6, -12, 3.6, 2)
        ctx.closePath()
        fillStroke(ctx, look.body)
        ctx.restore()
      }
      break
    }
    case 'momonga':
      // 동그랗고 큰 귀, 안쪽에 선 하나.
      for (const s of [-1, 1]) {
        ellipse(ctx, s * 12.5, -39, 5.8, 5.6, s * 0.3)
        fillStroke(ctx, look.body)
        ctx.beginPath()
        ctx.arc(s * 12.5, -38.5, 2.8, Math.PI * 0.9, Math.PI * 2.1)
        ctx.stroke()
      }
      break
    case 'rakko':
      for (const s of [-1, 1]) {
        ellipse(ctx, s * 13, -39, 3.4, 3)
        fillStroke(ctx, look.body)
      }
      break
    case 'shisa':
      // 작은 귀, 안쪽이 주황.
      for (const s of [-1, 1]) {
        ellipse(ctx, s * 10.5, -40.5, 4.6, 4.2)
        fillStroke(ctx, look.body)
        ellipse(ctx, s * 10.5, -40.5, 2.2, 2)
        ctx.fillStyle = look.mane
        ctx.fill()
      }
      break
    // 쿠리만쥬는 귀가 없다 — 밤만쥬다.
  }
}

/** 하치와레의 머리 무늬: 위는 파랗고, 이마 가운데에서 하얀 「八」자로 갈린다. */
function drawHachiwareCap(ctx, look) {
  ctx.save()
  ellipse(ctx, 0, -27, 19.5, 15.5)
  ctx.clip()
  ctx.beginPath()
  ctx.moveTo(-21, -29)
  ctx.bezierCurveTo(-14, -30, -6, -32, -1.6, -38.5)
  ctx.quadraticCurveTo(0, -40.5, 1.6, -38.5)
  ctx.bezierCurveTo(6, -32, 14, -30, 21, -29)
  ctx.lineTo(21, -50)
  ctx.lineTo(-21, -50)
  ctx.closePath()
  ctx.fillStyle = look.cap
  ctx.fill()
  ctx.stroke()
  ctx.restore()
  // 테두리를 다시 그어 무늬 위로 선이 살게.
  ellipse(ctx, 0, -27, 19.5, 15.5)
  ctx.stroke()
}

/** 쿠리만쥬: 밤만쥬처럼 머리 위가 구운 갈색이고, 경계가 살짝 울퉁불퉁하다. */
function drawKurimanjuTop(ctx, look) {
  ctx.save()
  ellipse(ctx, 0, -27, 19.5, 15.5)
  ctx.clip()
  ctx.beginPath()
  ctx.moveTo(-22, -31)
  for (let i = 0; i <= 8; i++) {
    const x = -22 + (44 * i) / 8
    ctx.quadraticCurveTo(x - 2.75, -33.5 + (i % 2) * 1.2, x, -32 - Math.sin((i / 8) * Math.PI) * 2.5)
  }
  ctx.lineTo(22, -50)
  ctx.lineTo(-22, -50)
  ctx.closePath()
  ctx.fillStyle = look.cap
  ctx.fill()
  ctx.stroke()
  // 구운 윤기.
  ellipse(ctx, -7, -39, 4, 1.4, -0.2)
  ctx.fillStyle = 'rgba(255, 235, 210, 0.55)'
  ctx.fill()
  ctx.restore()
  ellipse(ctx, 0, -27, 19.5, 15.5)
  ctx.stroke()
}

/** 랏코: 이마의 별 모양 흉터와 진한 눈썹. */
function drawRakkoMarks(ctx) {
  ctx.save()
  ctx.lineWidth = 1.1
  ctx.translate(-6, -35)
  ctx.beginPath()
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 4
    const r = i % 2 ? 1.1 : 3.4
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  ctx.closePath()
  ctx.stroke()
  ctx.restore()
  ctx.save()
  ctx.lineWidth = 2
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(s * 4, -29.5)
    ctx.lineTo(s * 10, -30.5)
    ctx.stroke()
  }
  ctx.restore()
}

/** 랏코의 하얀 망토. 어깨에서 아래로 넓게 퍼진다. */
function drawRakkoCape(ctx) {
  ctx.beginPath()
  ctx.moveTo(-14, -21)
  ctx.quadraticCurveTo(-23, -12, -22, -1)
  ctx.quadraticCurveTo(0, 1.5, 22, -1)
  ctx.quadraticCurveTo(23, -12, 14, -21)
  ctx.closePath()
  fillStroke(ctx, '#ffffff')
}

/** 시사의 주황 곱슬 갈기 — 머리 양옆에 소용돌이 셋씩. */
function drawShisaMane(ctx, look) {
  for (const s of [-1, 1]) {
    for (const [x, y, r] of [[17, -35, 5], [20.5, -27, 5.6], [18, -18.5, 5]]) {
      ellipse(ctx, s * x, y, r, r)
      fillStroke(ctx, look.mane)
      ctx.beginPath()
      ctx.arc(s * x, y, r * 0.45, 0, Math.PI * 1.4)
      ctx.stroke()
    }
  }
}

/** 모몽가의 크고 복슬한 하늘색 꼬리. 등 뒤에서 살랑. */
function drawMomongaTail(ctx, ch) {
  const sway = Math.sin(ch.anim * 3) * 0.12
  ctx.save()
  ctx.translate(-14, -14)
  ctx.rotate(-0.55 + sway)
  fluff(ctx, 0, -10, 8.5, 15, 14, 2)
  fillStroke(ctx, '#bfe6f7')
  ctx.restore()
}

function drawArms(ctx, look, arms, ch) {
  for (const s of [-1, 1]) {
    switch (arms) {
      case 'up': {
        const wave = Math.sin(ch.anim * 12 + s) * 0.25
        ellipse(ctx, s * 17.5, -19.5, 3.4, 5.6, s * (-0.75 + wave))
        break
      }
      case 'out':
        ellipse(ctx, s * 18, -13.5, 3.2, 5.2, s * -1.3)
        break
      case 'sit':
        ellipse(ctx, s * 9.5, -10, 3.2, 4.4, s * 0.45)
        break
      default:
        ellipse(ctx, s * 15.5, -12, 3.2, 4.8, s * 0.5)
    }
    fillStroke(ctx, look.body)
  }
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

function drawFace(ctx, ch, look) {
  const face = expression(ch)
  const ex = 7.6
  const ey = -25

  // 볼터치 — 분홍 타원에 빗금 셋.
  for (const s of [-1, 1]) {
    ellipse(ctx, s * 12.8, -20.2, 3.6, 2.2)
    ctx.fillStyle = BLUSH
    ctx.fill()
    ctx.save()
    ctx.lineWidth = 0.6
    ctx.strokeStyle = BLUSH_LINE
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath()
      ctx.moveTo(s * 12.8 + i * 1.6 - 0.7, -19.2)
      ctx.lineTo(s * 12.8 + i * 1.6 + 0.7, -21.2)
      ctx.stroke()
    }
    ctx.restore()
  }

  ctx.save()
  ctx.lineWidth = 1.4
  const r = look.eye
  switch (face) {
    case 'sleep':
      for (const s of [-1, 1]) {
        ctx.beginPath()
        ctx.arc(s * ex, ey - 1, 2.6, 0.15 * Math.PI, 0.85 * Math.PI)
        ctx.stroke()
      }
      break
    case 'blink':
      for (const s of [-1, 1]) {
        ctx.beginPath()
        ctx.moveTo(s * ex - 2.4, ey)
        ctx.lineTo(s * ex + 2.4, ey)
        ctx.stroke()
      }
      break
    case 'squint':
      // > <
      for (const s of [-1, 1]) {
        ctx.beginPath()
        ctx.moveTo(s * ex + s * 2.4, ey - 2.4)
        ctx.lineTo(s * ex - s * 1.8, ey)
        ctx.lineTo(s * ex + s * 2.4, ey + 2.4)
        ctx.stroke()
      }
      break
    case 'joy':
      // ^ ^
      for (const s of [-1, 1]) {
        ctx.beginPath()
        ctx.arc(s * ex, ey + 1.2, 2.6, 1.15 * Math.PI, 1.85 * Math.PI)
        ctx.stroke()
      }
      break
    case 'cry':
      // 꾹 감은 눈에서 눈물이 줄줄.
      for (const s of [-1, 1]) {
        ctx.beginPath()
        ctx.moveTo(s * ex - 2.6, ey - 0.6)
        ctx.quadraticCurveTo(s * ex, ey + 1.4, s * ex + 2.6, ey - 0.6)
        ctx.stroke()
        const drip = (ch.anim * 2.2) % 1
        ctx.fillStyle = TEAR
        ctx.beginPath()
        ctx.roundRect(s * ex - 1.3, ey + 0.8, 2.6, 4 + drip * 4, 1.3)
        ctx.fill()
      }
      break
    default:
      drawEyes(ctx, r, ex, ey, face === 'surprise' ? 1.25 : 1)
  }
  ctx.restore()

  // 입.
  ctx.save()
  ctx.lineWidth = 1.3
  const talking = ch.say || face === 'joy' || face === 'sing'
  const my = -20.4
  ctx.beginPath()
  if (face === 'cry') {
    // 울먹울먹 물결 입.
    ctx.moveTo(-3, my)
    for (let i = 1; i <= 4; i++) ctx.lineTo(-3 + i * 1.5, my + (i % 2 ? -1 : 0))
    ctx.stroke()
  } else if (face === 'surprise') {
    ellipse(ctx, 0, my, 1.6, 1.9)
    ctx.fillStyle = MOUTH
    ctx.fill()
    ctx.stroke()
  } else if (talking) {
    const w = ch.kind === 'usagi' ? 4.2 : 2.6
    const h = ch.kind === 'usagi' ? 4.2 : 2.6
    ctx.moveTo(-w, my - 0.6)
    ctx.quadraticCurveTo(0, my - 1.4, w, my - 0.6)
    ctx.quadraticCurveTo(w * 0.9, my + h, 0, my + h)
    ctx.quadraticCurveTo(-w * 0.9, my + h, -w, my - 0.6)
    ctx.closePath()
    ctx.fillStyle = MOUTH
    ctx.fill()
    ctx.stroke()
  } else if (ch.kind === 'hachiware' || ch.kind === 'shisa') {
    // ω
    ctx.moveTo(-3.2, my - 0.6)
    ctx.quadraticCurveTo(-1.6, my + 1.8, 0, my - 0.6)
    ctx.quadraticCurveTo(1.6, my + 1.8, 3.2, my - 0.6)
    ctx.stroke()
  } else if (ch.kind === 'rakko') {
    ctx.moveTo(-1.8, my)
    ctx.lineTo(1.8, my)
    ctx.stroke()
  } else {
    // 작게 웃는 입.
    ctx.moveTo(-2, my - 0.4)
    ctx.quadraticCurveTo(0, my + 1.8, 2, my - 0.4)
    ctx.stroke()
  }
  ctx.restore()

  if (ch.kind === 'momonga') {
    // 수염.
    ctx.save()
    ctx.lineWidth = 0.8
    for (const s of [-1, 1]) {
      for (const dy of [-1.2, 1.2]) {
        ctx.beginPath()
        ctx.moveTo(s * 15.8, -22 + dy)
        ctx.lineTo(s * 19.5, -22.6 + dy * 1.8)
        ctx.stroke()
      }
    }
    ctx.restore()
  }
  if (ch.kind === 'shisa') {
    // 주황 소용돌이 눈썹.
    ctx.save()
    ctx.strokeStyle = LOOKS.shisa.mane
    ctx.lineWidth = 2
    for (const s of [-1, 1]) {
      // 둥근 눈썹 끝이 바깥으로 살짝 말린다.
      ctx.beginPath()
      ctx.arc(s * ex, ey - 4.2, 2.8, Math.PI * 1.1, Math.PI * 1.9)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(s * (ex + 3.4), ey - 5.6, 1, s > 0 ? Math.PI * 1.2 : -Math.PI * 0.2, s > 0 ? Math.PI * 2.6 : -Math.PI * 1.6, s < 0)
      ctx.stroke()
    }
    ctx.restore()
  }
}

/** 동그란 눈. 큰 눈은 반짝이를 둘, 작은 눈은 점 하나. */
function drawEyes(ctx, r, ex, ey, k) {
  for (const s of [-1, 1]) {
    ellipse(ctx, s * ex, ey, r * k, r * 1.3 * k)
    ctx.fillStyle = EYE
    ctx.fill()
    if (r > 1.9) {
      ellipse(ctx, s * ex + r * 0.32, ey - r * 0.5, r * 0.42 * k, r * 0.42 * k)
      ctx.fillStyle = '#ffffff'
      ctx.fill()
      ellipse(ctx, s * ex - r * 0.35, ey + r * 0.55, r * 0.18 * k, r * 0.18 * k)
      ctx.fill()
    }
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
