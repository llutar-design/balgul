# 체험관 게임 모듈 연결 규약 (GAME_API)

백제 역사 체험관(`js/hub.js`)은 게임 모듈을 한 번에 하나만 실행합니다.
새 게임은 `js/games/<id>.js` 한 파일(필요하면 `css/<id>.css`, `data/<id 관련>.json`)로 만들고 스스로 등록합니다.

## 로딩 방식
- ES 모듈·번들러를 쓰지 않습니다. 모든 파일은 일반 `<script>`로 읽습니다(`file://` 더블 클릭 실행 지원).
- 파일 전체를 `(function () { 'use strict'; ... })();` 로 감싸고 전역 변수를 만들지 않습니다(등록 호출만).
- 데이터는 `window.BAEKJE_DATA.<이름>` 으로 읽습니다. `data/<이름>.json` 을 고친 뒤 `powershell -ExecutionPolicy Bypass -File tools/build-data.ps1` 을 실행하면 `data/data.js` 가 다시 만들어집니다.
  묶이는 이름: artifacts, questions, stages, historyCards, buildings, crossword, defenseStages.

## 등록
```js
BaekjeHub.register({
  id: 'village',                       // 'village' | 'crossword' | 'defense'
  notice: '교육용 가상 재구성…',          // (선택) 게임 설명 창에 표시할 주의 문구
  teacher: function (host) {},          // (선택) 선생님 설정의 데이터 편집 창을 연다
  teacherLabel: '✏️ 십자 낱말 문제 수정', // (선택)
  mount: function (root, host) {        // 게임 시작. root = 1920×1080 크기의 빈 div
    ...
    return { unmount: fn, pause: fn, resume: fn };
  }
});
```
- `unmount()`: requestAnimationFrame, setInterval/setTimeout, window/document 이벤트를 모두 정리합니다. root 의 DOM 은 체험관이 지웁니다.
- `pause()` / `resume()`: 선생님 설정·나가기 확인 창이 열리고 닫힐 때 호출됩니다(시간·웨이브·생산 멈춤).

## host (체험관이 넘겨주는 도구)
| 이름 | 설명 |
|---|---|
| `host.options` | `{ players: 1~4, difficulty: 'easy'|'normal'|'hard', grade: 1~6, timeLimit: 분(0=없음), unlockAll: bool, testMode: bool }` |
| `host.data` | `window.BAEKJE_DATA` 전체 |
| `host.PCOL`, `host.PNAME`, `host.SIDES` | 플레이어 색 `['#e8553e','#3e8acb','#4caf6a','#b55bd6']`, 이름 `['빨강','파랑','초록','보라']`, 자리 `['bottom','top','left','right']` |
| `host.mapPoint(clientX, clientY)` | 화면 좌표 → 1920×1080 무대 좌표(확대·축소와 180° 회전 반영). **포인터 좌표는 반드시 이것으로 변환** |
| `host.scale()` | 현재 무대 배율(캔버스 선명도 계산용) |
| `host.sound(name, p)` | 효과음. 기존: tap select correct wrong snap fanfare place whoosh sparkle found note rumble grand clink. 체험관용: build coin tile erase word word2 arrow hit poof thud horn alarm lose. 새 소리는 `Sound.define(name, function (a) { a.tone(f, dur, {type, gain, delay, slide}); a.noise(dur, {freq, filter, q, gain, delay}); })` |
| `host.load()` / `host.save(obj)` | 게임별 저장(localStorage `baekje-hub.game.<id>`). 저장 실패 시 false(메모리에는 유지) |
| `host.toast(text, {big, dur, key})` | 화면 가운데 짧은 안내 |
| `host.modal(nodeOrHtml, {close: true, cls: 'wide'|'small', onClose})` | 모달 창 → `{ body, card, close() }` |
| `host.award({ key, stars, codex: [카드id], badge: {id, name, icon}, silent })` | 공통 보상. `key` 별 최고 별(0~3)만 기록. 반환 `{ newCodex: [카드], starsGained, newBadge }` |
| `host.setRecord(text)` | 체험관 카드에 보일 한 줄 기록(예: '최고 3단계 · 별 7') |
| `host.card(id)` | 역사 카드(`data/historyCards.json`, 선생님 수정 반영) → `{ id, category, title, icon, text, note, source }` |
| `host.isUnlockedCard(id)` | 도감에 이미 등록되었는지 |
| `host.exit()` | 체험관 메인으로 돌아가기 |
| `host.error(e)` | 처리한 오류 보고(짧은 시간에 3번 쌓이면 이 게임만 닫힘) |

## 화면 규칙
- 왼쪽 위 120×120 영역에는 체험관의 🏛️(나가기) 버튼이 있습니다. 비워 두세요.
- 네 모서리 58×58 은 선생님 설정 길게 누르기 영역입니다.
- 버튼은 최소 72×72(권장 90 이상), 글자는 최소 22px.
- 공통 클래스 사용 가능: `.big-btn(.primary)`, `.seg(.on)`, `.pill`, `.badge-chip`. 게임 CSS 클래스는 접두어(`vg-`, `cw-`, `df-`)를 붙입니다.
- 멀티터치: Pointer Events + `pointerId` 별 상태, `setPointerCapture`, `pointercancel`·`lostpointercapture` 정리, `touch-action: none`.
