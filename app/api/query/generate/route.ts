import { NextRequest, NextResponse } from "next/server";
import { generateSqlWithLLM, createLLMProvider } from "@/lib/llmClient";
import { generateSchemaPrompt, type SchemaData } from "@/lib/schemaPrompt";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { question, datasetId, schemaId, provider, model, apiKey, baseURL } =
      body;

    if (!question) {
      return NextResponse.json(
        { error: "질문이 필요합니다." },
        { status: 400 }
      );
    }

    if (!datasetId && !schemaId) {
      return NextResponse.json(
        { error: "datasetId 또는 schemaId가 필요합니다." },
        { status: 400 }
      );
    }

    if (!provider || !apiKey) {
      return NextResponse.json(
        { error: "LLM provider와 API key가 필요합니다." },
        { status: 400 }
      );
    }

    let schemaPrompt = "";

    if (datasetId) {
      // CSV 트랙: 데이터셋에서 스키마 추출
      const db = getDb();

      // 데이터셋 메타데이터 조회
      const datasetMeta = db
        .prepare(
          `
        SELECT table_name, pii_action, pii_columns FROM datasets WHERE id = ?
      `
        )
        .get(datasetId) as
        | {
            table_name: string;
            pii_action: string | null;
            pii_columns: string | null;
          }
        | undefined;

      if (!datasetMeta || !datasetMeta.table_name) {
        return NextResponse.json(
          { error: "데이터셋을 찾을 수 없습니다." },
          { status: 404 }
        );
      }

      const tableName = datasetMeta.table_name;
      const piiAction = datasetMeta.pii_action;
      const piiColumnsJson = datasetMeta.pii_columns;
      const piiColumns: string[] = piiColumnsJson
        ? JSON.parse(piiColumnsJson)
        : [];

      // 테이블 정보 확인
      const tableInfo = db
        .prepare(
          `
        SELECT sql FROM sqlite_master WHERE type='table' AND name=?
      `
        )
        .get(tableName) as { sql: string } | undefined;

      if (!tableInfo) {
        return NextResponse.json(
          { error: "테이블을 찾을 수 없습니다." },
          { status: 404 }
        );
      }

      // 테이블 정보에서 컬럼 추출
      const columns = db
        .prepare(`PRAGMA table_info("${tableName}")`)
        .all() as Array<{
        name: string;
        type: string;
        notnull: number;
      }>;

      // PII 처리 정보 포함
      const availableColumns = columns.filter((col) => col.name !== "id");
      const piiProcessedColumns = availableColumns.filter((col) =>
        piiColumns.includes(col.name)
      );
      const normalColumns = availableColumns.filter(
        (col) => !piiColumns.includes(col.name)
      );

      schemaPrompt = `다음은 데이터베이스 스키마입니다:\n\n`;
      schemaPrompt += `테이블: ${tableName}\n`;
      schemaPrompt += `  전체 컬럼:\n`;
      for (const col of availableColumns) {
        const isPII = piiColumns.includes(col.name);
        const piiStatus = isPII ? ` [PII 처리됨: ${piiAction}]` : "";
        schemaPrompt += `    - ${col.name} (${
          col.type || "TEXT"
        })${piiStatus}\n`;
      }

      if (piiProcessedColumns.length > 0) {
        schemaPrompt += `\n  중요: 다음 컬럼들은 PII(개인정보)로 인식되어 ${piiAction} 처리되었습니다:\n`;
        for (const col of piiProcessedColumns) {
          schemaPrompt += `    - ${col.name}\n`;
        }
        schemaPrompt += `\n  사용자 질문에서 "PII 처리된 컬럼 제외", "hash/drop/mask 처리된 컬럼 제외" 등의 요청이 있으면,\n`;
        schemaPrompt += `  위에 나열된 PII 처리된 컬럼들을 SELECT 절에서 제외해야 합니다.\n`;
      }

      schemaPrompt += `\n규칙:\n`;
      schemaPrompt += `- SELECT 문만 생성하세요.\n`;
      schemaPrompt += `- INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE는 사용하지 마세요.\n`;
      schemaPrompt += `- LIMIT가 없으면 자동으로 LIMIT 200이 추가됩니다.\n`;
      schemaPrompt += `- 테이블 이름은 "${tableName}"입니다.\n`;
      schemaPrompt += `- "상위 N개", "최상위 N개", "처음 N개" 등의 표현은 ORDER BY와 LIMIT를 사용하세요.\n`;
      schemaPrompt += `- "전체 컬럼" 또는 "모든 컬럼"을 요청할 때는 SELECT *를 사용할 수 있지만,\n`;
      schemaPrompt += `  PII 처리된 컬럼을 제외하라는 요청이 있으면 명시적으로 컬럼을 나열하세요.\n`;
      schemaPrompt += `- 중요: 모든 컬럼은 TEXT 타입으로 저장되어 있습니다. 숫자 비교나 계산이 필요한 경우\n`;
      schemaPrompt += `  CAST(컬럼명 AS REAL) 또는 CAST(컬럼명 AS INTEGER)를 사용하여 타입 변환을 해야 합니다.\n`;
      schemaPrompt += `  예: WHERE CAST(discount AS REAL) >= 2000\n`;
      schemaPrompt += `  예: ORDER BY CAST(quantity AS INTEGER) DESC\n`;
      schemaPrompt += `- SQL은 정확하고 실행 가능해야 합니다.\n`;
    } else if (schemaId) {
      // 스키마 트랙: 저장된 스키마 사용
      const db = getDb();
      const schemaRow = db
        .prepare(
          `
        SELECT schema_json FROM schemas WHERE id = ?
      `
        )
        .get(schemaId) as { schema_json: string } | undefined;

      if (!schemaRow) {
        return NextResponse.json(
          { error: "스키마를 찾을 수 없습니다." },
          { status: 404 }
        );
      }

      const schemaData: SchemaData = JSON.parse(schemaRow.schema_json);
      schemaPrompt = generateSchemaPrompt(schemaData);
    }

    // LLM 호출
    const llmProvider = createLLMProvider(
      provider as "openai" | "claude" | "custom",
      apiKey,
      model,
      baseURL
    );

    const result = await generateSqlWithLLM(
      llmProvider,
      schemaPrompt,
      question,
      true
    );

    return NextResponse.json({
      success: true,
      sql: result.sql,
      explanation: result.explanation,
      warnings: result.warnings,
    });
  } catch (error: any) {
    console.error("SQL 생성 오류:", error);
    return NextResponse.json(
      { error: error.message || "SQL 생성 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
