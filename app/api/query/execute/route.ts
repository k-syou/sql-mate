import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { validateSQLSafety, sanitizeSQL } from "@/lib/sqlSafety";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sql, datasetId } = body;

    if (!sql) {
      return NextResponse.json({ error: "SQL이 필요합니다." }, { status: 400 });
    }

    if (!datasetId) {
      return NextResponse.json(
        { error: "datasetId가 필요합니다." },
        { status: 400 }
      );
    }

    // SQL 안전성 검증
    const safetyCheck = validateSQLSafety(sql);
    if (!safetyCheck.safe) {
      return NextResponse.json(
        { error: safetyCheck.error || "SQL 안전성 검증 실패" },
        { status: 400 }
      );
    }

    const sanitizedSQL = sanitizeSQL(safetyCheck.sanitized || sql);

    // 데이터셋 메타데이터에서 테이블명 조회
    const db = getDb();
    const datasetMeta = db
      .prepare(
        `
      SELECT table_name FROM datasets WHERE id = ?
    `
      )
      .get(datasetId) as { table_name: string } | undefined;

    if (!datasetMeta || !datasetMeta.table_name) {
      return NextResponse.json(
        { error: "데이터셋을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const tableName = datasetMeta.table_name;

    // 테이블명이 명시되지 않은 경우 조회한 테이블명 사용
    let finalSQL = sanitizedSQL;
    if (!/FROM\s+["']?dataset_/i.test(sanitizedSQL)) {
      // FROM 절이 없거나 dataset_로 시작하지 않으면 추가
      finalSQL = sanitizedSQL.replace(/FROM\s+(\w+)/i, `FROM "${tableName}"`);
      // FROM 절이 아예 없으면 추가
      if (!/FROM/i.test(finalSQL)) {
        finalSQL = finalSQL.replace(/SELECT/i, `SELECT * FROM "${tableName}"`);
      }
    } else {
      // 이미 dataset_가 있으면 실제 테이블명으로 교체
      finalSQL = sanitizedSQL.replace(
        /FROM\s+["']?dataset_\w+/i,
        `FROM "${tableName}"`
      );
    }

    // SQL 실행
    let result: any[] = [];
    let error: string | null = null;

    try {
      const rows = db.prepare(finalSQL).all() as any[];
      result = rows.slice(0, 200); // 최대 200행
    } catch (e: any) {
      error = e.message || "SQL 실행 오류";
    }

    if (error) {
      return NextResponse.json(
        { error, sql: finalSQL, shouldRetry: true },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result,
      rowCount: result.length,
      columns: result.length > 0 ? Object.keys(result[0]) : [],
    });
  } catch (error: any) {
    console.error("SQL 실행 오류:", error);
    return NextResponse.json(
      { error: error.message || "SQL 실행 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
