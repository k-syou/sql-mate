import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { validateSQLSafety, sanitizeSQL } from "@/lib/sqlSafety";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sql, datasetId, groupId } = body;

    if (!sql) {
      return NextResponse.json({ error: "SQL이 필요합니다." }, { status: 400 });
    }

    if (!datasetId && !groupId) {
      return NextResponse.json(
        { error: "datasetId 또는 groupId가 필요합니다." },
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
    let datasets: Array<{ name: string; table_name: string }> = [];

    if (groupId) {
      // 그룹 내 모든 데이터셋 조회
      const members = db
        .prepare(
          `
        SELECT d.name, d.table_name
        FROM datasets d
        INNER JOIN dataset_group_members m ON d.id = m.dataset_id
        WHERE m.group_id = ?
        ORDER BY d.name
      `
        )
        .all(groupId) as Array<{ name: string; table_name: string }>;
      datasets = members;
    } else if (datasetId) {
      // 단일 데이터셋 조회
      const datasetMeta = db
        .prepare(
          `
        SELECT name, table_name FROM datasets WHERE id = ?
      `
        )
        .get(datasetId) as { name: string; table_name: string } | undefined;

      if (datasetMeta) {
        datasets = [datasetMeta];
      }
    }

    if (datasets.length === 0) {
      return NextResponse.json(
        { error: "데이터셋을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // SQL에서 원본 파일명을 실제 테이블명으로 치환
    let finalSQL = sanitizedSQL;

    // 각 데이터셋의 원본 파일명을 실제 테이블명으로 치환
    for (const dataset of datasets) {
      const tableName = dataset.table_name;
      const displayTableName = dataset.name;

      // 원본 파일명을 실제 테이블명으로 치환 (대소문자 구분 없이)
      const escapedDisplayName = displayTableName.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );

      // FROM 절에서 치환
      finalSQL = finalSQL.replace(
        new RegExp(`FROM\\s+["']?${escapedDisplayName}["']?`, "gi"),
        `FROM "${tableName}"`
      );

      // JOIN 절에서 치환
      finalSQL = finalSQL.replace(
        new RegExp(`JOIN\\s+["']?${escapedDisplayName}["']?`, "gi"),
        `JOIN "${tableName}"`
      );
      finalSQL = finalSQL.replace(
        new RegExp(`INNER\\s+JOIN\\s+["']?${escapedDisplayName}["']?`, "gi"),
        `INNER JOIN "${tableName}"`
      );
      finalSQL = finalSQL.replace(
        new RegExp(`LEFT\\s+JOIN\\s+["']?${escapedDisplayName}["']?`, "gi"),
        `LEFT JOIN "${tableName}"`
      );
      finalSQL = finalSQL.replace(
        new RegExp(`RIGHT\\s+JOIN\\s+["']?${escapedDisplayName}["']?`, "gi"),
        `RIGHT JOIN "${tableName}"`
      );
      finalSQL = finalSQL.replace(
        new RegExp(
          `FULL\\s+OUTER\\s+JOIN\\s+["']?${escapedDisplayName}["']?`,
          "gi"
        ),
        `FULL OUTER JOIN "${tableName}"`
      );

      // 백틱으로 감싼 경우도 처리
      finalSQL = finalSQL.replace(
        new RegExp(`FROM\\s+\`${escapedDisplayName}\``, "gi"),
        `FROM "${tableName}"`
      );
      finalSQL = finalSQL.replace(
        new RegExp(`JOIN\\s+\`${escapedDisplayName}\``, "gi"),
        `JOIN "${tableName}"`
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
