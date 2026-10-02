// 시드 고정 난수 (mulberry32). 상태는 world.rng 안의 정수 하나다 — Math.random() 을 안 쓴다.

export function rand(world) {
  world.rng = (world.rng + 0x6d2b79f5) >>> 0
  let t = world.rng
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export function between(world, lo, hi) {
  return lo + (hi - lo) * rand(world)
}

export function pick(world, list) {
  return list[Math.floor(rand(world) * list.length)]
}

/** [[값, 무게], …] 에서 하나. 무게가 다 0 이면 null. */
export function weighted(world, entries) {
  let total = 0
  for (const [, w] of entries) total += Math.max(0, w)
  if (total <= 0) return null
  let r = rand(world) * total
  for (const [value, w] of entries) {
    r -= Math.max(0, w)
    if (r < 0) return value
  }
  return entries[entries.length - 1][0]
}
