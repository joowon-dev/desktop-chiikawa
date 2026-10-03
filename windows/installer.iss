; 윈도우 설치본. Inno Setup 6 으로 만든다.
;
;   dotnet publish windows/DesktopChiikawa.csproj -c Release -o dist/win
;   iscc /DAppVersion=1.0.0 windows/installer.iss
;
; **자동 업데이트가 이 설치본을 조용히 다시 돌린다**(`/SILENT`). 그래서
; CloseApplications 로 돌던 앱을 닫고, RestartApplications 로 새 것을 다시 띄운다 —
; 이게 없으면 업데이트가 「아이들이 사라진 것」처럼 보인다.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

[Setup]
AppId={{29A53C3F-550F-4FD9-B133-19ECE19C38B5}
AppName=Desktop Chiikawa
AppVersion={#AppVersion}
AppPublisher=JooWon Koh
DefaultDirName={autopf}\Desktop Chiikawa
DefaultGroupName=Desktop Chiikawa
DisableProgramGroupPage=yes
; 관리자 권한 없이 사용자 폴더에 깐다. 조용한 업데이트에 UAC 창이 뜨면 안 된다.
PrivilegesRequired=lowest
OutputDir=..\dist
OutputBaseFilename=DesktopChiikawa-win-Setup
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
SetupIconFile=icon.ico
UninstallDisplayIcon={app}\DesktopChiikawa.exe
CloseApplications=yes
RestartApplications=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "korean"; MessagesFile: "compiler:Languages\Korean.isl"

[Tasks]
; 치이카와는 켜 두고 사는 앱이다 — 야구와 달리 기본으로 켠다. 껐다 켜면 아이들이 없어진
; 것처럼 보이는 쪽이 더 이상하다.
Name: "startup"; Description: "윈도우를 켤 때 함께 실행"; GroupDescription: "추가 설정:"

[Files]
Source: "..\dist\win\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Desktop Chiikawa"; Filename: "{app}\DesktopChiikawa.exe"
Name: "{userstartup}\Desktop Chiikawa"; Filename: "{app}\DesktopChiikawa.exe"; Tasks: startup

[Run]
; 설치가 끝나면 바로 띄운다. 조용한 업데이트일 때는 RestartApplications 가 대신 한다.
Filename: "{app}\DesktopChiikawa.exe"; Description: "지금 실행"; Flags: nowait postinstall skipifsilent
