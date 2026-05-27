# SHORTS 자동 제작 파이프라인 매뉴얼

> GitHub: https://github.com/jiyoungjung11/shorts  
> 최종 업데이트: 2026-05-27

---

## 목차
1. [시스템 요구사항](#1-시스템-요구사항)
2. [최초 설치 (PC 리셋 후)](#2-최초-설치)
3. [파이프라인 구조](#3-파이프라인-구조)
4. [쇼츠 제작 단계별 가이드](#4-쇼츠-제작-단계별-가이드)
5. [출력 형식 설정](#5-출력-형식-설정)
6. [이미지 전략](#6-이미지-전략)
7. [오버레이 텍스트 설정](#7-오버레이-텍스트-설정)
8. [BGM 설정](#8-bgm-설정)
9. [인스타그램 최적화](#9-인스타그램-최적화)
10. [자주 발생하는 오류](#10-자주-발생하는-오류)
11. [API 키 및 비용](#11-api-키-및-비용)

---

## 1. 시스템 요구사항

| 항목 | 버전/사양 |
|---|---|
| OS | Windows 10/11 |
| Node.js | v18 이상 (LTS 권장) |
| ffmpeg | 최신 버전 |
| Git | 최신 버전 |
| 브라우저 | Microsoft Edge (Windows 기본 설치) |
| 인터넷 | 필수 (AI API 호출) |

---

## 2. 최초 설치

### 방법 A: 자동 설치 스크립트 (권장)

**PC 리셋 후 복구 순서:**

1. Google Drive(jiyoungjung1@gmail.com)에서 `SHORTS_SETUP.ps1` 다운로드
   - Google Drive → 내 드라이브 → `SHORTS_SETUP.ps1` 검색
   - 참고 문서: `SHORTS 파이프라인 — API 키 보관함` (API 키 전체 포함)

2. 다운로드한 파일을 Desktop에 저장

3. PowerShell 관리자 권한으로 실행:

```powershell
# 1. PowerShell을 관리자 권한으로 실행
# 2. 실행 정책 허용
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

# 3. 스크립트 실행 (API 키가 포함된 개인 보관용)
.\SHORTS_SETUP.ps1
```

스크립트가 자동으로:
- Node.js, ffmpeg, Git 설치 (winget)
- GitHub 저장소 클론 (https://github.com/jiyoungjung11/shorts)
- npm 패키지 설치
- `.env` 파일 생성 (API 키 포함)
- Google SA 키 파일 생성

### 방법 B: 수동 설치

#### 2-1. Node.js 설치
```powershell
winget install OpenJS.NodeJS.LTS
# 설치 후 터미널 재시작 또는:
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
node --version  # 확인
```

#### 2-2. ffmpeg 설치
```powershell
winget install Gyan.FFmpeg
# 설치 경로: C:\Users\[사용자]\AppData\Local\Microsoft\WinGet\Links\ffmpeg.exe
ffmpeg -version  # 확인
```

#### 2-3. Git 설치
```powershell
winget install Git.Git
git --version  # 확인
```

#### 2-4. 프로젝트 클론
```powershell
cd $env:USERPROFILE\Desktop
git clone https://github.com/jiyoungjung11/shorts.git
cd shorts
npm install  # 시간 소요 (Puppeteer 다운로드 포함)
```

#### 2-5. .env 파일 생성
`shorts\.env` 파일을 생성하고 아래 내용 입력:
```
ANTHROPIC_API_KEY=YOUR_ANTHROPIC_API_KEY

GOOGLE_SA_KEY_PATH=C:/Users/[사용자명]/Desktop/shorts/tiktok-496308-9f14ccea8aa5.json
GOOGLE_PROJECT_ID=tiktok-496308

KLING_ACCESS_KEY=YOUR_KLING_ACCESS_KEY
KLING_SECRET_KEY=YOUR_KLING_SECRET_KEY
KLING_CUTS=3,4

FFMPEG_PATH=C:\Users\[사용자명]\AppData\Local\Microsoft\WinGet\Links\ffmpeg.exe
```

> **주의**: .env는 메모장이 아닌 PowerShell로 저장 (BOM 문제 방지)
> ```powershell
> [System.IO.File]::WriteAllText("$pwd\.env", $content, [System.Text.UTF8Encoding]::new($false))
> ```

> **API 키**: 개인 보관용 `SHORTS_SETUP.ps1`을 실행하면 자동 입력됩니다.  
> 직접 입력 시 Anthropic Console, Kling 대시보드에서 확인하세요.

#### 2-6. Google SA 키 파일 생성
`shorts\tiktok-496308-9f14ccea8aa5.json` 파일 생성 (SHORTS_SETUP.ps1 자동 생성)

---

## 3. 파이프라인 구조

```
[1] 시나리오     →  output/주제/scenario.json
[2] 이미지 생성  →  output/주제/images/cut_01~10.png     (Vertex AI Imagen 3)
[3] 오버레이     →  output/주제/images_overlay/           (Puppeteer + Edge)
                 →  output/주제/images_text_overlay/
[4] 영상 생성    →  output/주제/videos/cut_01~10.mp4      (Kling API or ffmpeg)
[5] 최종 조립    →  output/주제/final.mp4                 (ffmpeg + BGM)
```

### 실행 명령어

```powershell
# 환경 설정 (매 세션마다 실행)
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
Set-Location "C:\Users\[사용자명]\Desktop\shorts"

# 전체 실행 (처음부터 끝까지)
node run.mjs "주제명"

# 특정 단계부터 실행
node run.mjs "주제명" --from images            # 이미지 생성부터
node run.mjs "주제명" --from overlay           # 오버레이부터
node run.mjs "주제명" --from overlay --to overlay  # 오버레이만
node run.mjs "주제명" --from videos            # 영상 생성부터
node run.mjs "주제명" --from assemble          # 최종 조립만 (BGM 교체 시)
```

---

## 4. 쇼츠 제작 단계별 가이드

### Step 1: 시나리오 작성

`output/주제/scenario.json` 파일 생성 (Claude에게 요청하거나 직접 작성)

```json
{
  "title": "수원화성 — 역사와 일상이 공존하는 성벽 길",
  "topic": "수원화성",
  "seo": {
    "youtube_title": "The 220-Year-Old Giant Wall Surrounding a Korean City",
    "hashtags": ["#SuwonHwaseong", "#KoreaTravel", "#UNESCO"]
  },
  "cuts": [
    {
      "cut_number": 1,
      "duration_seconds": 5,
      "narration": "...",
      "title_overlay": {
        "korean": "수원화성",
        "main": "KING'S DEVOTION",
        "sub": "Built in 1796 — UNESCO World Heritage"
      },
      "image_prompt": "cinematic documentary photography, 4K...",
      "motion": "slow wide aerial pull-back"
    }
  ]
}
```

**컷 구성 공식 (10컷 × 5초 = 50초)**

| 컷 | 역할 | 오버레이 스타일 |
|---|---|---|
| 01 | 오프닝 훅 + 장소 소개 | 커버 (한글 + 영문 + 설명, 화면 중앙) |
| 02~09 | 핵심 콘텐츠 | 상단바 (제목 + 설명, 상단 그라디언트) |
| 10 | CTA + 저장 유도 | 커버 (한글 + 영문 + 설명, 화면 중앙) |

### Step 2: 이미지 검토 및 교체

AI 생성 이미지가 실제 장소와 맞지 않으면 Wikimedia Commons 실사 사진으로 교체:

```
https://commons.wikimedia.org/wiki/Main_Page
검색: 장소명 영문 (예: Suwon Hwaseong)
라이선스: CC BY-SA / Public Domain 확인
```

이미지 변환 (원본 → 1080×1920):
```powershell
$ffmpeg = "C:\Users\[사용자명]\AppData\Local\Microsoft\WinGet\Links\ffmpeg.exe"

# 방법 1: center-crop (원본 비율 유지하며 크롭)
& $ffmpeg -y -i "원본.jpg" -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920" "cut_XX.png"

# 방법 2: blur-pad (원본 이미지를 중앙에, 블러 배경으로 채우기)
$filter = "split [a][b];[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=25:8,colorchannelmixer=.3:.59:.11:.3:.59:.11:.3:.59:.11[bg];[b]scale=1080:1080[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2"
& $ffmpeg -y -i "원본.png" -vf $filter "cut_XX.png"
```

### Step 3: 오버레이 검토

```powershell
node run.mjs "주제명" --from overlay --to overlay
# output/주제/images_overlay/ 폴더에서 이미지 확인
```

마음에 안 들면 scenario.json의 `title_overlay` 수정 후 재실행:
```powershell
# 특정 컷만 재생성 (해당 컷 오버레이 파일 삭제 후 재실행)
Remove-Item "output\주제\images_overlay\cut_XX.png"
Remove-Item "output\주제\images_text_overlay\cut_XX.png"
node run.mjs "주제명" --from overlay --to overlay
```

### Step 4: Kling 동적 영상

`.env`의 `KLING_CUTS`에 동적 영상으로 만들 컷 번호 지정:
```
KLING_CUTS=3,4   # cut_03, cut_04만 Kling으로 생성, 나머지는 ffmpeg 정지 영상
```

**Kling 선택 기준**: 가장 시각적으로 임팩트 있는 2~3개 컷만 (비용·시간 절감)
- 성벽 날아다니는 장면, 연못 반영 등 모션이 효과적인 컷

### Step 5: BGM 교체 및 조립

```powershell
# BGM 파일을 bgm.mp3로 교체
Copy-Item "새_BGM파일.mp3" ".\bgm.mp3" -Force

# 조립만 재실행
node run.mjs "주제명" --from assemble
```

---

## 5. 출력 형식 설정

### 인스타그램 릴스 / 유튜브 쇼츠 (현재 기본값: 9:16)

| 파일 | 변경 항목 | 값 |
|---|---|---|
| `steps/02_images.mjs` | `aspectRatio` | `"9:16"` |
| `steps/03_overlay.mjs` | body height, viewport | `1920px` / `height: 1920` |
| `steps/04_videos.mjs` | scale, aspect_ratio | `1080:1920` / `"9:16"` |
| `steps/05_assemble.mjs` | scale filter | `1080:1920` |

### 정방형 (1:1, 1080×1080)으로 변경 시

위 4개 파일에서 `1920` → `1080`, `"9:16"` → `"1:1"` 으로 변경.

---

## 6. 이미지 전략

### AI 생성 이미지 (Vertex AI Imagen 3)
- 장점: 시나리오 의도에 딱 맞는 드라마틱한 이미지
- 단점: 실제 장소와 다를 수 있음, 비용 발생
- 용도: 야경, 열기구, 도구 재현 등 실사 구하기 어려운 장면

### Wikimedia Commons 실사 사진
- 장점: 실제 장소 확실, 무료 (CC/Public Domain)
- 단점: 구도·화질이 아쉬울 수 있음
- 용도: 유명 건축물, 역사적 유물, 일상 장면

### 혼합 전략 (추천)
- 실제 장소 증명이 필요한 컷: 실사 사진
- 드라마틱한 연출이 필요한 컷: AI 생성
- AI 생성 후 검토 → 장소가 틀리면 실사로 교체

---

## 7. 오버레이 텍스트 설정

### 텍스트 구조 (scenario.json)
```json
"title_overlay": {
  "korean": "수원화성",        // 커버 컷만 — 큰 한글 제목
  "main": "KING'S DEVOTION",  // 주 제목 (항상 표시)
  "sub": "Built in 1796..."   // 부제목 (50자 이내 권장)
}
```

### CSS 핵심 값 (steps/03_overlay.mjs)

```css
/* ── 커버 스타일 (cut_01, cut_10) ── */
.korean { font-size: 128px; font-weight: 900; }
.main   { font-size: 76px;  font-weight: 900; }
.sub    { font-size: 46px;  font-weight: 600; }

/* ── 상단바 스타일 (cut_02~09) ── */
.main   { font-size: 100px; font-weight: 900; }
.sub    { font-size: 42px;  font-weight: 600; }

/* ── 인스타그램 상단 여백 (중요!) ── */
.overlay { padding: 160px 72px 160px; }
/* 80px 이하면 인스타그램 UI(상태바, 계정명)에 텍스트 가림 */

/* ── 텍스트 아웃라인 효과 ── */
text-shadow:
  -2px -2px 0 rgba(0,0,0,0.85), 2px -2px 0 rgba(0,0,0,0.85),
  -2px  2px 0 rgba(0,0,0,0.85), 2px  2px 0 rgba(0,0,0,0.85),
  0 4px 24px rgba(0,0,0,0.95);

/* ── 상단 그라디언트 ── */
background: linear-gradient(to bottom,
  rgba(0,0,0,0.93) 0%,
  rgba(0,0,0,0.78) 60%,
  rgba(0,0,0,0.20) 88%,
  transparent 100%);
```

### 텍스트 PNG 1080×1080 버그 (필수 확인!)

`steps/03_overlay.mjs`에서 아래 두 가지 반드시 확인:

```javascript
// 1. viewport height가 1920인지 확인
await page2.setViewport({ width: 1080, height: 1920 });  // ← 1080 아닌 1920!

// 2. screenshot에 clip 파라미터 있는지 확인
await page2.screenshot({
  path: textOutPath, type: "png", omitBackground: true,
  clip: { x: 0, y: 0, width: 1080, height: 1920 }  // ← 필수!
});
```

누락 시: 텍스트 PNG가 1080×1080으로 잘려서 커버 컷 텍스트가 화면 상단에 쏠림.

---

## 8. BGM 설정

### BGM 파일 교체
```powershell
Copy-Item "C:\Users\[사용자명]\Downloads\새_BGM.mp3" ".\bgm.mp3" -Force
node run.mjs "주제명" --from assemble
```

### BGM 시작 지점 변경 (steps/05_assemble.mjs)
```javascript
// 12초부터 시작
const bgmArgs = hasBgm ? `-ss 12 -i "${bgmPath}"` : "";
//                         ^^^^^ 원하는 시작 초로 변경
```

### 볼륨 / 페이드 조정 (steps/05_assemble.mjs)
```javascript
`atrim=duration=${totalDur},afade=t=in:st=0:d=1,afade=t=out:st=${fadeOut}:d=3,volume=0.30`
//                                                                                    ^^^^
//                                                                             볼륨 0.0~1.0
```

### 추천 무료 BGM 소스

| 사이트 | 특징 |
|---|---|
| https://pixabay.com/music/ | 완전 무료, 상업적 사용 가능, 회원가입 불필요 |
| https://mixkit.co/free-stock-music/ | 완전 무료, SNS 사용 허용 |
| https://uppbeat.io | 무료 플랜, SNS 크레딧 불필요 |
| YouTube Audio Library | 유튜브 스튜디오 내 무료 음원 |

---

## 9. 인스타그램 최적화

### 업로드 전 체크리스트
- [ ] 해상도: 1080×1920 (9:16)
- [ ] 길이: 50초 이내 (릴스 최적)
- [ ] 상단 여백: 텍스트가 UI에 가리지 않는지 확인
- [ ] BGM: 저작권 없는 음원 사용
- [ ] 커버 이미지: cut_01 또는 별도 커버 썸네일

### 본문 구성 공식
```
[훅 — "more" 클릭 전 보이는 첫 1~2줄]

[핵심 포인트 5~7개 — 역사적 사실, 숫자, 스토리]

[CTA — Save this / Share / Follow for more]

[해시태그 10개 내외 — 영문 + 한글 혼합]
```

### 한국 여행 기본 해시태그
```
#KoreaTravel #VisitKorea #SeoulDayTrip #KoreaHiddenGem
#HistoryTravel #UNESCO #수원화성 #수원여행
```

---

## 10. 자주 발생하는 오류

| 증상 | 원인 | 해결 |
|---|---|---|
| `node: command not found` | Node.js PATH 미설정 | `$env:PATH = "C:\Program Files\nodejs;" + $env:PATH` |
| `KLING_ACCESS_KEY 없음` | .env 미로드 | .env 파일 존재 여부 확인, BOM 없이 저장 |
| Imagen API `429` | 분당 5회 쿼터 초과 | `REQUEST_INTERVAL_MS=20000` 유지 (20초 간격) |
| 텍스트 PNG `1080×1080` | viewport 1080 또는 clip 누락 | viewport `height: 1920`, screenshot에 `clip` 추가 |
| 커버 컷 텍스트 상단 쏠림 | 텍스트 PNG 크기 오류 | 위 항목 해결 후 text_overlay 파일 삭제 후 재생성 |
| 인스타 상단 텍스트 가림 | padding-top 부족 | `padding-top: 160px` 이상 |
| `Unexpected token '﻿'` | .env BOM 문제 | PowerShell `WriteAllBytes` 로 .env 재생성 |
| Puppeteer 실행 실패 | Edge 경로 오류 | `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` 확인 |
| ffmpeg scale 오류 | 해상도 홀수 | scale 필터에 `force_original_aspect_ratio` 추가 |
| Kling `task failed` | 이미지 품질 문제 | 이미지 재생성 후 재시도 |

---

## 11. API 키 및 비용

| API | 용도 | 비용 |
|---|---|---|
| Anthropic (Claude) | 시나리오 자동 생성 | 사용량 기반 |
| Google Vertex AI (Imagen 3) | 이미지 생성 | 이미지당 약 $0.04 (10컷 = $0.4) |
| Kling API | 동적 영상 생성 | 영상당 약 $0.14 (2컷 = $0.28) |

**총 비용 (10컷 쇼츠 1편 기준): 약 $0.70 (약 1,000원)**

### API 키 목록

| 키 이름 | 발급처 | 비고 |
|---|---|---|
| `ANTHROPIC_API_KEY` | https://console.anthropic.com | Claude API |
| `KLING_ACCESS_KEY` | https://klingai.com/dashboard | Kling AI |
| `KLING_SECRET_KEY` | https://klingai.com/dashboard | Kling AI |
| `GOOGLE_PROJECT_ID` | Google Cloud Console | `tiktok-496308` |
| `GOOGLE_SA_KEY` | Google Cloud Console → IAM → Service Accounts | `tiktok-496308-9f14ccea8aa5.json` (SHORTS_SETUP.ps1이 자동 생성) |

> **실제 키 값**: 개인 보관용 `SHORTS_SETUP.ps1` 파일에 저장되어 있습니다.  
> PC 리셋 전 Google Drive 또는 이메일로 백업하세요.

---

## 빠른 시작 요약

```powershell
# PC 리셋 후 최초 1회
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\SHORTS_SETUP.ps1

# 이후 매번
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
Set-Location "$env:USERPROFILE\Desktop\shorts"
node run.mjs "주제명"
```

끝. 궁금한 점은 Claude에게 `/make-shorts` 명령으로 노하우를 불러오거나 질문하세요.
