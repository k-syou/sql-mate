import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { generateSqlWithLLM, createLLMProvider } from "@/lib/llmClient";
import { generateSchemaPrompt, type SchemaData } from "@/lib/schemaPrompt";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  let schemaId: string | undefined;
  try {
    const body = await request.json();
    schemaId = body.schemaId;
    const { provider, model, apiKey, baseURL } = body;

    if (!schemaId) {
      return NextResponse.json(
        { error: "schemaId가 필요합니다." },
        { status: 400 }
      );
    }

    if (!provider || !apiKey) {
      return NextResponse.json(
        { error: "LLM provider와 API key가 필요합니다." },
        { status: 400 }
      );
    }

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
    const schemaPrompt = generateSchemaPrompt(schemaData);

    // LLM을 사용하여 추천 질문 생성
    const llmProvider = createLLMProvider(
      provider as "openai" | "claude" | "custom",
      apiKey,
      model,
      baseURL
    );

    const question = `위 스키마를 분석하여 사용자가 할 수 있는 의미있는 SQL 질문 5개를 생성해주세요.
각 질문은 실제로 이 스키마로 답변할 수 있는 구체적이고 실용적인 질문이어야 합니다.
테이블 간의 관계(외래키)를 활용한 질문도 포함해주세요.
질문은 자연스러운 한국어로 작성해주세요.

응답은 반드시 다음 JSON 형식으로 제공하세요:
{
  "recommendations": [
    "질문 1",
    "질문 2",
    "질문 3",
    "질문 4",
    "질문 5"
  ]
}`;

    const response = await llmProvider.generateSQL(schemaPrompt, question);

    // LLM 응답에서 추천 질문 추출
    let recommendations: string[] = [];

    try {
      // explanation이나 sql에서 JSON 추출 시도
      let jsonText = response.explanation || response.sql;

      // JSON 블록 찾기
      const jsonMatch = jsonText.match(/\{[\s\S]*"recommendations"[\s\S]*\}/);
      if (jsonMatch) {
        jsonText = jsonMatch[0];
      }

      const parsed = JSON.parse(jsonText);
      if (parsed.recommendations && Array.isArray(parsed.recommendations)) {
        recommendations = parsed.recommendations
          .filter((q: any) => q && typeof q === "string" && q.trim().length > 0)
          .slice(0, 5);
      }
    } catch (e) {
      // JSON 파싱 실패 시 텍스트에서 추출
      const text = response.explanation || response.sql;
      const lines = text.split("\n").filter((line) => line.trim());
      recommendations = lines
        .filter((line) => {
          const trimmed = line.trim();
          return (
            /^\d+[\.\)]\s*/.test(trimmed) ||
            /^[-*•]\s*/.test(trimmed) ||
            (trimmed.includes("?") && trimmed.length > 10) ||
            (trimmed.length > 15 && trimmed.length < 200)
          );
        })
        .map((line) =>
          line
            .replace(/^\d+[\.\)]\s*/, "")
            .replace(/^[-*•]\s*/, "")
            .trim()
        )
        .filter(
          (line) =>
            line.length > 0 && !line.startsWith("{") && !line.startsWith("[")
        )
        .slice(0, 5);
    }

    // 추천 질문이 없으면 기본 질문 생성
    if (recommendations.length === 0) {
      const tableNames = schemaData.tables.map((t) => t.name);
      recommendations = [
        `${tableNames[0]} 테이블의 모든 데이터를 보여주세요`,
        `전체 테이블 목록과 각 테이블의 컬럼 수를 보여주세요`,
        tableNames.length > 1
          ? `${tableNames[0]}와 ${tableNames[1]} 테이블을 조인하여 데이터를 보여주세요`
          : `${tableNames[0]} 테이블의 총 레코드 수를 보여주세요`,
        `가장 최근에 생성된 레코드 10개를 보여주세요`,
        `각 테이블별 레코드 수를 보여주세요`,
      ].slice(0, 5);
    }

    return NextResponse.json({
      success: true,
      recommendations,
    });
  } catch (error: any) {
    console.error("스키마 기반 추천 질문 생성 오류:", error);

    // 오류 발생 시 기본 질문 반환
    if (!schemaId) {
      return NextResponse.json(
        { error: error.message || "추천 질문 생성 중 오류가 발생했습니다." },
        { status: 500 }
      );
    }

    const db = getDb();
    const schemaRow = db
      .prepare(
        `
      SELECT schema_json FROM schemas WHERE id = ?
    `
      )
      .get(schemaId) as { schema_json: string } | undefined;

    if (schemaRow) {
      const schemaData: SchemaData = JSON.parse(schemaRow.schema_json);
      const tableNames = schemaData.tables.map((t) => t.name);
      const recommendations = [
        `${tableNames[0]} 테이블의 모든 데이터를 보여주세요`,
        `전체 테이블 목록과 각 테이블의 컬럼 수를 보여주세요`,
        tableNames.length > 1
          ? `${tableNames[0]}와 ${tableNames[1]} 테이블을 조인하여 데이터를 보여주세요`
          : `${tableNames[0]} 테이블의 총 레코드 수를 보여주세요`,
        `가장 최근에 생성된 레코드 10개를 보여주세요`,
        `각 테이블별 레코드 수를 보여주세요`,
      ].slice(0, 5);

      return NextResponse.json({
        success: true,
        recommendations,
      });
    }

    return NextResponse.json(
      { error: error.message || "추천 질문 생성 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
