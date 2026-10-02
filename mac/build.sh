#!/bin/bash
# macOS 앱을 만든다. Xcode 프로젝트 없이 swiftc 로 바로 컴파일하고 .app 을 손으로 조립한다.
#   mac/build.sh            → dist/mac/Chiikawa.app
#   mac/build.sh --zip      → dist/DesktopChiikawa-mac.zip 까지
#
# 게임 코드(src/)는 그대로 Resources/web 에 들어간다. 빌드 단계에서 변형하지 않는다.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
name="Chiikawa"
out="$root/dist/mac"
appdir="$out/$name.app"

rm -rf "$appdir"
mkdir -p "$appdir/Contents/MacOS" "$appdir/Contents/Resources"

echo "› 컴파일"
swiftc -O -whole-module-optimization \
  -target arm64-apple-macos13 \
  -o "$appdir/Contents/MacOS/DesktopChiikawa" \
  "$root/mac/Sources/main.swift"

# 인텔 맥에서도 돌도록 x86_64 로도 한 번 더 만들어 합친다.
if swiftc -O -target x86_64-apple-macos13 -o "$out/.intel" "$root/mac/Sources/main.swift" 2>/dev/null; then
  lipo -create "$appdir/Contents/MacOS/DesktopChiikawa" "$out/.intel" \
    -output "$appdir/Contents/MacOS/DesktopChiikawa.universal"
  mv "$appdir/Contents/MacOS/DesktopChiikawa.universal" "$appdir/Contents/MacOS/DesktopChiikawa"
  rm -f "$out/.intel"
  echo "› 유니버설 (arm64 + x86_64)"
fi

echo "› 리소스"
cp "$root/mac/Info.plist" "$appdir/Contents/Info.plist"
mkdir -p "$appdir/Contents/Resources/web"
cp -R "$root/src/game" "$root/src/render" "$root/src/renderer" "$appdir/Contents/Resources/web/"

# 아이콘: build/icon.png → icns
if [ -f "$root/build/icon.png" ]; then
  iconset="$out/icon.iconset"  # iconutil 은 .iconset 로 끝나는 이름만 받는다
  rm -rf "$iconset" && mkdir -p "$iconset"
  for size in 16 32 128 256 512; do
    sips -z $size $size "$root/build/icon.png" --out "$iconset/icon_${size}x${size}.png" >/dev/null
    sips -z $((size * 2)) $((size * 2)) "$root/build/icon.png" \
      --out "$iconset/icon_${size}x${size}@2x.png" >/dev/null
  done
  iconutil -c icns "$iconset" -o "$appdir/Contents/Resources/icon.icns"
  rm -rf "$iconset"
fi

# 메뉴바 아이콘. 없으면 셸이 이모지로 대신한다.
if [ -f "$root/build/tray.png" ]; then
  cp "$root/build/tray.png" "$appdir/Contents/Resources/tray.png"
fi

# 서명이 없으면 macOS 가 손상된 앱으로 보기도 한다. 임시(ad-hoc) 서명이라도 붙여 둔다.
codesign --force --deep --sign - "$appdir" 2>/dev/null && echo "› 임시 서명" || echo "› 서명 건너뜀"

du -sh "$appdir" | awk '{print "› 앱 크기 " $1}'

if [ "${1:-}" = "--zip" ]; then
  mkdir -p "$root/dist"
  (cd "$out" && ditto -c -k --keepParent "$name.app" "$root/dist/DesktopChiikawa-mac.zip")
  du -h "$root/dist/DesktopChiikawa-mac.zip" | awk '{print "› zip " $1}'
fi
