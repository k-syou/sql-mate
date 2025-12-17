import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { generateSqlWithLLM, createLLMProvider } from '@/lib/llmClient';
import { generateSchemaPrompt, type SchemaData } from '@/lib/schemaPrompt';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  let datasetId: string | undefined;
  let groupId: string | undefined;
  
  try {
    const body = await request.json();
    datasetId = body.datasetId;
    groupId = body.groupId;
    const { provider, model, apiKey, baseURL } = body;

    if (!datasetId && !groupId) {
      return NextResponse.json(
        { error: 'datasetId 또는 groupId가 필요합니다.' },
        { status: 400 }
      );
    }

    const db = getDb();
    let datasets: Array<{
      id: string;
      name: string;
      table_name: string;
      pii_action: string | null;
      pii_columns: string | null;
    }> = [];

    if (groupId) {
      // 그룹 내 모든 데이터셋 조회
      const members = db
        .prepare(
          `
        SELECT d.id, d.name, d.table_name, d.pii_action, d.pii_columns
        FROM datasets d
        INNER JOIN dataset_group_members m ON d.id = m.dataset_id
        WHERE m.group_id = ?
        ORDER BY d.name
      `
        )
        .all(groupId) as Array<{
        id: string;
        name: string;
        table_name: string;
        pii_action: string | null;
        pii_columns: string | null;
      }>;
      datasets = members;
    } else if (datasetId) {
      // 단일 데이터셋 조회
      const datasetMeta = db
        .prepare(
          `
        SELECT name, table_name, pii_action, pii_columns FROM datasets WHERE id = ?
      `
        )
        .get(datasetId) as
        | {
            name: string;
            table_name: string;
            pii_action: string | null;
            pii_columns: string | null;
          }
        | undefined;

      if (datasetMeta) {
        datasets = [
          {
            id: datasetId,
            ...datasetMeta,
          },
        ];
      }
    }

    if (datasets.length === 0) {
      return NextResponse.json(
        { error: '데이터셋을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // LLM을 사용하여 추천 질문 생성 (API 키가 있는 경우)
    if (provider && apiKey && model) {
      try {
        // 스키마 프롬프트 생성
        let schemaPrompt = `다음은 데이터베이스 스키마입니다:\n\n`;
        schemaPrompt += `사용 가능한 테이블 ${datasets.length}개:\n\n`;

        for (const dataset of datasets) {
          const tableName = dataset.table_name;
          const displayTableName = dataset.name;
          const piiColumnsJson = dataset.pii_columns;
          const piiColumns: string[] = piiColumnsJson
            ? JSON.parse(piiColumnsJson)
            : [];

          const columns = db
            .prepare(`PRAGMA table_info("${tableName}")`)
            .all() as Array<{
            name: string;
            type: string;
            notnull: number;
          }>;

          const availableColumns = columns.filter((col) => col.name !== "id");
          const piiProcessedColumns = availableColumns.filter((col) =>
            piiColumns.includes(col.name)
          );

          schemaPrompt += `테이블: ${displayTableName}\n`;
          schemaPrompt += `  컬럼:\n`;
          for (const col of availableColumns) {
            const isPII = piiColumns.includes(col.name);
            const piiStatus = isPII ? ` [PII 처리됨]` : "";
            schemaPrompt += `    - ${col.name} (${col.type || "TEXT"})${piiStatus}\n`;
          }
          schemaPrompt += `\n`;
        }

        // JOIN 관련 정보 추가
        if (datasets.length > 1) {
          schemaPrompt += `테이블 간 관계:\n`;
          schemaPrompt += `- 여러 테이블을 JOIN할 수 있습니다.\n`;
          schemaPrompt += `- 공통 컬럼명이나 외래키 관계를 활용하여 JOIN하세요.\n`;
          schemaPrompt += `- 예: ${datasets[0].name}와 ${datasets[1]?.name || 'table2'}를 조인할 수 있습니다.\n`;
          schemaPrompt += `\n`;
        }

        const llmProvider = createLLMProvider(
          provider as "openai" | "claude" | "custom",
          apiKey,
          model,
          baseURL
        );

        const question = `위 스키마를 분석하여 사용자가 할 수 있는 의미있는 SQL 질문 5개를 생성해주세요.
각 질문은 실제로 이 스키마로 답변할 수 있는 구체적이고 실용적인 질문이어야 합니다.
${datasets.length > 1 
  ? `중요: 테이블이 여러 개이므로 JOIN을 사용하는 질문을 최소 2-3개 포함해주세요. 예: "${datasets[0].name}와 ${datasets[1]?.name || '다른 테이블'}를 조인하여...", "두 테이블을 연결하여..." 등`
  : '테이블 간의 관계(외래키)를 활용한 질문도 포함해주세요.'}
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
          let jsonText = response.explanation || response.sql;
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

        if (recommendations.length > 0) {
          return NextResponse.json({
            success: true,
            recommendations,
          });
        }
      } catch (llmError) {
        console.warn("LLM 기반 추천 질문 생성 실패, 기본 질문 사용:", llmError);
      }
    }

    // LLM 실패 시 또는 API 키가 없을 때 기본 질문 생성
    const tableName = datasets[0].table_name;
    const columns = db
      .prepare(`PRAGMA table_info("${tableName}")`)
      .all() as Array<{
      name: string;
      type: string;
    }>;

    if (columns.length === 0) {
      return NextResponse.json({ recommendations: [] });
    }

    const columnNames = columns.map((c) => c.name);
    const recommendations: string[] = [];

    if (datasets.length > 1) {
      // 여러 테이블일 때 JOIN 질문 포함
      recommendations.push(
        `전체 데이터를 보여주세요`,
        `${datasets[0].name}와 ${datasets[1]?.name || "다른 테이블"}를 조인하여 데이터를 보여주세요`,
        `${datasets[0].name} 테이블의 ${columnNames[0]} 컬럼 값들을 보여주세요`,
        `데이터의 총 개수는 몇 개인가요?`,
        `${datasets[0].name}와 ${datasets[1]?.name || "다른 테이블"}를 연결하여 상세 정보를 보여주세요`
      );
    } else {
      // 단일 테이블일 때
      recommendations.push(
        `전체 데이터를 보여주세요`,
        `${columnNames[0]} 컬럼의 값들을 보여주세요`,
        `데이터의 총 개수는 몇 개인가요?`,
        columnNames.length > 1
          ? `${columnNames[0]}와 ${columnNames[1]} 컬럼을 함께 보여주세요`
          : `${columnNames[0]} 컬럼의 고유한 값들을 보여주세요`,
        `가장 최근 데이터 10개를 보여주세요`
      );
    }

    return NextResponse.json({
      success: true,
      recommendations: recommendations.slice(0, 5),
    });
  } catch (error: any) {
    console.error("추천 질문 생성 오류:", error);

    // 오류 발생 시 기본 질문 반환
    if (datasetId || groupId) {
      const db = getDb();
      let datasets: Array<{ name: string }> = [];

      if (groupId) {
        const members = db
          .prepare(
            `
          SELECT d.name
          FROM datasets d
          INNER JOIN dataset_group_members m ON d.id = m.dataset_id
          WHERE m.group_id = ?
          ORDER BY d.name
        `
          )
          .all(groupId) as Array<{ name: string }>;
        datasets = members;
      } else if (datasetId) {
        const datasetMeta = db
          .prepare(`SELECT name FROM datasets WHERE id = ?`)
          .get(datasetId) as { name: string } | undefined;
        if (datasetMeta) {
          datasets = [datasetMeta];
        }
      }

      if (datasets.length > 0) {
        const recommendations =
          datasets.length > 1
            ? [
                `${datasets[0].name}와 ${datasets[1]?.name || "다른 테이블"}를 조인하여 데이터를 보여주세요`,
                `전체 데이터를 보여주세요`,
                `데이터의 총 개수는 몇 개인가요?`,
                `${datasets[0].name} 테이블의 모든 데이터를 보여주세요`,
                `두 테이블을 연결하여 상세 정보를 보여주세요`,
              ].slice(0, 5)
            : [
                `${datasets[0].name} 테이블의 모든 데이터를 보여주세요`,
                `전체 데이터를 보여주세요`,
                `데이터의 총 개수는 몇 개인가요?`,
                `가장 최근 데이터 10개를 보여주세요`,
                `데이터를 정렬하여 보여주세요`,
              ].slice(0, 5);

        return NextResponse.json({
          success: true,
          recommendations,
        });
      }
    }

    return NextResponse.json(
      { error: error.message || "추천 질문 생성 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

