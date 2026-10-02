// 등장인물. 그림은 render/draw.js 가 kind 로 고른다 — 여기는 성격만.
//
// 그림 폴더에 이 목록에 없는 이름의 그림(예: kani.png)을 넣으면 그 아이도 나온다.
// 성격은 DEFAULT 를 쓰고, 말풍선은 공통 대사에서 고른다.

/** 그림 파일 없이도 그릴 수 있는 아이들(draw.js 에 도형이 있다). 나오는 순서이기도 하다. */
export const KINDS = ['chiikawa', 'hachiware', 'usagi', 'momonga', 'kurimanju', 'rakko', 'shisa']

export const CAST = {
  chiikawa: {
    name: '치이카와',
    speed: 40,       // 걷는 속도 px/s
    hop: 420,        // 제자리 뛰기 초속
    jumpy: 0.8,      // 다른 창으로 뛰는 성향 (무게 배율)
    sleepy: 1.4,
    moves: { weed: 1.6, cry: 0.8, eat: 0.8, dance: 0.4 },
    food: ['🍙', '🍮', '🍡'],
    lines: ['와…', '히잉…', '…!', '우와아', '해냈다…!'],
  },
  hachiware: {
    name: '하치와레',
    speed: 50,
    hop: 460,
    jumpy: 1.0,
    sleepy: 1.0,
    moves: { sing: 1.4, eat: 0.8, dance: 0.8 },
    food: ['🍜', '🍡', '🍙'],
    lines: ['어떻게든 되겠지~!', '치이카와!', '♪', '괜찮아 괜찮아', '맛있겠다~'],
  },
  usagi: {
    name: '우사기',
    speed: 85,
    hop: 620,
    jumpy: 2.2,
    sleepy: 0.4,
    moves: { dance: 1.6, eat: 0.6 },
    spin: 0.7,       // 뛸 때 공중제비 확률
    food: ['🍮', '🍙', '🍤'],
    lines: ['우라!', '야하!', '프루루루루', '하?', '야~하~!'],
  },
  momonga: {
    name: '모몽가',
    speed: 58,
    hop: 500,
    jumpy: 1.3,
    sleepy: 0.8,
    moves: { pose: 1.4, eat: 0.6, cry: 0.4 },
    food: ['🍰', '🍓'],
    lines: ['귀엽다고 해 줘!', '흥!', '♡', '나 좀 봐!'],
  },
  kurimanju: {
    name: '쿠리만쥬',
    speed: 30,
    hop: 380,
    jumpy: 0.5,
    sleepy: 2.0,
    moves: { drink: 2.0, eat: 0.8 },
    food: ['🍢', '🍘'],
    lines: ['하~', '하아~ 맛있다', '한 잔 더…', '…하~'],
  },
  rakko: {
    name: '랏코',
    speed: 62,
    hop: 560,
    jumpy: 1.6,
    sleepy: 0.6,
    moves: { train: 1.4, eat: 0.6 },
    spin: 0.25,
    food: ['🍔', '🍙'],
    lines: ['…', '토벌 간다', '훗', '…좋아'],
  },
  shisa: {
    name: '시사',
    speed: 55,
    hop: 480,
    jumpy: 1.1,
    sleepy: 0.7,
    moves: { eat: 1.4, dance: 0.5 },
    food: ['🍜'],
    lines: ['열심히 할게요!', '히에~', '어서 오세요!', '라멘 드실래요?'],
  },
}

const DEFAULT = {
  name: '친구',
  moves: { dance: 0.8, eat: 0.6 },
  food: ['🍙', '🍡'],
  speed: 48,
  hop: 460,
  jumpy: 1.0,
  sleepy: 1.0,
  lines: ['♪', '…!', '♡', '야하!', '와…'],
}

export function castOf(kind) {
  return CAST[kind] || DEFAULT
}

/**
 * 특기. 아이마다 무게(cast.moves)가 달라서 치이카와는 풀을 뽑고 하치와레는 노래한다.
 * t 는 하는 시간(초) 범위, line 은 시작할 때 말풍선(없으면 null).
 */
export const MOVES = {
  dance: { t: [3, 5], line: '♪' },
  eat: { t: [3, 5], line: '냠냠' },
  cry: { t: [2.5, 4], line: '흑…' },
  weed: { t: [4, 7], line: null },      // 치이카와의 일: 풀 뽑기
  sing: { t: [3, 5], line: '♪~' },
  drink: { t: [3, 5], line: '하~' },
  pose: { t: [2, 3], line: '어때?' },
  train: { t: [3, 5], line: '하앗!' },
}
