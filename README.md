# 💪 Healthy 9 — 30일 데일리 운동 플래너

> 하루 30~40분, 2026.11.17 ~ 12.16 · 모바일 우선 PWA · Notion DB 실시간 연동

[goo-todo](https://github.com/sweet1203/goo-todo) · [goo-diary](https://github.com/sweet1203/goo-diary) 와 같은 밝고 귀여운 파스텔(핑크·라벤더·민트) 디자인으로 만든 운동 체크 웹앱입니다.

## ✨ 기능

- 📅 **한국시간 기준 오늘 날짜·요일·아침 운동 장소** 자동 표시 (월·수·토 헬스장 / 화·목·금·일 집)
- ⏱️ **시간순 운동 체크리스트** — 날짜별 페이지의 세부 운동을 그대로 불러와 체크
- 🔽 **접이식 세트·횟수·자세 설명**
- 📷 **요일별 기구 실물사진·사용법** Notion 가이드 페이지 바로가기
- 🌙 **저녁 운동** — 테니스 기초연습(10~20분, 화·목은 + 수영, 금은 테니스 레슨) 한 번에 체크
- 🚶 **산책** 체크
- ✍️ **선택적 한줄메모**
- 🗓️ **달력 뷰 + 전체 진행률**
- 📱 **PWA** — 홈 화면에 추가해 앱처럼 사용
- 🔒 **안전한 저장** — 체크·메모는 서버를 거쳐 Notion DB에 저장, Notion 토큰은 서버 환경변수로만 보관(브라우저 노출 없음)

> 허리둘레·수면시간·중량 등은 입력하지 않습니다. (2027 목표: 턱걸이 1개 · 복부 관리)

## 🧩 구조

```
index.html        단일 페이지 프론트엔드 (PWA)
manifest.json     PWA 매니페스트
sw.js             서비스워커 (앱 셸 캐시 / API 는 항상 네트워크)
api/auth.js       비밀번호 로그인 (DEV_PASSWORD)
api/day.js        Notion 프록시 (조회 + 체크/메모 저장)
```

### 저장 방식 (데이터 보존)

| 화면 요소 | Notion 저장 위치 | 방식 |
|---|---|---|
| 아침/저녁/산책 완료 | DB **속성**(checkbox) | 페이지 속성 PATCH |
| 한줄메모 | DB **속성**(`한줄메모` text) | 페이지 속성 PATCH |
| 개별 운동 항목 | 날짜별 페이지 **본문 to-do 블록** | `PATCH /blocks/{id}` 의 `checked` 만 변경 |

본문 블록은 **지우거나 새로 만들지 않고** 체크 상태만 바꾸므로, 노션에 직접 적어둔 내용이 보존됩니다.

## 🚀 배포 (Vercel)

1. 이 저장소를 Vercel 에 Import (Framework Preset: **Other**)
2. **Settings → Environment Variables** 에 추가:
   - `DEV_PASSWORD` — 앱 로그인 비밀번호
   - `NOTION_TOKEN` — Notion 내부 통합 토큰 ([my-integrations](https://www.notion.so/my-integrations))
   - `NOTION_DB_ID` — `41a0fb7d-31de-8143-a1a7-df5474a9e8ce` (기본 내장, 생략 가능)
3. Notion 에서 **"Healthy 9 | 30일 데일리 운동 플래너"** 페이지(및 하위 DB·날짜 페이지)를 위 통합에 **Connect(공유)** 합니다.
   - 상위 페이지를 공유하면 하위 30개 날짜 페이지까지 상속됩니다.
4. Deploy → 발급된 URL 을 모바일에서 열고, 비밀번호로 로그인하면 끝!

로컬 개발: `npx vercel dev` (같은 환경변수 필요) 후 http://localhost:3000

## 🔗 연동 대상

- 메인 페이지: `Healthy 9 | 30일 데일리 운동 플래너 (2026.11.17~12.16)`
- DB: `📅 30일 데일리 운동 체크 DB`

기존 데이터는 변경하지 않고 읽고/체크만 합니다.
