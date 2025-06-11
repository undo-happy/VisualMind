# VisualMind MVP

VisualMind은 문서나 이미지로부터 자동으로 마인드맵을 생성하는 웹 애플리케이션입니다. React 기반 프런트엔드와 Node.js 백엔드로 구성되어 있으며, Upstage의 OCR/Parser와 Solar Pro LLM을 활용해 업로드된 파일을 분석하고 2단계 깊이의 트리 구조를 생성합니다.

## 주요 구성 요소

- **client**: Vite + React 로 작성된 프런트엔드. 사용자가 파일을 업로드하면 서버에 전달하고, 생성된 마인드맵 JSON을 화면에 표시합니다.
- **server**: Express 기반 백엔드. 파일 업로드를 처리하고 Upstage API를 호출해 텍스트를 추출한 후 Solar Pro LLM으로 마인드맵 구조를 생성합니다.

## 동작 흐름

1. 사용자가 프런트엔드에서 파일을 업로드합니다.
2. 서버는 파일을 임시 폴더에 저장한 뒤 파일 유형을 판별합니다.
3. 이미지라면 Document OCR API, PDF 등 문서라면 Document Parser API를 호출하여 텍스트를 추출합니다.
4. 추출된 텍스트와 프롬프트를 Solar Pro API로 보내 2단계 깊이의 마인드맵 트리를 생성합니다.
5. 결과 JSON을 프런트엔드로 반환하여 화면에 표시하거나 저장에 활용할 수 있습니다.

API 키는 `UPSTAGE_API_KEY` 환경 변수로 주입하며, 실 서비스에서는 GitHub Actions 등에서 비밀 값으로 관리합니다.

## 실행 방법

```bash
# 서버
cd server && npm install
npm start

# 클라이언트
cd ../client && npm install
npm run dev
```

서버는 기본 3001번 포트에서 실행되고, 클라이언트 개발 서버는 5173번 포트에서 동작하며 API 요청은 프록시를 통해 서버로 전달됩니다.
