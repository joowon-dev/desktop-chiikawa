#!/bin/bash
# build/icon.png(1024) 와 build/tray.png(64, 템플릿) 를 그린다. 그림은 src/render/draw.js 그대로.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
port=8769
python3 -m http.server $port --directory "$root" >/dev/null 2>&1 &
server=$!
trap 'kill $server' EXIT
sleep 1
shoot() { # 크기 파일 쿼리
  "$chrome" --headless=new --disable-gpu --hide-scrollbars --default-background-color=00000000 \
    --window-size=$1,$1 --virtual-time-budget=2000 --screenshot="$2" \
    "http://localhost:$port/scripts/icon.html$3" >/dev/null 2>&1
}
mkdir -p "$root/build"
shoot 1024 "$root/build/icon.png" ""
shoot 64 "$root/build/tray.png" "?tray"
echo "› build/icon.png, build/tray.png"
