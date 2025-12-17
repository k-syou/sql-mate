# SQL Mate - AI NL to SQL 웹앱

자연어 질문을 SQL 쿼리로 변환하는 2트랙 AI 웹 애플리케이션입니다.

## 기능

### 트랙 A: CSV 트랙
- CSV 파일 업로드 및 미리보기 (20행)
- PII 자동 탐지 (컬럼명 키워드 + 값 패턴)
- PII 처리 옵션 (Drop/Mask/Hash)
- SQLite에 데이터셋 저장
- 자연어 질문 → SQL 생성 및 실행
- 쿼리 결과 표시 (최대 200행)
- 추천 질문 자동 생성

### 트랙 B: 스키마 트랙
- 스키마 JSON 업로드
- 테이블 구조 트리 뷰
- 자연어 질문 → SQL 생성
- SQL 복사 및 설명 제공

## 기술 스택

- **프론트엔드**: Next.js 14 (App Router) + TypeScript
- **스타일링**: Tailwind CSS + shadcn/ui
- **백엔드**: Next.js Route Handlers
- **데이터베이스**: SQLite (better-sqlite3)
- **CSV 처리**: csv-parse
- **LLM**: OpenAI, Claude, Custom (provider-agnostic)

## 시작하기

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 설정

`.env.local` 파일을 생성하고 다음 내용을 추가하세요:

```env
# LLM API 설정 (선택사항 - UI에서도 설정 가능)
LLM_PROVIDER=openai
LLM_MODEL=gpt-4o-mini
LLM_API_KEY=your-api-key-here
LLM_BASE_URL=  # 커스텀 provider 사용 시
```

### 3. 개발 서버 실행

```bash
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 열어 확인하세요.

### 4. 프로덕션 빌드

```bash
npm run build
npm start
```

## 배포 가이드

### Render.com

1. GitHub 저장소에 코드를 푸시합니다.
2. Render.com에서 새 Web Service를 생성합니다.
3. 저장소를 연결하고 다음 설정을 사용합니다:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Environment**: Node 20
4. 환경 변수를 추가합니다 (선택사항).
5. Deploy를 클릭합니다.

**주의**: Render는 파일 시스템을 지원하므로 SQLite가 정상 작동합니다.

### Fly.io

1. Fly CLI 설치:
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

2. Fly 앱 초기화:
   ```bash
   fly launch
   ```

3. `fly.toml` 설정:
   ```toml
   [build]
     builder = "heroku/buildpacks:20"

   [env]
     NODE_ENV = "production"

   [[services]]
     internal_port = 3000
     protocol = "tcp"
   ```

4. 배포:
   ```bash
   fly deploy
   ```

**주의**: Fly.io는 영구 볼륨을 지원하므로 SQLite 데이터를 유지할 수 있습니다.

### Vercel

**⚠️ 중요**: Vercel은 서버리스 환경이므로 SQLite 사용에 제약이 있습니다.

- ✅ **스키마 트랙**: 정상 작동 (데이터 저장 불필요)
- ⚠️ **CSV 트랙**: 제한적 작동 (데이터가 임시로만 저장됨, 재배포 시 데이터 손실)

자세한 배포 방법은 [VERCEL_DEPLOY.md](./VERCEL_DEPLOY.md)를 참고하세요.

**빠른 배포**:

1. Vercel CLI 설치:
   ```bash
   npm i -g vercel
   ```

2. 배포:
   ```bash
   vercel
   vercel --prod
   ```

또는 GitHub 저장소를 Vercel에 연결하여 자동 배포할 수 있습니다.

## 프로젝트 구조

```
sql-mate/
├── app/
│   ├── api/
│   │   ├── upload/
│   │   │   ├── csv/
│   │   │   │   ├── route.ts          # CSV 업로드
│   │   │   │   └── process/
│   │   │   │       └── route.ts      # CSV 처리 및 저장
│   │   │   └── schema/
│   │   │       └── route.ts          # 스키마 업로드
│   │   └── query/
│   │       ├── generate/
│   │       │   └── route.ts          # SQL 생성
│   │       ├── execute/
│   │       │   └── route.ts          # SQL 실행
│   │       └── recommendations/
│   │           └── route.ts           # 추천 질문
│   ├── csv/
│   │   └── page.tsx                   # CSV 트랙 페이지
│   ├── schema/
│   │   └── page.tsx                   # 스키마 트랙 페이지
│   ├── layout.tsx
│   ├── page.tsx                       # 메인 페이지
│   └── globals.css
├── components/
│   ├── ui/                            # shadcn/ui 컴포넌트
│   ├── chat-message.tsx
│   ├── chat-input.tsx
│   └── model-selector.tsx
├── lib/
│   ├── db.ts                          # SQLite 연결
│   ├── piiDetect.ts                   # PII 탐지
│   ├── sqlSafety.ts                   # SQL 안전성 검증
│   ├── schemaPrompt.ts                # 스키마 프롬프트 생성
│   ├── llmClient.ts                   # LLM 클라이언트
│   └── utils.ts
├── data/                              # SQLite 데이터베이스 (자동 생성)
└── package.json
```

## 사용 방법

### CSV 트랙

1. 메인 페이지에서 "CSV 트랙" 선택
2. CSV 파일 업로드
3. PII 탐지 결과 확인 및 처리 방식 선택 (Drop/Mask/Hash)
4. "데이터셋 준비하기" 클릭
5. LLM API Key 입력 (필요시)
6. 자연어 질문 입력 또는 추천 질문 클릭
7. 생성된 SQL 및 결과 확인

### 스키마 트랙

1. 메인 페이지에서 "스키마 트랙" 선택
2. 스키마 JSON 파일 업로드 (형식은 UI에 표시됨)
3. 스키마 구조 확인
4. LLM API Key 입력 (필요시)
5. 자연어 질문 입력
6. 생성된 SQL 복사 및 사용

## 스키마 JSON 형식

```json
{
  "tables": [
    {
      "name": "users",
      "columns": [
        {
          "name": "id",
          "type": "INTEGER",
          "nullable": false
        },
        {
          "name": "email",
          "type": "TEXT"
        }
      ],
      "primaryKey": ["id"],
      "foreignKeys": [
        {
          "column": "user_id",
          "references": {
            "table": "orders",
            "column": "id"
          }
        }
      ]
    }
  ]
}
```

## SQL 안전 규칙

- SELECT 문만 허용
- 금지 키워드: INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE
- 다중문 금지 (세미콜론 있으면 첫 문장만 사용)
- LIMIT 없으면 자동으로 LIMIT 200 추가
- 실행 전 서버에서 재검증

## PII 탐지 규칙

- **컬럼명 키워드**: name, email, phone, address, ssn, 주민, 계좌, card, ip 등
- **값 패턴**: email, phone, IP, 식별번호 (길이 + 하이픈 패턴)
- 의심이면 기본 Drop, 사용자가 Mask/Hash 선택 가능

## 라이선스

MIT

