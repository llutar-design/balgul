@echo off
chcp 65001 > nul
rem 백제 역사 체험관 (4종 게임) - 주소창 없는 전체 화면 앱 창으로 실행합니다. 끝낼 때는 Alt+F4 를 누르세요.
rem (Edge 키오스크 모드는 항상 InPrivate 로 열려 수집 기록이 지워지므로 --app 전체 화면 방식을 씁니다)
cd /d "%~dp0"
set "GAME=%~dp0index.html"
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"

if exist "%EDGE%" (
  start "" "%EDGE%" --app="file:///%GAME:\=/%" --start-fullscreen --no-first-run --user-data-dir="%LOCALAPPDATA%\BaekjeTreasure\edge"
  goto :eof
)
if exist "%CHROME%" (
  start "" "%CHROME%" --app="file:///%GAME:\=/%" --start-fullscreen --no-first-run --user-data-dir="%LOCALAPPDATA%\BaekjeTreasure\chrome"
  goto :eof
)
start "" "%GAME%"
