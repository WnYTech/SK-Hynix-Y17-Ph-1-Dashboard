# Y17 Log Workspace

SK hynix Y17 Ph-1의 생산 시스템 로그 탐색 웹 애플리케이션. TypeScript / React / FastAPI 기반의 로그 검색 화면과 로컬 더미 데이터 조회 API입니다.

왼쪽 내비게이션에서 **M14N Acell LogViewer**와 **ARC LMS**를 선택합니다. 각 프로그램은 별도의 검색조건, 결과 컬럼, 상세 로그 탭과 조회창을 가지며, 메뉴를 전환해도 입력값과 조회 상태가 유지됩니다.

**개발용 더미 로그 3,000,000건**을 로컬 SQLite에 생성해 두 프로그램에서 공통으로 조회합니다. 운영 로그는 포함하지 않습니다. 화면의 **더미 로그 조회** 버튼은 데이터의 마지막 1시간 / MES 조건으로 즉시 검색합니다. 기간·시스템·트랜잭션·메시지 조건을 바꿔 탐색할 수 있습니다. 전체 로그 내보내기 작업은 아직 미구현이며 다운로드 요청 버튼은 비활성화합니다.

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
- 실제 조회 응답 테이블, 커서 페이지 이동, 동일 트랜잭션명 행 강조와 선택 셀 강조
- 현재 페이지 내 검색, 행 우클릭 복사, 시간 재사용, 연관검색 새 창
- 단일 로그 원문 / XML / SQL / JSON 정렬, Key = Value 상세 보기
- 트랜잭션별 상세 조회 요청 및 다음 로그 불러오기 구조
- 기간별 다운로드 요청 화면, CSV / XLSX / NDJSON 선택, 작업 목록 프레임
- API 연결 실패 / 데이터 미연결 / 조회 결과 없음 상태 구분

더미 데이터로 서버 검색·커서 페이지 이동·동일 트랜잭션명/선택 셀 강조·S/E/G 상세 및 ARC 교차 시스템 연관검색을 확인할 수 있습니다. Acell과 ARC 모두 트랜잭션명이 같으면 ID·키·시스템과 관계없이 분홍색으로 강조하며, 클릭한 셀 한 개만 노란색으로 표시합니다. 실제 Elasticsearch 연결과 운영 성능 검증은 후속 작업입니다.

## 도메인 / 리버스 프록시

nginx 설정안과 적용 명령은 [리버스 프록시 배포](docs/reverse-proxy.md)를 참고하세요. `python3 app.py --production --host 192.168.200.254 --proxy-ips 192.168.100.116`은 React 빌드와 API를 8017 포트에서 함께 제공합니다. 먼저 `npm run build`를 실행하고 기존 8017 API는 사용자가 직접 종료한 뒤 실행합니다. `--production`에서는 자동 리로드가 꺼지며, 화면 수정 후 다시 빌드하고 서버를 재시작합니다.

## 더미 데이터

현재 로컬 파일은 `backend/data/dummy-logs.sqlite3`이며, 총 **3,000,000행 / 약 1.56GiB**입니다. 생성 당시 최근 6일에 걸친 고정 시각을 사용합니다. 두 화면이 같은 300만 건을 공유하며, 프로그램마다 별도로 300만 건을 복제하지 않습니다.

- Fab `Y17`, System `MES / EAP / FDC / APC` 각각 750,000행.
- 트랜잭션 250,000개 × 12행. 하나의 트랜잭션이 네 시스템을 통과하며 E/S 하위 ID를 가집니다.
- 가상의 LOT / EQP / 서버, 처리 시간, A/I/Q/W/E/Z 로그 종류, JSON/XML/SQL/Key=Value 메시지.
- 모든 식별자와 메시지에 `DEMO` 또는 `DUMMY` 표시. 실제 설비·로그 스키마와는 무관합니다.
- 페이지당 최대 1,000행만 전송합니다. SQLite 인덱스와 서명된 커서를 사용하며 전체 데이터를 브라우저나 API 메모리에 올리지 않습니다.

새 체크아웃에서는 저장소 루트에서 생성하세요. 별도 가상환경이나 DB 서버가 필요하지 않습니다.

```bash
npm run data:generate
# 날짜를 갱신하거나 기존 더미 DB를 교체할 때
npm run data:generate -- --replace
# 작은 별도 파일로 생성할 때
npm run data:generate -- --rows 12000 --output /tmp/y17-small.sqlite3
```

생성 도구는 10,000행 단위로 기록하고 인덱스·건수·무결성 검증 후 원자적으로 교체합니다. 기존 파일은 `--replace` 없이 덮어쓰지 않습니다. **고정된 날짜는 자동으로 이동하지 않으므로**, 시간이 지나 7일 조회 제한에 걸리면 다시 생성하세요. 교체 전 페이지 커서는 만료되므로 다시 검색합니다.

기본 경로의 파일이 있으면 API에서 자동으로 연결하고, 없으면 기존 미연결 상태를 반환합니다. API 실행 시 `Y17_LOG_SOURCE=unconfigured`로 더미 연결을 끄거나 `Y17_DUMMY_DB=/absolute/path.sqlite3`로 다른 생성 파일을 지정할 수 있습니다. 서버 시작·종료는 사용자가 직접 관리합니다.

생성 DB와 테스트 결과물은 Git에서 제외합니다. Git에는 생성기와 검색 코드만 보관합니다. 자세한 검색 규칙과 제약은 [더미 데이터 구현](docs/dummy-data.md)을 참고하세요.

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
  repository.py    로그 저장소 선택 / 미연결 어댑터
  dummy_data.py    배치 데이터 생성기
  dummy_repository.py  SQLite 검색·연관검색·커서 페이지 이동
backend/data/      생성된 SQLite 파일 (Git 제외)
backend/tests/     API 계약 검증
tests/browser/     미연결 UI 및 실제 더미 API 흐름 검증
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

브라우저 검증은 **사용자가 실행해 둔 서버**를 사용합니다. CI에서 자동 시작이 필요할 때만 `PLAYWRIGHT_START_SERVERS=1 npm run test:ui`를 사용합니다. 미연결 UI 검증은 고정된 미연결 API 응답으로 격리합니다. `dummy.spec.ts`는 실제 FastAPI / SQLite 300만 건으로 검색·페이지 이동·교차 시스템 상세·ARC 연관검색·작은 화면을 확인합니다. 더미 DB가 없으면 해당 브라우저 검증만 건너뜁니다. 백엔드 테스트는 임시 소규모 DB를 생성해 필터·커서·시간 경계·교체 시 만료 등을 검증합니다. `test-results/`는 Git에서 제외합니다.

`highlight.spec.ts`는 이름과 ID가 서로 다르게 조합된 응답으로 두 프로그램의 트랜잭션명 그룹, 빈 이름 제외, 선택 셀·hover·페이지 유지 및 선택 초기화를 검증합니다. 기본 접속 주소는 `http://127.0.0.1:5177`이며, 이미 실행 중인 다른 주소에는 `Y17_TEST_BASE_URL`을 지정합니다. 서비스 중인 파일을 바꾸기 전에 별도 빌드를 브라우저 안에서만 적용할 수도 있습니다. API 요청은 기존 서버를 사용합니다.

```bash
npm run build --workspace frontend -- --outDir /tmp/y17-test-build
Y17_TEST_BASE_URL=https://y17-ph-1.wnytech.co.kr \
Y17_TEST_BUILD_DIR=/tmp/y17-test-build npm run test:ui
```

## 후속 연동

ES 인덱스 / 필드 매핑 / 시스템별 접근 권한 / SSO 정책을 확인한 뒤 `LogRepository` 어댑터를 구현합니다. 대용량 다운로드는 별도 작업 실행기와 파일 저장소가 필요합니다. 현재는 React 빌드와 API를 한 포트에서 실행하고 nginx로 도메인을 연결합니다. ES 어댑터, 내보내기 작업 실행기, 인증, GitHub main 병합에 따른 자동 배포는 아직 구현하지 않았습니다.

전체 요구사항 및 미확정 사항은 [요구사항 추적표](docs/requirements.md), 데이터 조회·다운로드 설계와 Vega 검토는 [구조 및 연동](docs/architecture.md)을 확인하세요.
