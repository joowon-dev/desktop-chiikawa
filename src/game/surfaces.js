// 창 위쪽 모서리 중에서 **실제로 보이는 구간**을 구한다.
//
// 창 목록은 앞에서 뒤 순서다(셸이 CGWindowList 순서 그대로 준다). i 번째 창의 윗변은
// 0..i-1 번째 창에 덮일 수 있다. 덮인 자리에 서 있는 아이는 그림에서 지워지므로
// (렌더러가 앞 창 자리를 비운다) 거기로 걸어가거나 내려앉으면 안 된다.

import { CHAR_W, COVER_BAND, EDGE_MARGIN, MIN_TOP, MIN_WIN_H, MIN_WIN_W } from './constants.js'

/** 이 창에 설 수 있나 — 크기와 윗변 높이만 본다(가림은 segments 가 본다). */
export function standable(win, screen) {
  return win.w >= MIN_WIN_W && win.h >= MIN_WIN_H &&
    win.y >= MIN_TOP && win.y <= screen.h - 10 &&
    win.x + win.w > 0 && win.x < screen.w
}

/** front 창이 y 높이에 서 있는 아이의 발밑을 덮나. */
function coversEdge(front, top) {
  return front.y < top && front.y + front.h > top - COVER_BAND
}

/**
 * windows[index] 윗변의 보이는 구간들 [[x0, x1], …] (화면 좌표, 왼쪽부터).
 * 창 끝 EDGE_MARGIN 은 빼고, 앞 창 양옆으로 몸 절반만큼 더 뺀다 — 앞 창 가장자리에 반쯤
 * 박혀 서 있으면 잘려 보인다.
 */
export function visibleSegments(windows, index, screen) {
  const win = windows[index]
  if (!standable(win, screen)) return []

  let segs = [[Math.max(win.x, 0) + EDGE_MARGIN, Math.min(win.x + win.w, screen.w) - EDGE_MARGIN]]
  const half = CHAR_W / 2
  for (let j = 0; j < index; j++) {
    const front = windows[j]
    if (!coversEdge(front, win.y)) continue
    const cut0 = front.x - half
    const cut1 = front.x + front.w + half
    const next = []
    for (const [a, b] of segs) {
      if (cut1 <= a || cut0 >= b) {
        next.push([a, b])
        continue
      }
      if (cut0 > a) next.push([a, cut0])
      if (cut1 < b) next.push([cut1, b])
    }
    segs = next
    if (segs.length === 0) break
  }
  // 몸 하나도 안 들어가는 틈은 버린다.
  return segs.filter(([a, b]) => b - a >= half)
}

/** x 가 들어 있는 구간. 없으면 null. */
export function segmentAt(segs, x) {
  if (!segs) return null
  for (const seg of segs) if (x >= seg[0] && x <= seg[1]) return seg
  return null
}

/** x 에서 가장 가까운 보이는 점. 구간이 없으면 null. */
export function nearestVisible(segs, x) {
  let best = null
  let bestD = Infinity
  for (const [a, b] of segs || []) {
    const p = Math.min(b, Math.max(a, x))
    const d = Math.abs(p - x)
    if (d < bestD) {
      bestD = d
      best = p
    }
  }
  return best
}

/** 구간들의 길이 합. */
export function visibleLength(segs) {
  let sum = 0
  for (const [a, b] of segs || []) sum += b - a
  return sum
}
