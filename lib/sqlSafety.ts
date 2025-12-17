const FORBIDDEN_KEYWORDS = [
  'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'TRUNCATE',
  'EXEC', 'EXECUTE', 'GRANT', 'REVOKE', 'MERGE', 'REPLACE',
];

export interface SQLSafetyResult {
  safe: boolean;
  error?: string;
  sanitized?: string;
}

export function validateSQLSafety(sql: string): SQLSafetyResult {
  const upperSQL = sql.trim().toUpperCase();
  
  // 다중문 체크 (세미콜론)
  const statements = sql.split(';').filter(s => s.trim());
  if (statements.length > 1) {
    return {
      safe: false,
      error: '다중 SQL 문은 허용되지 않습니다. 첫 번째 문장만 사용됩니다.',
      sanitized: statements[0].trim(),
    };
  }
  
  // 금지 키워드 체크
  for (const keyword of FORBIDDEN_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(sql)) {
      return {
        safe: false,
        error: `금지된 키워드 "${keyword}"가 포함되어 있습니다.`,
      };
    }
  }
  
  // SELECT만 허용
  if (!upperSQL.startsWith('SELECT')) {
    return {
      safe: false,
      error: 'SELECT 문만 허용됩니다.',
    };
  }
  
  // LIMIT 체크 및 추가
  const hasLimit = /\bLIMIT\s+\d+/i.test(sql);
  let sanitized = sql.trim();
  
  if (!hasLimit) {
    // ORDER BY나 다른 절이 있는지 확인
    const orderByIndex = upperSQL.indexOf('ORDER BY');
    if (orderByIndex > -1) {
      sanitized = sql.slice(0, orderByIndex).trim() + ' ' + sql.slice(orderByIndex);
      sanitized = sanitized.trim() + ' LIMIT 200';
    } else {
      sanitized = sql.trim() + ' LIMIT 200';
    }
  } else {
    // LIMIT 값이 200보다 크면 제한
    const limitMatch = sql.match(/\bLIMIT\s+(\d+)/i);
    if (limitMatch) {
      const limitValue = parseInt(limitMatch[1], 10);
      if (limitValue > 200) {
        sanitized = sql.replace(/\bLIMIT\s+\d+/i, 'LIMIT 200');
      }
    }
  }
  
  return {
    safe: true,
    sanitized,
  };
}

export function sanitizeSQL(sql: string): string {
  const result = validateSQLSafety(sql);
  if (!result.safe) {
    throw new Error(result.error || 'SQL 안전성 검증 실패');
  }
  return result.sanitized || sql;
}

