#!/bin/bash
# .app → dmg. 받는 사람이 마운트해서 Applications 로 끌어 넣는, 그 흔한 창을 만든다.
#
# zip 보다 이걸 기본으로 두는 이유: **스테이플을 dmg 자체에 박을 수 있다.** 그러면 처음
# 여는 맥이 오프라인이어도 검증이 끝나 있고, 「받은 zip 을 어디에 풀어야 하나」가 없어진다.
#
#   ./mac/dmg.sh          → dist/DesktopChiikawa-mac.dmg (임시 서명. 배포용 아님)
#   ./mac/notarize.sh     → 서명·공증·스테이플까지 한 dmg (배포용은 반드시 이것)
set -euo pipefail

cd "$(dirname "$0")/.."
name="Chiikawa"
app="dist/mac/$name.app"
dmg="dist/DesktopChiikawa-mac.dmg"
stage="dist/.dmg-stage"

[ -d "$app" ] || ./mac/build.sh

echo "› dmg 만들기"
rm -rf "$stage" "$dmg"
mkdir -p "$stage" dist
cp -R "$app" "$stage/"
# 창 안에서 바로 끌어 넣을 수 있게 Applications 를 옆에 세워 둔다.
ln -s /Applications "$stage/Applications"

hdiutil create -volname "$name" -srcfolder "$stage" -ov -format UDZO -quiet "$dmg"
rm -rf "$stage"

du -h "$dmg" | awk '{print "› " $1 "  " $2}'
