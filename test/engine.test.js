import { describe, expect, it } from 'vitest'
import { GRAVITY, STEP } from '../src/game/constants.js'
import { ballistic, createWorld, desiredCount, findJump, setWindows, step } from '../src/game/engine.js'

function run(world, seconds) {
  const n = Math.round(seconds / STEP)
  for (let i = 0; i < n; i++) step(world)
}

const A = { id: 10, x: 100, y: 300, w: 600, h: 400 }
const B = { id: 20, x: 800, y: 250, w: 500, h: 400 }

describe('창이 생기면 튀어나온다', () => {
  it('창 하나 → 화면 아래에서 솟아 그 창 위에 선다', () => {
    const world = createWorld({ seed: 7 })
    setWindows(world, [A])
    expect(world.chars).toHaveLength(0) // 바로 나오지 않는다
    run(world, 0.4)
    expect(world.chars).toHaveLength(0)
    run(world, 0.6)
    expect(world.chars).toHaveLength(1) // 둘째(혼자 두지 않기)는 조금 뒤에 온다
    const ch = world.chars[0]
    run(world, 2.4)
    expect(ch.mode === 'ground' || ch.mode === 'air').toBe(true)
    // 착지가 한 번은 있었고, 처음 내려앉은 곳은 A 위.
    expect(world.events.find((e) => e.type === 'pop')).toMatchObject({ y: A.y })
  })

  it('창이 하나뿐이어도 둘은 나온다(혼자 두지 않는다)', () => {
    const world = createWorld({ seed: 3 })
    setWindows(world, [A])
    run(world, 6)
    expect(world.chars.filter((c) => c.mode !== 'gone')).toHaveLength(2)
  })

  it('큰 창 하나가 나머지를 다 덮으면 남는 아이들은 물러난다', () => {
    const world = createWorld({ seed: 6 })
    const wins = [0, 1, 2, 3, 4].map((i) => ({ id: i + 1, x: 40 + i * 270, y: 300 + i * 20, w: 260, h: 300 }))
    setWindows(world, wins)
    run(world, 5)
    expect(world.chars).toHaveLength(5)
    const max = { id: 99, x: 0, y: 30, w: 1440, h: 860 }
    setWindows(world, [max, ...wins])
    run(world, 12)
    expect(world.chars.filter((c) => c.mode !== 'gone')).toHaveLength(2)
  })

  it('다시 비켜 주면 모자란 만큼 채운다', () => {
    const world = createWorld({ seed: 6 })
    const wins = [0, 1, 2, 3, 4].map((i) => ({ id: i + 1, x: 40 + i * 270, y: 300 + i * 20, w: 260, h: 300 }))
    setWindows(world, wins)
    run(world, 5)
    const max = { id: 99, x: 0, y: 30, w: 1440, h: 860 }
    setWindows(world, [max, ...wins])
    run(world, 12)
    expect(world.chars.filter((c) => c.mode !== 'gone')).toHaveLength(2)
    // 큰 창을 최소화했다. 다섯 창은 이미 아는 창이라 「새 창」 예약이 안 걸린다.
    setWindows(world, wins)
    run(world, 15)
    expect(world.chars.filter((c) => c.mode !== 'gone')).toHaveLength(5)
  })

  it('창마다 한 마리씩, 종류는 겹치지 않게', () => {
    const world = createWorld({ seed: 3 })
    setWindows(world, [A, B, { id: 30, x: 200, y: 760, w: 400, h: 120 }])
    run(world, 3)
    expect(world.chars.map((c) => c.kind).sort()).toEqual(['chiikawa', 'hachiware', 'usagi'])
  })

  it('나중에 뜬 창에도 나온다', () => {
    const world = createWorld({ seed: 3 })
    setWindows(world, [A])
    run(world, 3)
    const C = { id: 30, x: 200, y: 760, w: 400, h: 120 }
    setWindows(world, [B, A, C])
    run(world, 3)
    // A 에 둘(혼자 두지 않기) + 새 창 B·C 에 하나씩. 새 창에는 늘 하나가 나온다.
    expect(world.chars).toHaveLength(4)
    expect(world.events.filter((e) => e.type === 'pop').map((e) => e.y)).toContain(B.y)
  })

  it('최대 마리 수를 넘지 않는다', () => {
    const world = createWorld({ seed: 1, maxChars: 2 })
    const wins = [0, 1, 2, 3].map((i) => ({ id: i + 1, x: 50 + i * 340, y: 200 + i * 40, w: 320, h: 300 }))
    setWindows(world, wins)
    run(world, 6)
    expect(world.chars.length).toBeLessThanOrEqual(2)
  })

  it('처음 켰을 때 숨은 창이 많아도 보이는 창마다 하나씩 간다(한 창으로 안 몰린다)', () => {
    const world = createWorld({ seed: 12 })
    const big = { id: 1, x: 0, y: 30, w: 1440, h: 860 }      // 최대화된 창
    const small1 = { id: 2, x: 100, y: 300, w: 400, h: 300 }  // 그 앞의 작은 창 둘
    const small2 = { id: 3, x: 800, y: 400, w: 400, h: 300 }
    const hidden = [4, 5, 6, 7].map((id) => ({ id, x: 200, y: 200, w: 500, h: 500 })) // 큰 창 뒤
    setWindows(world, [small1, small2, big, ...hidden])
    run(world, 4)
    const on = (win) => world.chars.filter((c) => c.mode === 'ground' && c.win === win.id).length
    expect(on(small1)).toBeGreaterThanOrEqual(1)
    expect(on(small2)).toBeGreaterThanOrEqual(1)
    expect(on(big)).toBeGreaterThanOrEqual(1)
    expect(world.chars.filter((c) => c.mode !== 'gone').length).toBeLessThanOrEqual(4)
  })
})

describe('창 위에서', () => {
  it('창을 옮기면 위에 선 아이도 같이 간다', () => {
    const world = createWorld({ seed: 5 })
    setWindows(world, [A])
    run(world, 3)
    const ch = world.chars[0]
    // 걷거나 뛰지 않게 붙잡아 둔다.
    ch.mode = 'ground'
    ch.win = A.id
    ch.relX = 200
    ch.action = 'sit'
    ch.actionT = 99
    setWindows(world, [{ ...A, x: 400, y: 500 }])
    step(world)
    expect(ch.x).toBe(600)
    expect(ch.y).toBe(500)
    expect(ch.shake).toBeGreaterThan(0) // 크게 움직였으니 휘청인다
  })

  it('창이 닫히면 떨어지고, 밑에 창이 있으면 거기 내려앉는다', () => {
    const top = { id: 1, x: 200, y: 150, w: 400, h: 200 }
    const below = { id: 2, x: 100, y: 500, w: 700, h: 300 }
    const world = createWorld({ seed: 9, maxChars: 1 })
    setWindows(world, [top])
    run(world, 3)
    const ch = world.chars[0]
    ch.mode = 'ground'
    ch.win = top.id
    ch.relX = 200
    ch.action = 'sit'
    ch.actionT = 99
    step(world)
    setWindows(world, [below])
    step(world)
    expect(ch.mode).toBe('air')
    run(world, 1)
    expect(ch.mode).toBe('ground')
    expect(ch.win).toBe(below.id)
    expect(ch.x).toBeCloseTo(400, 5) // 똑바로 떨어졌다
  })

  it('창이 다 닫히면 화면 밖으로 떨어져 사라진다', () => {
    const world = createWorld({ seed: 2 })
    setWindows(world, [A])
    run(world, 3)
    setWindows(world, [])
    run(world, 3)
    expect(world.chars).toHaveLength(0)
  })

  it('앞 창에 통째로 가려지면 보이는 창으로 옮겨 간다', () => {
    const world = createWorld({ seed: 4 })
    setWindows(world, [A, B])
    run(world, 3)
    for (const ch of world.chars) {
      ch.action = 'sit'
      ch.actionT = 99
    }
    const onA = world.chars.find((c) => c.win === A.id)
    expect(onA).toBeTruthy()
    // A 를 덮는 큰 창이 앞에 뜬다. 큰 창 윗변은 보이므로 거기에 새로 하나 나오고,
    // A 위의 아이는 4 초쯤 기다렸다 보이는 데로 간다.
    const cover = { id: 30, x: 50, y: 280, w: 700, h: 500 }
    setWindows(world, [cover, A, B])
    run(world, 8)
    expect(onA.win).not.toBe(A.id)
  })
})

describe('탄도', () => {
  it('ballistic 은 목표 지점에 정확히 닿고, 그때 내려오는 중이다', () => {
    const cases = [[0, 500, 400, 300], [0, 300, -500, 600], [0, 400, 100, 60]]
    for (const [x0, y0, x1, y1] of cases) {
      const { vx, vy, T } = ballistic(x0, y0, x1, y1)
      expect(x0 + vx * T).toBeCloseTo(x1, 6)
      expect(y0 + vy * T + 0.5 * GRAVITY * T * T).toBeCloseTo(y1, 6)
      expect(vy + GRAVITY * T).toBeGreaterThan(0)
    }
  })

  it('튀어나올 때 꼭짓점은 창 윗변보다 POP_APEX(70) 위다', () => {
    const world = createWorld({ seed: 11 })
    setWindows(world, [A])
    let minY = Infinity
    for (let i = 0; i < 200; i++) {
      step(world)
      for (const ch of world.chars) if (ch.mode === 'air') minY = Math.min(minY, ch.y)
    }
    expect(minY).toBeGreaterThan(A.y - 70 - 3)
    expect(minY).toBeLessThan(A.y - 70 + 3)
  })
})

describe('창에서 창으로', () => {
  it('findJump 로 뛰면 다른 창 위에 내려앉는다', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const world = createWorld({ seed, maxChars: 1 })
      setWindows(world, [A, B])
      run(world, 3)
      const ch = world.chars[0]
      ch.mode = 'ground'
      ch.win = A.id
      ch.relX = 500 // A 의 오른쪽 끝 근처 → B 가 닿는 거리
      ch.action = 'sit'
      ch.actionT = 99
      step(world)
      const j = findJump(world, ch, A)
      expect(j).not.toBe(null)
      ch.jump = { vx: j.vx, vy: j.vy }
      ch.action = 'crouch'
      ch.actionT = 0.01
      run(world, 0.05 + j.T + 0.1)
      expect(ch.mode).toBe('ground')
      expect(ch.win).toBe(B.id)
    }
  })
})

describe('특기와 공중제비', () => {
  it('오래 두면 아이마다 자기 특기를 한다 (치이카와 풀 뽑기, 하치와레 노래, 쿠리만쥬 한 잔 …)', () => {
    const world = createWorld({ seed: 21, maxChars: 7 })
    const wins = [0, 1, 2, 3, 4, 5, 6].map((i) => ({ id: i + 1, x: 20 + i * 200, y: 150 + (i % 3) * 200, w: 190, h: 120 }))
    setWindows(world, wins)
    const seen = new Map()
    for (let i = 0; i < 60 * 400; i++) {
      step(world)
      for (const ch of world.chars) {
        if (!seen.has(ch.kind)) seen.set(ch.kind, new Set())
        seen.get(ch.kind).add(ch.action)
      }
    }
    expect(seen.get('chiikawa')).toContain('weed')
    expect(seen.get('hachiware')).toContain('sing')
    expect(seen.get('usagi')).toContain('dance')
    expect(seen.get('kurimanju')).toContain('drink')
    expect(seen.get('rakko')).toContain('train')
    expect(seen.get('momonga')).toContain('pose')
  })

  it('공중제비는 뜬 동안 딱 한 바퀴 돌고, 내려앉으면 멈춘다', () => {
    const world = createWorld({ seed: 2, maxChars: 1 })
    setWindows(world, [A])
    run(world, 3)
    const ch = world.chars[0]
    ch.kind = 'usagi'
    ch.mode = 'ground'
    ch.win = A.id
    ch.relX = 300
    let spun = null
    for (let tries = 0; tries < 50 && spun == null; tries++) {
      ch.action = 'crouch'
      ch.actionT = 0.001
      ch.jump = null
      step(world)
      step(world)
      if (ch.mode === 'air' && ch.spin) spun = ch.spin
      while (ch.mode === 'air') step(world)
    }
    expect(spun).not.toBe(null)
    // 제자리 뛰기: 떠 있는 시간 2·hop/g 동안 2π.
    expect(Math.abs(spun) * (2 * 620 / GRAVITY)).toBeCloseTo(Math.PI * 2, 5)
    expect(ch.mode).toBe('ground')
    expect(ch.spin).toBe(0)
  })
})

describe('결정론', () => {
  it('같은 시드 같은 입력이면 같은 결과', () => {
    const go = () => {
      const world = createWorld({ seed: 42 })
      setWindows(world, [A, B])
      run(world, 20)
      setWindows(world, [B])
      run(world, 10)
      return world.chars.map((c) => [c.kind, c.mode, Math.round(c.x), Math.round(c.y)])
    }
    expect(go()).toEqual(go())
  })

  it('오래 돌려도 아이들은 보이는 창 수만큼 있다', () => {
    const world = createWorld({ seed: 8 })
    setWindows(world, [A, B])
    run(world, 120)
    expect(world.chars.filter((c) => c.mode !== 'gone')).toHaveLength(desiredCount(world))
    for (const ch of world.chars.filter((c) => c.mode === 'ground')) {
      expect([A.y, B.y]).toContain(ch.y)
    }
  })
})
