export interface PIIReport {
  columns: Array<{
    name: string;
    reason: string;
    confidence: "high" | "medium" | "low";
    suggestedAction: "drop" | "mask" | "hash";
  }>;
}

// PII 관련 컬럼명 키워드 (사용자 개인정보)
// 주의: 단순 "name"은 포함하지 않음 (product_name 등과 구분하기 위해)
const PII_KEYWORDS = [
  "customer_name",
  "user_name",
  "client_name",
  "person_name",
  "first_name",
  "last_name",
  "middle_name",
  "full_name",
  "이름",
  "성명",
  "email",
  "이메일",
  "mail",
  "phone",
  "전화",
  "tel",
  "mobile",
  "휴대폰",
  "address",
  "주소",
  "addr",
  "ssn",
  "주민",
  "주민번호",
  "social",
  "계좌",
  "account",
  "bank",
  "card",
  "카드",
  "credit",
  "ip",
  "ipaddress",
  "ip_address",
  "password",
  "비밀번호",
  "passwd",
  "pwd",
  "birth",
  "생년월일",
  "birthday",
  "user_id",
  "userid",
];

// PII가 아닌 컬럼명 키워드 (제외 목록 - 우선순위 높음)
const NON_PII_KEYWORDS = [
  "product_name",
  "order_name",
  "item_name",
  "goods_name",
  "category_name",
  "type_name",
  "status_name",
  "company_name",
  "organization_name",
  "org_name",
  "table_name",
  "column_name",
  "field_name",
  "file_name",
  "folder_name",
  "path_name",
  "상품명",
  "주문명",
  "항목명",
  "카테고리명",
];

// 값 패턴 정규식
const PATTERNS = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/i,
  phone: /^[\d\s\-\(\)\+]{10,}$/,
  ip: /^(\d{1,3}\.){3}\d{1,3}$/,
  ssn: /^\d{6}[-]?\d{7}$/,
  account: /^\d{10,}$/,
  card: /^\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}$/,
};

export function detectPII(
  columnName: string,
  sampleValues: string[]
): { isPII: boolean; reason: string; confidence: "high" | "medium" | "low" } {
  const lowerName = columnName.toLowerCase();

  // 먼저 PII가 아닌 키워드 체크 (우선순위 높음)
  for (const nonPiiKeyword of NON_PII_KEYWORDS) {
    if (lowerName.includes(nonPiiKeyword.toLowerCase())) {
      return {
        isPII: false,
        reason: `컬럼명에 "${nonPiiKeyword}" 키워드가 포함되어 PII가 아닌 것으로 판단됩니다.`,
        confidence: "high",
      };
    }
  }

  // 컬럼명 기반 검사
  let keywordMatch = false;
  let matchedKeyword = "";

  for (const keyword of PII_KEYWORDS) {
    if (lowerName.includes(keyword.toLowerCase())) {
      keywordMatch = true;
      matchedKeyword = keyword;
      break;
    }
  }

  // 단순히 "name"만 포함된 경우 추가 검증
  // customer_name, user_name 등은 이미 PII_KEYWORDS에 포함됨
  // product_name, order_name 등은 이미 NON_PII_KEYWORDS에서 제외됨
  // 단순 "name"만 있는 경우는 값 패턴으로만 판단 (키워드 매칭 없음)
  if (lowerName === "name" && !keywordMatch) {
    keywordMatch = false; // 값 패턴으로만 판단
  }

  // 값 패턴 기반 검사
  let patternMatch = false;
  let matchedPattern = "";
  let matchCount = 0;

  const sampleSize = Math.min(sampleValues.length, 20);
  const validSamples = sampleValues
    .slice(0, sampleSize)
    .filter((v) => v && v.trim());

  if (validSamples.length > 0) {
    for (const [patternName, pattern] of Object.entries(PATTERNS)) {
      const matches = validSamples.filter((v) =>
        pattern.test(String(v))
      ).length;
      const matchRate = matches / validSamples.length;

      if (matchRate > 0.5) {
        patternMatch = true;
        matchedPattern = patternName;
        matchCount = matches;
        break;
      }
    }
  }

  // 판정
  if (keywordMatch && patternMatch) {
    return {
      isPII: true,
      reason: `컬럼명에 "${matchedKeyword}" 키워드 포함 및 값 패턴이 "${matchedPattern}"와 일치 (${matchCount}/${validSamples.length} 샘플 매칭)`,
      confidence: "high",
    };
  } else if (keywordMatch) {
    return {
      isPII: true,
      reason: `컬럼명에 "${matchedKeyword}" 키워드 포함`,
      confidence: "medium",
    };
  } else if (patternMatch) {
    return {
      isPII: true,
      reason: `값 패턴이 "${matchedPattern}"와 일치 (${matchCount}/${validSamples.length} 샘플 매칭)`,
      confidence: "medium",
    };
  }

  return {
    isPII: false,
    reason: "",
    confidence: "low",
  };
}

export function generatePIIReport(
  columns: string[],
  data: Record<string, any>[]
): PIIReport {
  const report: PIIReport = { columns: [] };

  for (const col of columns) {
    const sampleValues = data
      .slice(0, 20)
      .map((row) => row[col])
      .filter((v) => v !== null && v !== undefined);

    const detection = detectPII(col, sampleValues.map(String));

    if (detection.isPII) {
      report.columns.push({
        name: col,
        reason: detection.reason,
        confidence: detection.confidence,
        suggestedAction: detection.confidence === "high" ? "drop" : "mask",
      });
    }
  }

  return report;
}

export function processPII(
  data: Record<string, any>[],
  piiReport: PIIReport,
  actions:
    | Record<string, "drop" | "mask" | "hash" | "none">
    | "drop"
    | "mask"
    | "hash" = "drop"
): Record<string, any>[] {
  // 단일 액션인 경우 (하위 호환성)
  const isSingleAction = typeof actions === "string";
  const actionMap: Record<string, "drop" | "mask" | "hash" | "none"> =
    isSingleAction ? {} : actions;

  // 단일 액션인 경우 모든 PII 컬럼에 적용
  if (isSingleAction) {
    const piiColumns = piiReport.columns.map((c) => c.name);
    piiColumns.forEach((col) => {
      actionMap[col] = actions as "drop" | "mask" | "hash";
    });
  }

  return data.map((row) => {
    const processed: Record<string, any> = { ...row };

    for (const col of Object.keys(actionMap)) {
      const action = actionMap[col];

      // none인 경우 처리하지 않음
      if (action === "none") {
        continue;
      }

      if (action === "drop") {
        delete processed[col];
      } else if (action === "mask") {
        const value = String(processed[col] || "");
        if (value.length > 0) {
          if (value.length <= 2) {
            processed[col] = "**";
          } else if (value.length <= 4) {
            processed[col] = value[0] + "*".repeat(value.length - 1);
          } else {
            processed[col] =
              value.slice(0, 2) +
              "*".repeat(value.length - 4) +
              value.slice(-2);
          }
        }
      } else if (action === "hash") {
        // 간단한 해시 (실제로는 crypto 사용 권장)
        const value = String(processed[col] || "");
        if (value.length > 0) {
          let hash = 0;
          for (let i = 0; i < value.length; i++) {
            const char = value.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash;
          }
          processed[col] = `hash_${Math.abs(hash).toString(16)}`;
        }
      }
    }

    return processed;
  });
}
