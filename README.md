# VisualMind MVP

VisualMind은 문서나 이미지뿐 아니라 사용자가 직접 입력한 텍스트로부터도 자동으로 마인드맵을 생성하는 웹 애플리케이션입니다. React 기반 프런트엔드와 Node.js 백엔드로 구성되어 있으며, Upstage의 OCR/Parser와 Solar Pro LLM을 활용해 업로드된 파일이나 텍스트를 분석하고 2단계 깊이의 트리 구조를 생성합니다.

## 주요 구성 요소

- **client**: Vite + React 로 작성된 프런트엔드. 사용자가 파일을 업로드하면 서버에 전달하고, 생성된 마인드맵 JSON을 화면에 표시합니다.
- 오프라인 사용을 위한 PWA 서비스 워커와 매니페스트를 제공합니다.
- 라이트/다크 모드를 전환할 수 있는 테마 토글을 제공합니다.
- 반응형 레이아웃과 부드러운 테마 전환 애니메이션을 적용했습니다.
- 언어 전환 토글과 ARIA 레이블을 통해 접근성을 개선했습니다.
- 방사형과 계층형 레이아웃을 전환할 수 있는 레이아웃 토글을 제공합니다.
- 마인드맵을 드래그 및 스크롤로 이동하고 확대/축소할 수 있으며, 우측 하단에 미니맵이 표시됩니다.
- 대규모 트리 렌더링을 위해 레이아웃 계산을 Web Worker에서 수행합니다.
- 노드 수가 많은 경우 화면에 보이는 부분만 SVG로 그려 성능을 높입니다.
- 저장된 맵 목록은 페이징 API를 통해 단계적으로 로드됩니다.
- Stripe 결제를 통한 유료 구독 기능을 제공합니다.
- 텍스트 입력 시 SSE 스트림을 통해 실시간으로 진행 상황을 확인할 수 있습니다.
- Web Vitals 지표를 수집하여 `/api/metrics`에서 Prometheus 형식으로 노출합니다.
- 노드별 FSRS(Free Spaced Repetition Scheduler) 복습 주기를 계산하여 학습 기능을 제공합니다.
- **server**: Express 기반 백엔드. 파일 업로드를 처리하고 Upstage API를 호출해 텍스트를 추출한 후 Solar Pro LLM으로 마인드맵 구조를 생성합니다.

## 동작 흐름

```
파일 업로드 -> Upstage OCR/Parser -> (구조화된 출력) -> Solar Pro LLM -> 마인드맵 JSON
```

1. 사용자가 프런트엔드에서 파일을 업로드합니다.
2. 서버는 파일을 임시 폴더에 저장한 뒤 파일 유형을 판별합니다.
3. 이미지라면 Document OCR API, PDF 등 문서라면 Document Parser API를 호출하여 텍스트를 추출합니다.
4. 추출한 텍스트를 Upstage 구조화된 출력 API로 가공해 더 정돈된 형태의 데이터를 얻습니다.
5. 이 데이터를 Solar Pro API로 보내 2단계 깊이의 마인드맵 트리를 생성합니다.
6. 결과 JSON을 프런트엔드로 반환하여 화면에 표시하거나 저장에 활용할 수 있습니다.

API 키는 `UPSTAGE_API_KEY` 환경 변수로 주입하며, 실 서비스에서는 GitHub Actions 등에서 비밀 값으로 관리합니다.
바이러스 검사를 위해 `CLAMAV_HOST`와 `CLAMAV_PORT` 환경 변수를 설정하면 업로드된 파일을 ClamAV 서버로 스캔합니다.
관리자 계정은 `ADMIN_UIDS` 환경 변수(콤마 구분 UID 목록)로 지정하여 역할 기반 접근 제어를 활성화할 수 있습니다.
`S3_BUCKET`과 `AWS_REGION`을 지정하면 업로드된 원본 파일이 Amazon S3에 저장됩니다.
로그 레벨은 `LOG_LEVEL` 환경 변수로 조정할 수 있습니다.
`STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`을 설정하면 구독 결제가 활성화됩니다.
`CLUSTER` 값을 지정하면 해당 수만큼 Node.js 워커 프로세스를 띄워 여러 CPU 코어를 활용할 수 있습니다.

## 실행 방법

```bash
# 서버
cd server && npm install
npm start

# 클라이언트 (개발용)
cd ../client && npm install
npm run dev

# 또는 클라이언트를 빌드하여 서버에서 함께 제공하기
cd ../client && npm run build
# 빌드 후에는 server 디렉터리에서 `npm start`만 실행하면 됩니다.

빌드 결과에는 PWA 서비스 워커와 웹 앱 매니페스트가 포함되어 오프라인 상태에서도
최근 방문한 페이지를 다시 불러올 수 있습니다.
```

서버는 기본 3001번 포트에서 실행되고, 클라이언트 개발 서버는 5173번 포트에서 동작하며 API 요청은 프록시를 통해 서버로 전달됩니다.

## 추가 API
- `POST /api/upload`: 파일을 업로드하여 마인드맵을 생성합니다. `file` 필드를 multipart 형식으로 전송합니다.

- `GET /api/health`: 서버 상태를 확인하는 헬스 체크 엔드포인트입니다. 로드 밸런서에서 주기적으로 호출해 프로세스 생존 여부를 점검할 수 있습니다.
- `GET /api/usage`: 오늘 사용량과 할당량을 반환합니다.
- `POST /api/create-checkout-session`: Stripe 구독 결제 세션을 생성합니다.
- `POST /api/stripe/webhook`: Stripe 웹훅 이벤트를 처리합니다.
- `GET /api/maps`: 업로드하여 생성된 마인드맵 ID 목록을 반환합니다. `limit`과 `offset` 쿼리로 페이지네이션할 수 있습니다.
- `GET /api/maps/:id`: 특정 ID의 마인드맵 JSON을 조회합니다.
- `DELETE /api/maps/:id`: 지정한 마인드맵을 삭제합니다.
- `GET /api/admin/maps`: 관리자 전용, 모든 사용자의 마인드맵 ID와 소유자를 조회합니다.
- `POST /api/text`: 텍스트를 직접 전달하여 마인드맵을 생성합니다. `{ text }`를 JSON으로 보냅니다.
- `POST /api/text-sse`: 텍스트 입력을 실시간으로 처리하여 SSE 스트림으로 진행 상황과 결과를 반환합니다.
- `POST /api/maps/:id/add`: 지정한 경로에 자식 노드를 추가합니다. `path` 배열과 `title`을 JSON으로 전달합니다.
- `POST /api/maps/:id/remove`: `path` 배열로 특정 노드를 삭제합니다.
- `POST /api/maps/:id/expand`: `path`에 해당하는 노드를 LLM을 이용해 더 세부 구조로 확장합니다.
- `GET /api/metrics`: Prometheus 형식의 서버 메트릭을 반환합니다.
- `POST /api/rum`: 브라우저 Web Vitals 지표를 수집합니다.
- `GET /api/review`: 오늘 복습이 필요한 노드 목록을 반환합니다.
- `POST /api/review`: 노드 복습 결과를 기록하여 다음 복습 날짜를 계산합니다.
