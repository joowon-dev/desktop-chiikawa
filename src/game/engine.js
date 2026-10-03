// 월드. 창 목록을 받아 아이들을 창 위에 세우고, 걷게 하고, 뛰게 하고, 떨어뜨린다.
//
// 순수 모듈이다 — window·document·Date.now()·Math.random() 을 쓰지 않는다. 렌더러가
// setWindows() 로 창을 넣고 step() 을 고정 타임스텝으로 돌린다.
//
// 아이는 셋 중 하나의 상태다:
//   ground — 창 위에 서 있다. 위치는 (창 id, 창 왼쪽에서의 거리 relX). 창이 움직이면 같이 간다.
//   air    — 날고 있다(튀어나오는 중, 뛰는 중, 떨어지는 중). 화면 좌표로 탄도 운동.
//   gone   — 화면 밖. 다시 튀어나올 차례를 기다린다(pops 큐).

import {
  BURST_GAP, CHAR_H, COVER_LIMIT, CROUCH, DEFAULT_MAX_CHARS, EDGE_MARGIN, FRIEND_DIST, GRAVITY,
  JUMP_REACH, JUMP_RISE, MOUSE_HAPPY, MOUSE_LOOK, POP_APEX, POP_DELAY, REPOP_DELAY, SHAKE_MOVE, STEP,
} from './constants.js'
import { KINDS, MOVES, castOf } from './cast.js'
import { between, pick, rand, weighted } from './rng.js'
import { nearestVisible, segmentAt, standable, visibleSegments } from './surfaces.js'

export function createWorld({ seed = 1, w = 1440, h = 900, maxChars = DEFAULT_MAX_CHARS, kinds = KINDS } = {}) {
  return {
    kinds: [...kinds],
    t: 0,
    rng: seed >>> 0,
    screen: { w, h },
    maxChars,
    nextId: 1,
    windows: [],          // 앞에서 뒤 순서
    byId: new Map(),      // id → 창
    segs: new Map(),      // id → 보이는 윗변 구간
    known: new Set(),     // 이미 본 창 id. 여기 없는 창이 새 창이다.
    started: false,       // 첫 setWindows 를 받았나
    pops: [],             // { at, winId, charId? } 튀어나올 예약
    chars: [],
    mouse: null,          // { x, y } 또는 null
    friendClock: 0,
    topUpClock: 0,
    events: [],           // 렌더러가 가져가는 효과: { type: 'land'|'pop'|'puff', x, y }
  }
}

export function resize(world, w, h) {
  world.screen.w = w
  world.screen.h = h
  recomputeSegments(world)
}

export function setMouse(world, mouse) {
  world.mouse = mouse
}

export function setMaxChars(world, n) {
  world.maxChars = n
}

/**
 * 창 목록을 바꾼다. list 는 앞에서 뒤 순서의 [{ id, x, y, w, h, dock? }]. dock 은 작업 표시줄.
 * 새 창에는 아이가 튀어나올 예약을 걸고, 크게 움직인 창 위의 아이들은 휘청이게 한다.
 */
export function setWindows(world, list) {
  const prev = world.byId
  world.windows = list.map((win) => ({ id: win.id, x: win.x, y: win.y, w: win.w, h: win.h, dock: !!win.dock }))
  world.byId = new Map(world.windows.map((win) => [win.id, win]))
  recomputeSegments(world)

  // 흔들림: 위에 선 아이들에게만.
  for (const ch of world.chars) {
    if (ch.mode !== 'ground') continue
    const before = prev.get(ch.win)
    const now = world.byId.get(ch.win)
    if (!before || !now) continue
    if (Math.abs(now.x - before.x) + Math.abs(now.y - before.y) > SHAKE_MOVE) {
      ch.shake = 0.5
      ch.exclaim = 1
    }
  }

  // 새 창. 처음 켰을 때는 이미 떠 있던 창들이 한꺼번에 「새 창」이라 차례로 나오게 한다.
  let k = 0
  for (const win of world.windows) {
    // 설 수 없게 된 창(최대화·전체 화면)은 잊는다 — 창 모드로 돌아오면 다시 「새 창」이라 누가 올라간다.
    if (!standable(win, world.screen)) {
      world.known.delete(win.id)
      continue
    }
    if (world.known.has(win.id)) continue
    world.known.add(win.id)
    const delay = world.started ? POP_DELAY + k * BURST_GAP : 0.6 + k * BURST_GAP
    world.pops.push({ at: world.t + delay, winId: win.id })
    k++
  }
  // 사라진 창은 잊는다 — 최소화했다 다시 띄우면 다시 「새 창」이다.
  for (const id of [...world.known]) if (!world.byId.has(id)) world.known.delete(id)
  world.started = true
}

function recomputeSegments(world) {
  world.segs = new Map()
  world.windows.forEach((win, i) => {
    world.segs.set(win.id, visibleSegments(world.windows, i, world.screen))
  })
}

// ───────────────────────────────── 한 스텝

export function step(world, dt = STEP) {
  world.t += dt
  runPops(world)
  for (const ch of world.chars) {
    ch.anim += dt
    ch.actionAge += dt
    if (ch.say) {
      ch.say.t -= dt
      if (ch.say.t <= 0) ch.say = null
    }
    if (ch.shake > 0) ch.shake = Math.max(0, ch.shake - dt)
    if (ch.exclaim > 0) ch.exclaim = Math.max(0, ch.exclaim - dt)
    if (ch.love > 0) ch.love = Math.max(0, ch.love - dt)
    if (ch.squash > 0) ch.squash = Math.max(0, ch.squash - dt * 4)
    if (ch.mode === 'ground') stepGround(world, ch, dt)
    else if (ch.mode === 'air') stepAir(world, ch, dt)
  }
  socialize(world, dt)
  topUp(world, dt)
  // 지워진 아이(다시 나올 예약이 없는 gone)는 목록에서 뺀다.
  world.chars = world.chars.filter((ch) => ch.mode !== 'gone' || ch.waiting)
}

/** 렌더러가 효과를 가져간다. 가져가면 비운다. */
export function drainEvents(world) {
  const out = world.events
  world.events = []
  return out
}

// ───────────────────────────────── 튀어나오기

function activeCount(world) {
  return world.chars.filter((ch) => ch.mode !== 'gone').length
}

/**
 * 화면에 있어야 할 마리 수 — 보이는 창 하나에 한 마리, 최대 maxChars.
 * 창이 하나라도 보이면 적어도 둘 — 창을 최대화해 하나만 보일 때 혼자 두지 않는다.
 */
export function desiredCount(world) {
  let n = 0
  for (const win of world.windows) if ((world.segs.get(win.id) || []).length) n++
  if (n > 0) n = Math.max(n, 2)
  return Math.min(world.maxChars, n)
}

/**
 * 모자라면 채운다. 창 하나가 다른 창들을 다 덮었다가 비켜 주면, 다시 보이는 창들은
 * 「새 창」이 아니라서 튀어나올 예약이 안 걸린다 — 그 빈자리를 여기서 메운다.
 */
function topUp(world, dt) {
  world.topUpClock += dt
  if (world.topUpClock < 1.5) return
  world.topUpClock = 0
  if (activeCount(world) + world.pops.length >= desiredCount(world)) return
  const win = loneliestWindow(world)
  if (win) world.pops.push({ at: world.t + between(world, 0.2, 1.2), winId: win.id })
}

function runPops(world) {
  const due = world.pops.filter((p) => p.at <= world.t)
  if (!due.length) return
  world.pops = world.pops.filter((p) => p.at > world.t)

  for (const pop of due) {
    let ch = pop.charId != null ? world.chars.find((c) => c.id === pop.charId) : null
    // 가려던 창이 없어졌거나 다른 창에 다 가려졌으면 지금 제일 한산한 창으로.
    let win = world.byId.get(pop.winId)
    const redirected = !win || !(world.segs.get(win.id) || []).length
    if (redirected) win = loneliestWindow(world)

    if (ch) {
      ch.waiting = false
      // 나올 자리가 없으면 조용히 은퇴한다(waiting 이 꺼졌으니 다음 스텝에 목록에서 빠진다).
      if (!win || activeCount(world) >= world.maxChars) continue
      launchPop(world, ch, win)
      continue
    }

    // 새 창에 새 아이. 다른 창 뒤에 숨어서 뜬 창이면, 이미 넉넉할 때는 안 나온다.
    if (!win) continue
    if (redirected && activeCount(world) >= desiredCount(world)) continue
    if (activeCount(world) < world.maxChars) {
      ch = newChar(world, leastKind(world))
      world.chars.push(ch)
      launchPop(world, ch, win)
    } else {
      // 꽉 찼으면 제일 붐비는 창에서 한 마리를 데려온다(그 창에 둘 이상일 때만).
      // 그런 창이 없으면 작업 표시줄에서 기다리던 아이를 — 창이 생기면 창이 먼저다.
      const mover = crowdedChar(world) || (win.dock ? null : dockChar(world))
      if (!mover) continue
      world.events.push({ type: 'puff', x: mover.x, y: mover.y - CHAR_H / 2 })
      launchPop(world, mover, win)
    }
  }
}

function newChar(world, kind) {
  return {
    id: world.nextId++,
    kind,
    mode: 'gone',
    waiting: false,
    win: null,
    relX: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    facing: rand(world) < 0.5 ? -1 : 1,
    action: 'idle',
    actionT: 0,
    actionAge: 0,       // 지금 행동을 시작한 지 몇 초(그림이 자세를 서서히 바꾸는 데 쓴다)
    target: 0,          // 걷기 목표 relX
    dropAtEnd: false,   // 목표에 닿으면 창 끝에서 뛰어내린다
    jump: null,         // 웅크린 뒤 날아갈 { vx, vy }
    popping: false,
    popTarget: null,
    spin: 0,            // 공중제비 회전 속도(rad/s). 0 이면 안 돈다
    airT: 0,            // 이번에 뜬 지 몇 초
    prop: null,         // 먹고 마시는 것(그림 문자)
    exclaim: 0,         // 「!」 남은 시간
    love: 0,            // 하트 남은 시간
    coveredT: 0,
    shake: 0,
    squash: 0,
    happy: 0,
    say: null,
    anim: rand(world) * 10,
  }
}

/** 화면에 제일 적게 나와 있는 종류. 같으면 world.kinds 순서. */
function leastKind(world) {
  const count = Object.fromEntries(world.kinds.map((k) => [k, 0]))
  for (const ch of world.chars) if (ch.kind in count) count[ch.kind]++
  let best = world.kinds[0]
  for (const k of world.kinds) if (count[k] < count[best]) best = k
  return best
}

/**
 * 나올 수 있는 아이들. 그림 폴더에 새 그림을 넣으면 렌더러가 여기에 더한다.
 * 이미 나와 있는 아이 중 목록에서 빠진 종류는 그대로 둔다 — 갑자기 사라지면 이상하다.
 */
export function setKinds(world, kinds) {
  if (kinds.length) world.kinds = [...kinds]
}

/** 서 있는 아이 수가 제일 적은 보이는 창. 같으면 앞 창. */
function loneliestWindow(world) {
  let best = null
  let bestN = Infinity
  for (const win of world.windows) {
    if (!(world.segs.get(win.id) || []).length) continue
    // 그 창으로 날아가는 중인 아이도 센다 — 안 세면 한꺼번에 나온 아이들이 한 창으로 몰린다.
    const n = world.chars.filter((c) =>
      (c.mode === 'ground' && c.win === win.id) || (c.mode === 'air' && c.popping && c.popTarget === win.id)).length
    if (n < bestN) {
      best = win
      bestN = n
    }
  }
  return best
}

function crowdedChar(world) {
  const groups = new Map()
  for (const ch of world.chars) {
    if (ch.mode !== 'ground') continue
    if (!groups.has(ch.win)) groups.set(ch.win, [])
    groups.get(ch.win).push(ch)
  }
  let best = null
  for (const list of groups.values()) if (list.length > 1 && (!best || list.length > best.length)) best = list
  return best ? best[best.length - 1] : null
}

function dockChar(world) {
  return world.chars.find((ch) => ch.mode === 'ground' && world.byId.get(ch.win)?.dock) || null
}

/** 화면 아래에서 솟아올라 win 윗변에 내려앉게 쏜다. */
function launchPop(world, ch, win) {
  const segs = world.segs.get(win.id)
  // 제일 긴 보이는 구간 안의 아무 데나.
  let seg = segs[0]
  for (const s of segs) if (s[1] - s[0] > seg[1] - seg[0]) seg = s
  const x = between(world, seg[0], seg[1])
  const startY = world.screen.h + CHAR_H
  const rise = startY - (win.y - POP_APEX)
  ch.mode = 'air'
  ch.waiting = false
  ch.win = null
  ch.x = x
  ch.y = startY
  ch.vx = 0
  ch.vy = -Math.sqrt(2 * GRAVITY * Math.max(rise, 1))
  ch.popping = true
  ch.popTarget = win.id
  ch.airT = 0
  ch.spin = 0
  ch.action = 'fly'
  ch.coveredT = 0
  ch.jump = null
  ch.dropAtEnd = false
}

// ───────────────────────────────── 서 있는 아이

function stepGround(world, ch, dt) {
  const win = world.byId.get(ch.win)
  if (!win) {
    // 창이 닫혔다(또는 최소화). 그 자리에서 떨어진다.
    ch.mode = 'air'
    ch.vx = 0
    ch.vy = 0
    ch.action = 'fall'
    ch.win = null
    return
  }
  // 창이 줄어들었으면 위에 있던 자리도 따라 당긴다.
  ch.relX = Math.min(Math.max(ch.relX, EDGE_MARGIN), Math.max(EDGE_MARGIN, win.w - EDGE_MARGIN))
  ch.x = win.x + ch.relX
  ch.y = win.y

  const segs = world.segs.get(win.id) || []
  const seg = segmentAt(segs, ch.x)

  // 가려졌다. 보이는 데가 같은 창에 있으면 거기로 걸어 나오고, 없으면 기다렸다가 딴 창으로.
  if (!seg && ch.action !== 'crouch') {
    const out = nearestVisible(segs, ch.x)
    if (out != null && ch.action !== 'walk') {
      startWalk(ch, out - win.x + Math.sign(out - ch.x) * 8)
    }
    if (out == null) {
      ch.coveredT += dt
      if (ch.coveredT > COVER_LIMIT) relocate(world, ch)
    }
  } else {
    ch.coveredT = 0
  }

  // 마우스.
  ch.happy = Math.max(0, ch.happy - dt)
  if (world.mouse) {
    const dx = world.mouse.x - ch.x
    const dy = world.mouse.y - (ch.y - CHAR_H / 2)
    const d = Math.hypot(dx, dy)
    if (d < MOUSE_LOOK && ch.action !== 'walk' && ch.action !== 'crouch') {
      ch.facing = dx < 0 ? -1 : 1
      if (ch.action === 'sleep') {
        ch.action = 'idle'
        ch.actionT = 1.5
        say(ch, '…!', 1.2)
        ch.exclaim = 0.8
      }
    }
    if (d < MOUSE_HAPPY) {
      ch.happy = 0.3
      ch.love = Math.max(ch.love, 0.4) // 쓰다듬으면 하트
    }
  }

  ch.actionT -= dt
  switch (ch.action) {
    case 'walk': {
      const dir = Math.sign(ch.target - ch.relX)
      const speed = castOf(ch.kind).speed
      ch.facing = dir || ch.facing
      const move = speed * dt
      if (Math.abs(ch.target - ch.relX) <= move) {
        ch.relX = ch.target
        if (ch.dropAtEnd) {
          ch.dropAtEnd = false
          leave(ch, ch.facing * speed * 2.2, -320)
          return
        }
        setAction(world, ch, 'idle', between(world, 0.6, 1.6))
      } else {
        ch.relX += dir * move
        // 걷다가 가려진 데로 들어서려 하면 멈춘다(가려짐 처리 중인 걸음은 예외).
        const nextX = win.x + ch.relX
        if (seg && !segmentAt(segs, nextX) && !ch.dropAtEnd) {
          ch.relX -= dir * move
          setAction(world, ch, 'idle', between(world, 0.5, 1.2))
        }
      }
      ch.x = win.x + ch.relX
      break
    }
    case 'crouch':
      if (ch.actionT <= 0) {
        const j = ch.jump
        ch.jump = null
        const vy = j ? j.vy : -castOf(ch.kind).hop
        // 공중제비: 떠 있는 동안 정확히 한 바퀴 돌게 회전 속도를 맞춘다.
        const spin = castOf(ch.kind).spin || 0
        if (spin > 0 && rand(world) < spin) {
          const T = j && j.T ? j.T : (2 * -vy) / GRAVITY
          ch.spin = (ch.facing || 1) * (Math.PI * 2) / Math.max(0.3, T)
          if (rand(world) < 0.5) say(ch, castOf(ch.kind).lines[1] || '야하!', 1.2)
        }
        leave(ch, j ? j.vx : 0, vy)
      }
      break
    default:
      if (ch.actionT <= 0) decide(world, ch, win, segs, seg)
  }
}

function setAction(world, ch, action, t) {
  ch.action = action
  ch.actionT = t
  ch.actionAge = 0
}

function startWalk(ch, targetRel) {
  ch.actionAge = 0
  ch.action = 'walk'
  ch.actionT = 30
  ch.target = targetRel
  ch.dropAtEnd = false
}

function say(ch, text, t = 2.2) {
  ch.say = { text, t }
}

/** 땅에서 떨어진다(뛰기·뛰어내리기). */
function leave(ch, vx, vy) {
  ch.airT = 0
  ch.mode = 'air'
  ch.win = null
  ch.vx = vx
  ch.vy = vy
  ch.action = 'fly'
  ch.squash = 0
}

/**
 * 가려진 채로 오래 있었다 — 슬쩍 사라졌다가 보이는 창으로 튀어나온다.
 * 이미 넉넉하면 그냥 퇴장한다(가려져 있으니 사라지는 게 안 보인다).
 */
function relocate(world, ch) {
  const target = loneliestWindow(world)
  ch.coveredT = 0
  if (activeCount(world) > desiredCount(world)) {
    ch.mode = 'gone'
    ch.waiting = false
    ch.win = null
    return
  }
  if (!target) return
  ch.mode = 'gone'
  ch.waiting = true
  ch.win = null
  world.pops.push({ at: world.t + 0.5, winId: target.id, charId: ch.id })
}

/** 다음에 뭘 할지. */
function decide(world, ch, win, segs, seg) {
  const cast = castOf(ch.kind)
  const jumpTarget = rand(world) < 0.5 ? findJump(world, ch, win) : null
  // 뛰어내릴 수 있는 끝: 앞 창에 가려서 끊긴 끝이 아니라 진짜 창 끝.
  const leftEdge = seg && Math.abs(seg[0] - (Math.max(win.x, 0) + EDGE_MARGIN)) < 1
  const rightEdge = seg && Math.abs(seg[1] - (Math.min(win.x + win.w, world.screen.w) - EDGE_MARGIN)) < 1
  const atWinEdge = leftEdge || rightEdge

  const choice = weighted(world, [
    ['idle', 3],
    ['walk', seg ? 4.5 : 0],
    ['sit', 1.2],
    ['sleep', 0.45 * cast.sleepy],
    ['hop', 0.9],
    ['talk', 0.9],
    ['jump', jumpTarget ? 1.6 * cast.jumpy : 0],
    ['drop', atWinEdge ? 0.25 * cast.jumpy : 0],
    ...Object.entries(cast.moves || {}).map(([move, w]) => [move, w * 0.7]),
  ])

  if (MOVES[choice]) {
    const move = MOVES[choice]
    setAction(world, ch, choice, between(world, move.t[0], move.t[1]))
    if (choice === 'eat') ch.prop = pick(world, cast.food || ['🍙'])
    if (choice === 'drink') ch.prop = '🍺'
    if (choice === 'train') ch.prop = '🗡️'
    if (move.line) say(ch, move.line, 1.6)
    return
  }

  switch (choice) {
    case 'walk': {
      const span = seg[1] - seg[0]
      let tx = between(world, seg[0], seg[1])
      if (span > 80 && Math.abs(tx - ch.x) < 30) tx = ch.x + (tx < ch.x ? -40 : 40)
      tx = Math.min(seg[1], Math.max(seg[0], tx))
      startWalk(ch, tx - win.x)
      break
    }
    case 'sit':
      setAction(world, ch, 'sit', between(world, 2.5, 6))
      break
    case 'sleep':
      setAction(world, ch, 'sleep', between(world, 5, 10))
      break
    case 'hop':
      setAction(world, ch, 'crouch', CROUCH)
      ch.jump = { vx: 0, vy: -cast.hop }
      break
    case 'talk':
      say(ch, pick(world, cast.lines))
      setAction(world, ch, 'idle', between(world, 1.5, 2.5))
      break
    case 'jump':
      ch.facing = jumpTarget.vx < 0 ? -1 : 1
      ch.jump = { vx: jumpTarget.vx, vy: jumpTarget.vy, T: jumpTarget.T }
      setAction(world, ch, 'crouch', CROUCH)
      break
    case 'drop': {
      // 가까운 창 끝까지 걸어가서 뛰어내린다.
      const left = seg[0] - win.x
      const right = seg[1] - win.x
      const toRight = leftEdge && rightEdge
        ? Math.abs(right - ch.relX) < Math.abs(left - ch.relX)
        : rightEdge
      startWalk(ch, toRight ? right : left)
      ch.dropAtEnd = true
      break
    }
    default:
      setAction(world, ch, 'idle', between(world, 1, 3))
  }
}

/**
 * 다른 창 윗변의 보이는 점 하나를 골라, 거기 내려앉는 초속을 구한다. 닿을 데가 없으면 null.
 * 날아가는 시간 T 를 거리로 정하고 vx = dx/T, vy = (dy − ½gT²)/T.
 */
export function findJump(world, ch, fromWin) {
  const options = []
  for (const win of world.windows) {
    if (win.id === fromWin.id) continue
    for (const [a, b] of world.segs.get(win.id) || []) {
      const x = Math.min(b, Math.max(a, ch.x))
      const tx = x === ch.x ? between(world, a, b) : x + Math.sign(x - ch.x) * Math.min(30, (b - a) / 2)
      const dx = tx - ch.x
      const dy = win.y - ch.y
      if (Math.abs(dx) > JUMP_REACH || -dy > JUMP_RISE || Math.abs(dx) < 20) continue
      options.push({ x: tx, y: win.y })
    }
  }
  if (!options.length) return null
  const target = pick(world, options)
  return ballistic(ch.x, ch.y, target.x, target.y)
}

/** (x0,y0) 에서 (x1,y1) 로 떨어지는 포물선. 도착할 때 반드시 내려오는 중이다. */
export function ballistic(x0, y0, x1, y1) {
  const dx = x1 - x0
  const dy = y1 - y0
  // 위로 갈수록 오래 날게 해서 꼭짓점이 목표보다 충분히 위에 오게 한다.
  let T = Math.min(1.15, Math.max(0.5, 0.42 + Math.abs(dx) / 1100 + Math.max(0, -dy) / 900))
  // 도착 때 vy > 0 (내려오는 중)이려면 dy > −½gT² 이어야 한다. 모자라면 T 를 늘린다.
  const need = Math.sqrt(Math.max(0, (-dy + 30) * 2 / GRAVITY))
  T = Math.max(T, need)
  return { vx: dx / T, vy: (dy - 0.5 * GRAVITY * T * T) / T, T }
}

// ───────────────────────────────── 날고 있는 아이

function stepAir(world, ch, dt) {
  const prevY = ch.y
  ch.airT += dt
  // 중력이 일정하니 정확한 식으로 적분한다. vy 를 먼저 더하는 오일러는 한 번 뛸 때마다
  // v·dt/2 (튀어나올 때 16px 남짓) 덜 솟아서, 계산한 꼭짓점·착지점에 못 닿는다.
  ch.x += ch.vx * dt
  ch.y += ch.vy * dt + 0.5 * GRAVITY * dt * dt
  ch.vy += GRAVITY * dt

  if (ch.vy > 0) {
    // 내려오는 중에만 내려앉는다. 앞 창부터 본다 — 겹치면 앞 창 위에 선다.
    for (const win of world.windows) {
      if (prevY > win.y + 0.5 || ch.y < win.y) continue
      if (!segmentAt(world.segs.get(win.id), ch.x)) continue
      land(world, ch, win)
      return
    }
  }

  const { w, h } = world.screen
  if (ch.y > h + CHAR_H * 2 || ch.x < -CHAR_H * 3 || ch.x > w + CHAR_H * 3) {
    // 화면 밖으로 떨어졌다. 모자라면 다시 나오고, 남으면 그대로 퇴장.
    ch.mode = 'gone'
    ch.popping = false
    const others = world.chars.filter((c) => c !== ch && c.mode !== 'gone').length
    if (others < desiredCount(world)) {
      const target = loneliestWindow(world)
      if (target) {
        ch.waiting = true
        world.pops.push({ at: world.t + REPOP_DELAY, winId: target.id, charId: ch.id })
      }
    }
  }
}

function land(world, ch, win) {
  ch.spin = 0
  ch.airT = 0
  ch.mode = 'ground'
  ch.win = win.id
  ch.relX = ch.x - win.x
  ch.y = win.y
  ch.vx = 0
  ch.vy = 0
  ch.squash = 1
  ch.coveredT = 0
  setAction(world, ch, 'idle', between(world, 0.5, 1.4))
  world.events.push({ type: ch.popping ? 'pop' : 'land', x: ch.x, y: ch.y, kind: ch.kind })
  if (ch.popping && rand(world) < 0.6) say(ch, pick(world, castOf(ch.kind).lines), 1.8)
  ch.popping = false
}

// ───────────────────────────────── 친구

/** 같은 창에 붙어 선 둘이 가끔 같이 신난다. */
function socialize(world, dt) {
  world.friendClock += dt
  if (world.friendClock < 1) return
  world.friendClock = 0
  const ground = world.chars.filter((c) => c.mode === 'ground' && (c.action === 'idle' || c.action === 'sit'))
  for (let i = 0; i < ground.length; i++) {
    for (let j = i + 1; j < ground.length; j++) {
      const a = ground[i]
      const b = ground[j]
      if (a.win !== b.win || Math.abs(a.x - b.x) > FRIEND_DIST) continue
      if (rand(world) > 0.25) continue
      for (const ch of [a, b]) {
        ch.facing = (ch === a ? b.x - a.x : a.x - b.x) < 0 ? -1 : 1
        setAction(world, ch, 'cheer', 1.4)
        ch.love = 1.4
      }
      say(a, pick(world, castOf(a.kind).lines), 1.6)
      return
    }
  }
}
