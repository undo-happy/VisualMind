# VisualMind MVP

VisualMind은 문서나 이미지뿐 아니라 사용자가 직접 입력한 텍스트로부터도 자동으로 마인드맵을 생성하는 웹 애플리케이션입니다. React 기반 프런트엔드와 Node.js 백엔드로 구성되어 있으며, Upstage의 OCR/Parser와 Solar Pro LLM을 활용해 업로드된 파일이나 텍스트를 분석하고 2단계 깊이의 트리 구조를 생성합니다.

## 주요 구성 요소

- **client**: Vite + React 로 작성된 프런트엔드. 사용자가 파일을 업로드하면 서버에 전달하고, 생성된 마인드맵 JSON을 화면에 표시합니다.
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
```

서버는 기본 3001번 포트에서 실행되고, 클라이언트 개발 서버는 5173번 포트에서 동작하며 API 요청은 프록시를 통해 서버로 전달됩니다.

## 추가 API
- `POST /api/upload`: 파일을 업로드하여 마인드맵을 생성합니다. `file` 필드를 multipart 형식으로 전송합니다.

- `GET /api/health`: 서버 상태를 확인하는 헬스 체크 엔드포인트입니다.
- `GET /api/usage`: 오늘 사용량과 할당량을 반환합니다.
- `GET /api/maps`: 업로드하여 생성된 마인드맵 ID 목록을 반환합니다.
- `GET /api/maps/:id`: 특정 ID의 마인드맵 JSON을 조회합니다.
- `DELETE /api/maps/:id`: 지정한 마인드맵을 삭제합니다.
- `GET /api/admin/maps`: 관리자 전용, 모든 사용자의 마인드맵 ID와 소유자를 조회합니다.
- `POST /api/text`: 텍스트를 직접 전달하여 마인드맵을 생성합니다. `{ text }`를 JSON으로 보냅니다.
- `POST /api/maps/:id/add`: 지정한 경로에 자식 노드를 추가합니다. `path` 배열과 `title`을 JSON으로 전달합니다.
- `POST /api/maps/:id/remove`: `path` 배열로 특정 노드를 삭제합니다.
- `POST /api/maps/:id/expand`: `path`에 해당하는 노드를 LLM을 이용해 더 세부 구조로 확장합니다.
