#!/bin/bash
# 서명 → 애플 공증 → 스테이플까지. 이걸 거쳐야 내려받은 앱이 더블클릭으로 열린다.
#
# build.sh 의 임시(ad-hoc) 서명으로는 안 된다. 임시 서명은 "누가 만들었는지"가 없어서
# Gatekeeper 가 막고, macOS 15 부터는 우클릭 → 열기 우회도 사라졌다.
#
# 처음 한 번만 (webswing 과 같은 프로필을 그대로 쓴다):
#   xcrun notarytool store-credentials webswing-notary \
#     --apple-id "..." --team-id "7A77FCP9H4" --password "앱 암호"
#
# 쓰기:  ./mac/notarize.sh
set -euo pipefail

cd "$(dirname "$0")/.."
IDENTITY="${1:-Developer ID Application: JooWon Koh (7A77FCP9H4)}"
PROFILE="${2:-webswing-notary}"
APP="dist/mac/Chiikawa.app"
ZIP="dist/DesktopChiikawa-mac.zip"
# zip 은 **자동 업데이트가 받아 가는 것**이고, dmg 는 사람이 처음 설치할 때 받는 것이다.
# 둘 다 만든다 — 앱이 dmg 를 마운트해서 자기를 갈아 끼우게 하면 실패할 자리가 너무 많다.
DMG="dist/DesktopChiikawa-mac.dmg"

if ! security find-identity -v -p codesigning | grep -q "$IDENTITY"; then
    echo "인증서가 없습니다: $IDENTITY" >&2
    echo "쓸 수 있는 것:" >&2
    security find-identity -v -p codesigning | grep "Developer ID Application" >&2 || echo "  (없음)" >&2
    exit 1
fi

./mac/build.sh

echo "› Developer ID 로 서명"
# 공증에는 하ardened runtime 이 필요하고, 인증서가 만료돼도 서명이 살아 있으려면 timestamp 가 필요하다.
# --deep 은 쓰지 않는다 — 애플이 권하지 않고, 번들 안에 따로 서명할 코드가 없다(바이너리 하나 + web/).
codesign --force --options runtime --timestamp --sign "$IDENTITY" "$APP"
codesign --verify --strict --verbose=2 "$APP"

echo "› 서명한 걸로 다시 압축"
rm -f "$ZIP"
mkdir -p dist
ditto -c -k --keepParent "$APP" "$ZIP"

echo "› 애플에 제출 (보통 몇 분)"
xcrun notarytool submit "$ZIP" --keychain-profile "$PROFILE" --wait

# 스테이플은 공증 티켓을 번들 안에 박아 둔다 — 처음 여는 맥이 오프라인이어도 열린다.
echo "› 스테이플"
xcrun stapler staple "$APP"
xcrun stapler validate "$APP"

echo "› 스테이플한 걸로 다시 압축"
rm -f "$ZIP"
ditto -c -k --keepParent "$APP" "$ZIP"

echo "› Gatekeeper 가 보는 대로 검증"
spctl --assess --type execute --verbose=4 "$APP"

# dmg 도 따로 공증한다. **앱을 공증한 것과 dmg 를 공증한 것은 다른 일이다** —
# 스테이플이 dmg 에 박혀 있어야 처음 여는 맥이 오프라인이어도 마운트가 통과한다.
echo "› dmg 만들기"
./mac/dmg.sh

# **dmg 에도 서명한다.** 스테이플만 박으면 `stapler validate` 는 통과하지만
# Gatekeeper 는 「no usable signature」로 거절한다 — 안의 앱이 멀쩡해도 dmg 를 열 때
# 한 번 더 물어본다. 서명은 파일을 바꾸므로 **공증보다 먼저** 해야 한다(뒤에 하면 스테이플이 깨진다).
echo "› dmg 서명"
codesign --force --timestamp --sign "$IDENTITY" "$DMG"

echo "› dmg 제출"
xcrun notarytool submit "$DMG" --keychain-profile "$PROFILE" --wait
xcrun stapler staple "$DMG"
xcrun stapler validate "$DMG"

# 받는 사람의 맥이 dmg 를 볼 때 그대로. execute 가 아니라 open 이다.
spctl -a -t open --context context:primary-signature -vv "$DMG"

du -h "$ZIP" "$DMG" | awk '{print "› " $1 "  " $2}'
echo "› 끝났습니다 — dmg 를 열면 바로 끌어 넣을 수 있습니다"
