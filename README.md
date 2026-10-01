# Y17 Log Workspace

SK hynix Y17 Ph-1의 생산 시스템 로그 탐색 웹 애플리케이션. TypeScript / React / FastAPI 기반의 초기 화면 및 API 프레임입니다.

왼쪽 내비게이션에서 **M14N Acell LogViewer**와 **ARC LMS**를 선택합니다. 각 프로그램은 별도의 검색조건, 결과 컬럼, 상세 로그 탭과 조회창을 가지며, 메뉴를 전환해도 입력값과 조회 상태가 유지됩니다.

**실제 로그, 더미 로그, 임의의 시스템 목록을 포함하지 않습니다.** 데이터 소스는 아직 연결되지 않았으며, 조회 API는 미연결 상태를 `503 SOURCE_NOT_CONFIGURED`로 반환합니다. 다운로드 파일이나 작업 성공 상태를 임의로 생성하지 않습니다.

## 실행

Node.js 22.12 이상과 기존에 설치된 `python3`(Python 3.10 이상)를 사용합니다. 현재 개발 환경에는 필요한 패키지가 설치되어 있으므로 추가 설치 없이 실행합니다. 아래 명령은 저장소 루트에서 실행합니다.

```bash
cd /home/sy_jin/SK-Hynix-Y17-Ph-1-Dashboard
```

터미널 1 — FastAPI:

```bash
python3 app.py
```

루트의 `app.py`가 API 서버를 `127.0.0.1:8017`에서 실행하며, 백엔드 코드 변경 시 자동으로 다시 불러옵니다.

터미널 2 — React:

```bash
npm run dev
```

종료는 각 실행 터미널에서 `Ctrl+C`를 누릅니다.

- 화면: http://127.0.0.1:5177
- API 문서: http://127.0.0.1:8017/api/docs
- OpenAPI: http://127.0.0.1:8017/api/openapi.json

프런트엔드의 `/api` 요청은 Vite가 FastAPI로 전달합니다. 기존 로컬 서비스와 겹치지 않도록 5177 / 8017 포트를 사용합니다. 별도 ES나 인증정보 없이 프레임을 확인할 수 있습니다.

새 환경에서 의존성을 준비할 때만 다음 명령을 사용합니다. 별도 가상환경은 생성하지 않습니다.

```bash
npm ci
python3 -m pip install -r backend/requirements-dev.txt
```

## 현재 구현

- 왼쪽 메뉴로 구분한 Acell / ARC LMS 화면
- Acell: G/E/S 트랜잭션 검색 및 단일·S/E/G 상세 탭
- ARC LMS: 트랜잭션 키·SEQ·Full Text·연관검색 및 단일·트랜잭션 전체 로그 탭
- 입력 글씨 16px, 검색 라벨·결과 컬럼·상세 탭 14px, 주요 제목 30px의 가독성 개선
- 상대 기간 / 직접 입력 / Datetime 붙여넣기, 최근 7일 제한, KST 표시
- 전체 시스템 조회 시 Acell G 트랜잭션 ID / ARC 트랜잭션 키 필수 검증, 서버 측 동일 검증
- 검색조건 저장·불러오기·초기화 (브라우저 localStorage)
- 프로그램별 독립 조회창 최대 4개, 탭·수평·수직 배치, 새 브라우저 창
- 실제 조회 응답을 받을 테이블, 커서 페이지 이동, 선택 행·트랜잭션·값 강조 처리
- 현재 페이지 내 검색, 행 우클릭 복사, 시간 재사용, 연관검색 새 창
- 단일 로그 원문 / XML / SQL / JSON 정렬, Key = Value 상세 보기
- 트랜잭션별 상세 조회 요청 및 다음 로그 불러오기 구조
- 기간별 다운로드 요청 화면, CSV / XLSX / NDJSON 선택, 작업 목록 프레임
- API 연결 실패 / 데이터 미연결 / 조회 결과 없음 상태 구분

조회 결과에 의존하는 기능은 실데이터 연결 전에는 빈 화면으로 표시됩니다. 행 선택·정렬·연관검색 등 실데이터 경로의 운영 검증은 후속 작업입니다.

## 구조

```text
app.py             API 서버 실행 진입점
frontend/src/
  components/      검색 / 결과 / 상세 / 워크스페이스 / 공통 대화상자
  lib/             API 클라이언트 / 검색조건·시간 처리 / 브라우저 저장
  types.ts         화면 및 API 타입
  App.tsx          프로그램 내비게이션, 다운로드·저장조건·연결 화면
backend/app/
  main.py          HTTP API / 오류 응답
  models.py        검색·로그·다운로드 계약과 입력 검증
  repository.py    로그 저장소 인터페이스 / 미연결 어댑터
backend/tests/     API 계약 검증
tests/browser/     실제 FastAPI를 사용하는 Playwright 흐름 검증
docs/              요구사항 추적, 구조 및 후속 연동 검토
```

## 검증

```bash
npm run build
cd backend
python3 -m pytest -q
cd ..
npx playwright install chromium
npm run test:ui
npx prettier --check .
```

브라우저 검증은 개발 서버가 없으면 자동으로 실행합니다. 가짜 로그 행을 주입하지 않으며, 미연결 상태·입력 검증·프로그램별 검색조건·조건 복원·프로그램/창 간 상태 분리·다운로드 비활성화·화면 크기 변경을 검사합니다. `test-results/`는 Git에서 제외합니다.

## 후속 연동

ES 인덱스 / 필드 매핑 / 시스템별 접근 권한 / SSO 정책을 확인한 뒤 `LogRepository` 어댑터를 구현합니다. 대용량 다운로드는 별도 작업 실행기와 파일 저장소가 필요합니다. 현재 프레임에는 ES 어댑터, 내보내기 작업 실행기, 인증, 운영 배포 구성이 없습니다.

전체 요구사항 및 미확정 사항은 [요구사항 추적표](docs/requirements.md), 데이터 조회·다운로드 설계와 Vega 검토는 [구조 및 연동](docs/architecture.md)을 확인하세요.
