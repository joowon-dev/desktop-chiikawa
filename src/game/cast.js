// 등장인물. 그림은 render/draw.js 가 kind 로 고른다 — 여기는 성격만.

export const KINDS = ['chiikawa', 'hachiware', 'usagi', 'momonga']

export const CAST = {
  chiikawa: {
    name: '치이카와',
    speed: 40,       // 걷는 속도 px/s
    hop: 420,        // 제자리 뛰기 초속
    jumpy: 0.8,      // 다른 창으로 뛰는 성향 (무게 배율)
    sleepy: 1.4,
    lines: ['와…', '히잉…', '…!', '우와아', '해냈다…!'],
  },
  hachiware: {
    name: '하치와레',
    speed: 50,
    hop: 460,
    jumpy: 1.0,
    sleepy: 1.0,
    lines: ['어떻게든 되겠지~!', '치이카와!', '♪', '괜찮아 괜찮아', '맛있겠다~'],
  },
  usagi: {
    name: '우사기',
    speed: 85,
    hop: 620,
    jumpy: 2.2,
    sleepy: 0.4,
    lines: ['우라!', '야하!', '프루루루루', '하?', '야~하~!'],
  },
  momonga: {
    name: '모몽가',
    speed: 58,
    hop: 500,
    jumpy: 1.3,
    sleepy: 0.8,
    lines: ['귀엽다고 해 줘!', '흥!', '♡', '나 좀 봐!'],
  },
}
