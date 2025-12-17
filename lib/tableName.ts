/**
 * 파일명을 SQLite 테이블명으로 변환
 * SQLite 테이블명 규칙:
 * - 영문자, 숫자, 언더스코어(_)만 사용 가능
 * - 숫자로 시작할 수 없음
 * - SQL 키워드는 피해야 함
 * - 최대 길이 제한 (63자)
 */
export function sanitizeTableName(fileName: string): string {
  // SQL 키워드 목록 (주요 키워드만)
  const SQL_KEYWORDS = new Set([
    'select', 'from', 'where', 'insert', 'update', 'delete', 'drop', 'create',
    'alter', 'table', 'index', 'view', 'trigger', 'database', 'schema',
    'union', 'join', 'inner', 'left', 'right', 'outer', 'on', 'as', 'and',
    'or', 'not', 'in', 'like', 'between', 'is', 'null', 'order', 'by',
    'group', 'having', 'limit', 'offset', 'distinct', 'case', 'when', 'then',
    'else', 'end', 'if', 'exists', 'all', 'any', 'some', 'with', 'primary',
    'key', 'foreign', 'references', 'constraint', 'unique', 'check', 'default',
  ]);

  // 확장자 제거
  let name = fileName.replace(/\.[^/.]+$/, '');

  // 빈 문자열이면 기본값 사용
  if (!name || name.trim().length === 0) {
    name = 'dataset';
  }

  // 소문자로 변환
  name = name.toLowerCase();

  // 특수문자, 공백을 언더스코어로 변환
  name = name.replace(/[^a-z0-9_]/g, '_');

  // 연속된 언더스코어를 하나로
  name = name.replace(/_+/g, '_');

  // 앞뒤 언더스코어 제거
  name = name.replace(/^_+|_+$/g, '');

  // 숫자로 시작하면 prefix 추가
  if (/^\d/.test(name)) {
    name = 't_' + name;
  }

  // SQL 키워드 체크
  if (SQL_KEYWORDS.has(name)) {
    name = 't_' + name;
  }

  // 빈 문자열이면 기본값 사용
  if (!name || name.length === 0) {
    name = 'dataset';
  }

  // 최대 길이 제한 (63자)
  if (name.length > 63) {
    name = name.substring(0, 63);
    // 마지막이 언더스코어면 제거
    name = name.replace(/_+$/, '');
  }

  return name;
}

/**
 * 테이블명이 유효한지 검증
 */
export function isValidTableName(tableName: string): boolean {
  // 빈 문자열 체크
  if (!tableName || tableName.length === 0) {
    return false;
  }

  // 영문자, 숫자, 언더스코어만 허용
  if (!/^[a-z0-9_]+$/i.test(tableName)) {
    return false;
  }

  // 숫자로 시작하면 안됨
  if (/^\d/.test(tableName)) {
    return false;
  }

  return true;
}

