// 숫자는 전부 여기. 단위는 화면 포인트(px)와 초다.

/** 고정 타임스텝. 프레임 시간을 그대로 적분하면 기계마다 점프 높이가 달라진다. */
export const STEP = 1 / 60

/** 중력 (px/s²). */
export const GRAVITY = 2600

/** 캐릭터 한 마리의 그림 크기. 발이 (x, y) 이고 몸은 그 위로 CHAR_H 만큼. */
export const CHAR_W = 40
export const CHAR_H = 46

/** 창 위쪽 모서리가 이보다 위에 있으면 설 수 없다 — 전체 화면 앱은 캐릭터가 화면 밖에 선다. */
export const MIN_TOP = 20

/** 이보다 작은 창은 창으로 치지 않는다 — 툴팁·팝오버·작은 패널. */
export const MIN_WIN_W = 160
export const MIN_WIN_H = 90

/** 창 끝에서 이만큼 안쪽까지만 걷는다. 둥근 모서리 위에 서 있으면 떠 보인다. */
export const EDGE_MARGIN = 14

/**
 * 앞 창이 발밑 이만큼(px)을 덮으면 그 자리는 「가려졌다」. 머리만 살짝 덮이는 것은
 * 가려진 걸로 치지 않는다 — 그 정도는 그림이 잘려도 서 있는 게 보인다.
 */
export const COVER_BAND = 18

/** 완전히 가려진 채로 이만큼 지나면 보이는 창으로 다시 튀어나온다. */
export const COVER_LIMIT = 4

/** 새 창이 뜨고 나서 튀어나오기까지. 금방 사라지는 창에는 안 나오게. */
export const POP_DELAY = 0.45
/** 처음 켰을 때 창이 여럿이면 한 마리씩 차례로 나온다. */
export const BURST_GAP = 0.35
/** 화면 밖으로 떨어진 아이가 다시 나오기까지. */
export const REPOP_DELAY = 1.4

/** 튀어나올 때 창 위로 이만큼 더 솟았다가 내려앉는다. */
export const POP_APEX = 70

/** 기본으로 화면에 있을 수 있는 최대 마리 수. */
export const DEFAULT_MAX_CHARS = 8

/** 다른 창으로 뛸 수 있는 거리. 위로는 RISE 까지만. */
export const JUMP_REACH = 650
export const JUMP_RISE = 360

/** 뛰기 전에 웅크리는 시간. */
export const CROUCH = 0.22

/** 창이 한 번 갱신될 때 이만큼 넘게 움직이면 위에 있는 아이들이 휘청인다. */
export const SHAKE_MOVE = 18

/** 마우스가 이 거리 안에 오면 쳐다본다 / 더 가까우면 반가워한다. */
export const MOUSE_LOOK = 140
export const MOUSE_HAPPY = 70

/** 붙어 있는 두 아이가 같이 신나 할 거리. */
export const FRIEND_DIST = 56
