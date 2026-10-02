// 브라우저로 열었을 때만 도는 가짜 창들. 끌어 옮기고, 크기를 바꾸고, 새로 띄우고 닫는다.
// 앱에서는 셸이 진짜 창 목록을 주므로 이 파일은 안 쓰인다.

const TITLES = ['메모', '브라우저', '터미널', '사진', '메일', '캘린더', '음악', 'Finder']
const DOTS = ['#ff5f57', '#febc2e', '#28c840']

export function startDemo({ onWindows, onMouse }) {
  document.body.classList.add('demo')
  const root = document.getElementById('demo')
  let wins = [] // 앞에서 뒤 순서: { id, el, x, y, w, h }
  let nextId = 1

  const help = document.createElement('div')
  help.className = 'demo-help'
  help.textContent = '브라우저 데모 — N 새 창 · X 맨 앞 창 닫기 · 제목줄 끌어 옮기기 · 오른쪽 아래 끌어 크기'
  document.body.appendChild(help)

  function publish() {
    wins.forEach((win, i) => {
      win.el.style.zIndex = String(1000 - i)
      Object.assign(win.el.style, { left: `${win.x}px`, top: `${win.y}px`, width: `${win.w}px`, height: `${win.h}px` })
    })
    onWindows(wins.map((win) => [win.id, win.x, win.y, win.w, win.h]))
  }

  function toFront(win) {
    wins = [win, ...wins.filter((other) => other !== win)]
    publish()
  }

  function add(x, y, w, h) {
    const id = nextId++
    const el = document.createElement('div')
    el.className = 'fake-win'
    el.innerHTML = `<div class="bar">${DOTS.map((c) => `<i style="background:${c}"></i>`).join('')}
      <span style="margin-left:8px">${TITLES[(id - 1) % TITLES.length]}</span></div><div class="resize"></div>`
    root.appendChild(el)
    const win = { id, el, x, y, w, h }
    wins.unshift(win)

    el.addEventListener('pointerdown', () => toFront(win))
    drag(el.querySelector('.bar'), (dx, dy) => {
      win.x += dx
      win.y += dy
      publish()
    })
    drag(el.querySelector('.resize'), (dx, dy) => {
      win.w = Math.max(180, win.w + dx)
      win.h = Math.max(100, win.h + dy)
      publish()
    })
    publish()
    return win
  }

  function closeFront() {
    const win = wins.shift()
    if (!win) return
    win.el.remove()
    publish()
  }

  function drag(handle, move) {
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      let px = e.clientX
      let py = e.clientY
      const onMove = (ev) => {
        move(ev.clientX - px, ev.clientY - py)
        px = ev.clientX
        py = ev.clientY
      }
      const onUp = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    })
  }

  window.addEventListener('pointermove', (e) => onMouse({ x: e.clientX, y: e.clientY }))
  window.addEventListener('keydown', (e) => {
    if (e.key === 'n' || e.key === 'N') {
      const W = window.innerWidth
      const H = window.innerHeight
      const w = 300 + ((nextId * 97) % 300)
      const h = 200 + ((nextId * 53) % 200)
      add(((nextId * 211) % Math.max(1, W - w)), 60 + ((nextId * 131) % Math.max(1, H - h - 80)), w, h)
    }
    if (e.key === 'x' || e.key === 'X') closeFront()
  })

  // 처음 화면.
  add(820, 260, 480, 340)
  add(140, 340, 560, 380)
  add(420, 140, 420, 260)
  // 디버그용 손잡이.
  window.__demo = { add, closeFront, get wins() { return wins } }
}
