export interface LLMResponse {
  sql: string;
  explanation: string;
  warnings: string[];
}

export interface LLMProvider {
  generateSQL(
    prompt: string,
    question: string,
    fallbackModel?: string
  ): Promise<LLMResponse>;
}

// OpenAI 구현
class OpenAIProvider implements LLMProvider {
  private apiKey: string;
  private model: string;
  private baseURL?: string;

  constructor(apiKey: string, model: string = "gpt-4o-mini", baseURL?: string) {
    this.apiKey = apiKey;
    this.model = model;
    this.baseURL = baseURL;
  }

  async generateSQL(
    prompt: string,
    question: string,
    fallbackModel?: string
  ): Promise<LLMResponse> {
    const fullPrompt = `${prompt}\n\n질문: ${question}\n\n응답은 반드시 다음 JSON 형식으로 제공하세요:\n{\n  "sql": "SELECT ...",\n  "explanation": "...",\n  "warnings": []\n}`;

    // 사용 가능한 fallback 모델 목록 (일반적으로 접근 가능한 모델)
    const fallbackModels = [
      "gpt-4o-mini",
      "gpt-4-turbo",
      "gpt-4o",
      "gpt-4",
      "gpt-3.5-turbo",
    ];

    let currentModel = fallbackModel || this.model;
    let lastError: Error | null = null;

    // 최대 3번 시도 (원래 모델 + fallback 모델 2개)
    const modelsToTry = [
      currentModel,
      ...fallbackModels.filter((m) => m !== currentModel),
    ].slice(0, 3);

    for (const modelToTry of modelsToTry) {
      try {
        const response = await fetch(
          this.baseURL || "https://api.openai.com/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
              model: modelToTry,
              messages: [
                {
                  role: "system",
                  content: `당신은 SQL 쿼리 생성 전문가입니다. 사용자의 자연어 질문을 정확한 SELECT SQL 쿼리로 변환합니다.

중요한 지침:
1. 사용자가 "PII 처리된 컬럼 제외", "hash/drop/mask 처리된 컬럼 제외" 등을 요청하면, 스키마에 명시된 PII 처리된 컬럼들을 SELECT 절에서 제외하세요.
2. "상위 N개", "최상위 N개", "처음 N개" 등의 표현은 ORDER BY와 LIMIT를 사용하세요. 정렬 기준이 명시되지 않으면 id나 첫 번째 컬럼으로 정렬하세요.
3. "전체 컬럼"을 요청하되 PII 제외 요청이 있으면, SELECT * 대신 명시적으로 컬럼을 나열하고 PII 컬럼을 제외하세요.
4. 매우 중요: 모든 컬럼은 TEXT 타입으로 저장되어 있습니다. 숫자 비교(>=, >, <, <=, =), 숫자 계산, 숫자 정렬이 필요한 경우 반드시 CAST(컬럼명 AS REAL) 또는 CAST(컬럼명 AS INTEGER)를 사용하세요.
   예: WHERE CAST(discount AS REAL) >= 2000
   예: ORDER BY CAST(quantity AS INTEGER) DESC
   예: SELECT CAST(unit_price AS REAL) * CAST(quantity AS INTEGER) AS total
5. 응답은 반드시 유효한 JSON 형식이어야 합니다.`,
                },
                {
                  role: "user",
                  content: fullPrompt,
                },
              ],
              temperature: 0.3,
              response_format: { type: "json_object" },
            }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          let errorData;
          try {
            errorData = JSON.parse(errorText);
          } catch {
            errorData = { error: { code: "unknown" } };
          }

          // 모델 접근 불가 오류인 경우 fallback 시도
          if (response.status === 403 || response.status === 404) {
            const errorCode = errorData?.error?.code;
            if (
              errorCode === "model_not_found" ||
              errorCode === "invalid_request_error"
            ) {
              lastError = new Error(
                `모델 '${modelToTry}'에 접근할 수 없습니다.`
              );
              console.warn(
                `모델 ${modelToTry} 접근 실패, 다음 모델 시도 중...`
              );
              continue; // 다음 모델 시도
            }
          }

          // 다른 오류는 즉시 throw
          throw new Error(`LLM API 오류: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        const content = data.choices[0]?.message?.content;

        if (!content) {
          throw new Error("LLM 응답이 비어있습니다.");
        }

        try {
          const parsed = JSON.parse(content);
          const result = {
            sql: parsed.sql || "",
            explanation: parsed.explanation || "",
            warnings: parsed.warnings || [],
          };

          // fallback 모델을 사용한 경우 경고 추가
          if (modelToTry !== this.model) {
            result.warnings.push(
              `원래 선택한 모델 '${this.model}'에 접근할 수 없어 '${modelToTry}' 모델을 사용했습니다.`
            );
          }

          return result;
        } catch (e) {
          // JSON 파싱 실패 시 텍스트에서 SQL 추출 시도
          const sqlMatch =
            content.match(/```sql\n?([\s\S]*?)\n?```/) ||
            content.match(/SELECT[\s\S]*?(?=\n\n|$)/i);
          const result = {
            sql: sqlMatch ? sqlMatch[1].trim() : content.trim(),
            explanation:
              "LLM 응답을 JSON으로 파싱할 수 없어 텍스트에서 추출했습니다.",
            warnings: ["응답 형식이 예상과 다릅니다."],
          };

          if (modelToTry !== this.model) {
            result.warnings.push(
              `원래 선택한 모델 '${this.model}'에 접근할 수 없어 '${modelToTry}' 모델을 사용했습니다.`
            );
          }

          return result;
        }
      } catch (error: any) {
        lastError = error;
        // 마지막 모델이 아니면 계속 시도
        if (modelsToTry.indexOf(modelToTry) < modelsToTry.length - 1) {
          continue;
        }
        // 모든 모델 실패 시 에러 throw
        throw error;
      }
    }

    // 모든 모델 시도 실패
    throw lastError || new Error("모든 모델 접근에 실패했습니다.");
  }
}

// Anthropic Claude 구현
class ClaudeProvider implements LLMProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = "claude-3-haiku-20240307") {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generateSQL(
    prompt: string,
    question: string,
    fallbackModel?: string
  ): Promise<LLMResponse> {
    const systemPrompt = `당신은 SQL 쿼리 생성 전문가입니다. 사용자의 자연어 질문을 정확한 SELECT SQL 쿼리로 변환합니다.

중요한 지침:
1. 사용자가 "PII 처리된 컬럼 제외", "hash/drop/mask 처리된 컬럼 제외" 등을 요청하면, 스키마에 명시된 PII 처리된 컬럼들을 SELECT 절에서 제외하세요.
2. "상위 N개", "최상위 N개", "처음 N개" 등의 표현은 ORDER BY와 LIMIT를 사용하세요. 정렬 기준이 명시되지 않으면 id나 첫 번째 컬럼으로 정렬하세요.
3. "전체 컬럼"을 요청하되 PII 제외 요청이 있으면, SELECT * 대신 명시적으로 컬럼을 나열하고 PII 컬럼을 제외하세요.
4. 매우 중요: 모든 컬럼은 TEXT 타입으로 저장되어 있습니다. 숫자 비교(>=, >, <, <=, =), 숫자 계산, 숫자 정렬이 필요한 경우 반드시 CAST(컬럼명 AS REAL) 또는 CAST(컬럼명 AS INTEGER)를 사용하세요.
   예: WHERE CAST(discount AS REAL) >= 2000
   예: ORDER BY CAST(quantity AS INTEGER) DESC
   예: SELECT CAST(unit_price AS REAL) * CAST(quantity AS INTEGER) AS total
5. 응답은 반드시 유효한 JSON 형식이어야 합니다.`;

    const fullPrompt = `${prompt}\n\n질문: ${question}\n\n응답은 반드시 다음 JSON 형식으로 제공하세요:\n{\n  "sql": "SELECT ...",\n  "explanation": "...",\n  "warnings": []\n}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: fullPrompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Claude API 오류: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const content = data.content[0]?.text;

    if (!content) {
      throw new Error("Claude 응답이 비어있습니다.");
    }

    try {
      const parsed = JSON.parse(content);
      return {
        sql: parsed.sql || "",
        explanation: parsed.explanation || "",
        warnings: parsed.warnings || [],
      };
    } catch (e) {
      const sqlMatch =
        content.match(/```sql\n?([\s\S]*?)\n?```/) ||
        content.match(/SELECT[\s\S]*?(?=\n\n|$)/i);
      return {
        sql: sqlMatch ? sqlMatch[1].trim() : content.trim(),
        explanation:
          "Claude 응답을 JSON으로 파싱할 수 없어 텍스트에서 추출했습니다.",
        warnings: ["응답 형식이 예상과 다릅니다."],
      };
    }
  }
}

// Provider 팩토리
export function createLLMProvider(
  provider: "openai" | "claude" | "custom",
  apiKey: string,
  model?: string,
  baseURL?: string
): LLMProvider {
  switch (provider) {
    case "openai":
      return new OpenAIProvider(apiKey, model, baseURL);
    case "claude":
      return new ClaudeProvider(apiKey, model);
    case "custom":
      // 커스텀 provider는 baseURL이 OpenAI 호환 API여야 함
      return new OpenAIProvider(apiKey, model || "gpt-4o-mini", baseURL);
    default:
      throw new Error(`지원하지 않는 provider: ${provider}`);
  }
}

// 메인 함수
export async function generateSqlWithLLM(
  provider: LLMProvider,
  schemaPrompt: string,
  question: string,
  retryOnError: boolean = true
): Promise<LLMResponse> {
  try {
    return await provider.generateSQL(schemaPrompt, question);
  } catch (error) {
    if (retryOnError) {
      // 1회 재시도
      console.warn("LLM 호출 실패, 재시도 중...", error);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return await provider.generateSQL(schemaPrompt, question);
    }
    throw error;
  }
}
