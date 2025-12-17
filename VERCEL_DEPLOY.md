# Vercel 배포 가이드

## ⚠️ 중요: SQLite 제약사항

Vercel은 **서버리스 환경**이므로 파일 시스템이 **읽기 전용**입니다. SQLite는 파일 기반 데이터베이스이므로 다음 제약이 있습니다:

- ✅ **스키마 트랙**: 정상 작동 (데이터 저장 불필요)
- ❌ **CSV 트랙**: 제한적 작동 (데이터가 임시로만 저장됨, 재배포 시 데이터 손실)

## 배포 방법

### 방법 1: Vercel CLI 사용 (권장)

#### 1단계: Vercel CLI 설치

```bash
npm i -g vercel
```

#### 2단계: Vercel 로그인

```bash
vercel login
```

#### 3단계: 프로젝트 배포

프로젝트 루트 디렉토리에서:

```bash
vercel
```

처음 배포 시:
- 프로젝트 이름 설정
- 배포할 디렉토리 확인 (현재 디렉토리)
- 설정 오버라이드 여부 (기본값 사용 권장)

#### 4단계: 프로덕션 배포

```bash
vercel --prod
```

### 방법 2: GitHub 연동 (권장)

#### 1단계: GitHub에 코드 푸시

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/your-username/sql-mate.git
git push -u origin main
```

#### 2단계: Vercel 대시보드에서 프로젝트 생성

1. [Vercel 대시보드](https://vercel.com/dashboard) 접속
2. "Add New..." → "Project" 클릭
3. GitHub 저장소 선택
4. 프로젝트 설정:
   - **Framework Preset**: Next.js
   - **Root Directory**: `./` (기본값)
   - **Build Command**: `npm run build` (자동 감지)
   - **Output Directory**: `.next` (자동 감지)
   - **Install Command**: `npm install` (자동 감지)

#### 3단계: 환경 변수 설정 (선택사항)

Vercel 대시보드에서:
1. 프로젝트 → Settings → Environment Variables
2. 다음 변수 추가 (선택사항):
   ```
   LLM_PROVIDER=openai
   LLM_MODEL=gpt-4o-mini
   LLM_API_KEY=your-api-key-here
   LLM_BASE_URL=  # 커스텀 provider 사용 시
   ```

**참고**: 환경 변수는 UI에서도 설정 가능하므로 필수는 아닙니다.

#### 4단계: 배포

"Deploy" 버튼 클릭

### 방법 3: Vercel CLI로 환경 변수 설정

```bash
vercel env add LLM_PROVIDER
vercel env add LLM_MODEL
vercel env add LLM_API_KEY
vercel env add LLM_BASE_URL
```

## SQLite 문제 해결 방법

### 옵션 1: 임시 파일 시스템 사용 (기본 동작)

현재 코드는 이미 `/tmp` 디렉토리를 사용하도록 설정되어 있지 않지만, Vercel에서는 자동으로 임시 디렉토리를 사용합니다.

**제한사항**:
- 데이터가 함수 실행 간에 유지되지 않음
- 각 요청마다 새로운 데이터베이스 생성
- CSV 트랙의 데이터셋이 유지되지 않음

**해결책**: `lib/db.ts`를 수정하여 Vercel 환경에서 `/tmp` 디렉토리 사용:

```typescript
// lib/db.ts 수정 필요
const dbPath = process.env.VERCEL 
  ? path.join('/tmp', 'sqlmate.db')
  : path.join(process.cwd(), 'data', 'sqlmate.db');
```

### 옵션 2: Vercel KV 사용 (권장)

SQLite 대신 Vercel KV를 사용하도록 수정:

1. Vercel 대시보드에서 KV 스토리지 생성
2. `lib/db.ts`를 KV 기반으로 재작성
3. 데이터 구조를 JSON으로 저장

### 옵션 3: 외부 데이터베이스 사용

PostgreSQL, MySQL 등 외부 데이터베이스 사용:

1. Vercel Postgres 또는 다른 DB 서비스 사용
2. `lib/db.ts`를 해당 DB로 변경
3. 연결 문자열을 환경 변수로 설정

### 옵션 4: Render/Fly.io 사용 (가장 간단)

SQLite를 그대로 사용하려면:
- **Render.com**: 파일 시스템 지원, SQLite 정상 작동
- **Fly.io**: 영구 볼륨 지원, SQLite 정상 작동

## 배포 후 확인

### 1. 배포 URL 확인

배포 완료 후 Vercel 대시보드에서 배포 URL 확인:
- 예: `https://sql-mate.vercel.app`

### 2. 기능 테스트

1. **스키마 트랙**: 정상 작동 확인
2. **CSV 트랙**: 
   - 업로드 및 처리 확인
   - ⚠️ 데이터는 임시로만 저장됨 (재배포 시 손실)

### 3. 로그 확인

문제 발생 시:
```bash
vercel logs
```

또는 Vercel 대시보드 → 프로젝트 → Deployments → 해당 배포 → Logs

## 트러블슈팅

### 문제 1: 빌드 실패

**원인**: `better-sqlite3` 네이티브 모듈 빌드 실패

**해결책**: `vercel.json` 생성:

```json
{
  "buildCommand": "npm run build",
  "installCommand": "npm install",
  "functions": {
    "app/api/**/*.ts": {
      "maxDuration": 30
    }
  }
}
```

### 문제 2: SQLite 파일 생성 실패

**원인**: Vercel의 읽기 전용 파일 시스템

**해결책**: `/tmp` 디렉토리 사용 (옵션 1 참고)

### 문제 3: 타임아웃 오류

**원인**: LLM API 호출 시간 초과

**해결책**: `vercel.json`에서 `maxDuration` 설정 (위 예시 참고)

## 최종 권장사항

1. **스키마 트랙만 사용**: Vercel 배포 적합 ✅
2. **CSV 트랙도 필요**: Render.com 또는 Fly.io 사용 권장 ✅
3. **프로덕션 환경**: 외부 데이터베이스 사용 권장 ✅

## 추가 리소스

- [Vercel 공식 문서](https://vercel.com/docs)
- [Next.js 배포 가이드](https://nextjs.org/docs/deployment)
- [Vercel KV 문서](https://vercel.com/docs/storage/vercel-kv)

