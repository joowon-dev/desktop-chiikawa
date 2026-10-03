#!/bin/bash
# 윈도우 앱을 만든다. **맥에서도 된다** — 윈도우가 필요하다고 오래 알려져 있었지만,
# net9.0-windows 를 다른 OS 에서 빌드하려면 EnableWindowsTargeting 를 켜 주면 그만이다.
# (참조 어셈블리를 NuGet 으로 받아 쓴다. 실행은 당연히 윈도우에서만 된다.)
#
#   windows/build.sh          → dist/win/
#   windows/build.sh --zip    → dist/DesktopChiikawa-win-x64.zip 까지
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

# dotnet 이 PATH 에 없을 수 있다. 손으로 받아 둔 자리도 본다.
if ! command -v dotnet >/dev/null 2>&1; then
  if [ -x "$HOME/.dotnet/dotnet" ]; then
    export PATH="$HOME/.dotnet:$PATH"
  else
    echo ".NET SDK 가 없습니다. https://dotnet.microsoft.com/download 에서 9.0 을 받으세요." >&2
    exit 1
  fi
fi

echo "› 빌드"
dotnet publish windows/DesktopChiikawa.csproj -c Release -o dist/win \
  -p:EnableWindowsTargeting=true

# 디버그 심볼은 배포본에 넣지 않는다.
rm -f dist/win/*.pdb

du -sh dist/win | awk '{print "› 폴더 " $1}'

if [ "${1:-}" = "--zip" ]; then
  rm -f dist/DesktopChiikawa-win-x64.zip
  (cd dist/win && zip -rq ../DesktopChiikawa-win-x64.zip . -x '.*')
  du -h dist/DesktopChiikawa-win-x64.zip | awk '{print "› zip " $1}'
fi
