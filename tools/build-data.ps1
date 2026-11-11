# data/*.json 파일을 data/data.js 하나로 묶습니다.
# index.html 을 더블 클릭(file://)으로 열면 브라우저 보안 정책 때문에 JSON 파일을 직접 읽을 수 없어서,
# 게임은 이 data.js 를 사용합니다. JSON 을 고친 뒤에는 이 스크립트(또는 "데이터 갱신.bat")를 실행하세요.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dataDir = Join-Path $root 'data'
$utf8 = New-Object System.Text.UTF8Encoding($false)

$names = @('artifacts', 'questions', 'stages', 'historyCards', 'buildings', 'crossword', 'defenseStages')
$parts = @()
foreach ($name in $names) {
  $path = Join-Path $dataDir "$name.json"
  if (-not (Test-Path $path)) { Write-Host "($name.json 없음 - 건너뜀)"; continue }
  $text = [System.IO.File]::ReadAllText($path, $utf8)
  if ($text.Length -gt 0 -and $text[0] -eq [char]0xFEFF) { $text = $text.Substring(1) }
  try { $null = $text | ConvertFrom-Json } catch { throw "$name.json 파일의 형식이 올바르지 않아요: $($_.Exception.Message)" }
  $parts += "  `"$name`": " + $text.Trim()
}

$js = "/* 자동 생성 파일 - 직접 고치지 말고 data/*.json 을 고친 뒤 tools/build-data.ps1 을 실행하세요. */`n" +
      "window.BAEKJE_DATA = {`n" + ($parts -join ",`n") + "`n};`n"
# 여러 작업이 동시에 실행돼도 반쯤 쓴 파일을 읽지 않도록 임시 파일에 쓴 뒤 바꿔 넣는다
$tmp = Join-Path $dataDir ("data.js." + [guid]::NewGuid().ToString("N").Substring(0, 6) + ".tmp")
[System.IO.File]::WriteAllText($tmp, $js, $utf8)
Move-Item -Force $tmp (Join-Path $dataDir 'data.js')
Write-Host "data/data.js 를 만들었어요."
