#!/bin/bash
# 릴스 찍을 때 쓰는 배경을 그린다 → reels/ (그림은 scripts/reels-bg.html, 크롬 필요)
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
port=8772
python3 -m http.server $port --directory "$root" >/dev/null 2>&1 &
server=$!
trap 'kill $server' EXIT
sleep 1
mkdir -p "$root/reels"
shoot() { # 가로 세로 파일 쿼리
  "$chrome" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --window-size=$1,$2 --virtual-time-budget=4000 --screenshot="$root/reels/$3" \
    "http://localhost:$port/scripts/reels-bg.html?w=$1&h=$2$4" >/dev/null 2>&1
}
shoot 3456 2234 wallpaper-mac-3456x2234.png ""
shoot 2560 1440 wallpaper-2560x1440.png ""
shoot 1080 1920 reels-1080x1920-title.png "&title=1"
shoot 1080 1920 reels-1080x1920.png ""
ls -la "$root/reels"
