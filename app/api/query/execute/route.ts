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
      SELECT name, table_name FROM datasets WHERE id = ?
    `
      )
      .get(datasetId) as { name: string; table_name: string } | undefined;

    if (!datasetMeta || !datasetMeta.table_name) {
      return NextResponse.json(
        { error: "데이터셋을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const tableName = datasetMeta.table_name; // 실제 테이블명
    const displayTableName = datasetMeta.name; // 원본 파일명

    // SQL에서 원본 파일명(displayTableName)을 실제 테이블명(tableName)으로 치환
    let finalSQL = sanitizedSQL;

    // 원본 파일명을 실제 테이블명으로 치환 (대소문자 구분 없이)
    const escapedDisplayName = displayTableName.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );
    finalSQL = finalSQL.replace(
      new RegExp(`FROM\\s+["']?${escapedDisplayName}["']?`, "gi"),
      `FROM "${tableName}"`
    );

    // 백틱으로 감싼 경우도 처리
    finalSQL = finalSQL.replace(
      new RegExp(`FROM\\s+\`${escapedDisplayName}\``, "gi"),
      `FROM "${tableName}"`
    );

    // FROM 절이 없거나 다른 테이블명이 있으면 실제 테이블명으로 교체
    if (!/FROM\s+["'`]/.test(finalSQL)) {
      // FROM 절이 없으면 추가
      if (!/FROM/i.test(finalSQL)) {
        finalSQL = finalSQL.replace(/SELECT/i, `SELECT * FROM "${tableName}"`);
      } else {
        // FROM 절은 있지만 테이블명이 다른 경우
        finalSQL = finalSQL.replace(
          /FROM\s+["']?[\w_]+["']?/i,
          `FROM "${tableName}"`
        );
      }
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
