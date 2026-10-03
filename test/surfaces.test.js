import { describe, expect, it } from 'vitest'
import { nearestVisible, segmentAt, standable, visibleSegments } from '../src/game/surfaces.js'

const screen = { w: 1440, h: 900 }

describe('standable', () => {
  it('보통 창은 설 수 있다', () => {
    expect(standable({ x: 100, y: 200, w: 600, h: 400 }, screen)).toBe(true)
  })
  it('전체 화면 창(윗변 0)에는 못 선다 — 아이가 화면 밖에 서게 된다', () => {
    expect(standable({ x: 0, y: 0, w: 1440, h: 900 }, screen)).toBe(false)
  })
  it('작업 표시줄(dock)은 낮아도 선다 — 같은 높이의 보통 창은 못 선다', () => {
    const bar = { x: 0, y: 852, w: 1440, h: 48 }
    expect(standable({ ...bar, dock: true }, screen)).toBe(true)
    expect(standable(bar, screen)).toBe(false)
  })
  it('툴팁만 한 창은 창이 아니다', () => {
    expect(standable({ x: 100, y: 200, w: 120, h: 30 }, screen)).toBe(false)
  })
})

describe('visibleSegments', () => {
  it('앞에 아무것도 없으면 끝 여백만 빼고 다 보인다', () => {
    const wins = [{ id: 1, x: 100, y: 200, w: 600, h: 400 }]
    expect(visibleSegments(wins, 0, screen)).toEqual([[114, 686]])
  })

  it('앞 창이 윗변 가운데를 덮으면 두 조각으로 갈린다 (몸 절반 20px 씩 더 깎는다)', () => {
    const wins = [
      { id: 2, x: 300, y: 150, w: 200, h: 300 }, // 앞
      { id: 1, x: 100, y: 200, w: 600, h: 400 },
    ]
    expect(visibleSegments(wins, 1, screen)).toEqual([[114, 280], [520, 686]])
  })

  it('앞 창이 윗변보다 아래에서 시작하면 안 덮는다', () => {
    const wins = [
      { id: 2, x: 300, y: 260, w: 200, h: 300 },
      { id: 1, x: 100, y: 200, w: 600, h: 400 },
    ]
    expect(visibleSegments(wins, 1, screen)).toEqual([[114, 686]])
  })

  it('앞 창 아랫변이 발밑 띠(18px)보다 위에서 끝나면 머리만 덮는 거라 안 친다', () => {
    const wins = [
      { id: 2, x: 300, y: 50, w: 200, h: 140 }, // 아랫변 190 = 윗변 200 − 10 … 띠 안이라 덮는다
      { id: 3, x: 300, y: 40, w: 200, h: 140 }, // 아랫변 180 = 띠 밖
      { id: 1, x: 100, y: 200, w: 600, h: 400 },
    ]
    expect(visibleSegments([wins[0], wins[2]], 1, screen)).toEqual([[114, 280], [520, 686]])
    expect(visibleSegments([wins[1], wins[2]], 1, screen)).toEqual([[114, 686]])
  })

  it('통째로 덮이면 빈 목록', () => {
    const wins = [
      { id: 2, x: 0, y: 30, w: 1440, h: 800 },
      { id: 1, x: 100, y: 200, w: 600, h: 400 },
    ]
    expect(visibleSegments(wins, 1, screen)).toEqual([])
  })

  it('화면 밖으로 나간 부분은 뺀다', () => {
    const wins = [{ id: 1, x: -200, y: 200, w: 600, h: 400 }]
    expect(visibleSegments(wins, 0, screen)).toEqual([[14, 386]])
  })
})

describe('segmentAt / nearestVisible', () => {
  const segs = [[100, 200], [300, 400]]
  it('구간 안이면 그 구간', () => {
    expect(segmentAt(segs, 150)).toEqual([100, 200])
    expect(segmentAt(segs, 250)).toBe(null)
  })
  it('가장 가까운 보이는 점', () => {
    expect(nearestVisible(segs, 240)).toBe(200)
    expect(nearestVisible(segs, 270)).toBe(300)
    expect(nearestVisible([], 10)).toBe(null)
  })
})
