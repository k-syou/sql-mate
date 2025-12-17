import { NextRequest, NextResponse } from 'next/server';
import { parse } from 'csv-parse/sync';
import { processPII, type PIIReport } from '@/lib/piiDetect';
import { getDb } from '@/lib/db';
import { randomUUID } from 'crypto';
import { sanitizeTableName } from '@/lib/tableName';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const datasetName = formData.get('name') as string || 'Untitled Dataset';
    const piiActionsJson = formData.get('piiActions') as string;
    const piiReportJson = formData.get('piiReport') as string;
    
    if (!file || !piiReportJson) {
      return NextResponse.json({ error: '필수 파라미터가 없습니다.' }, { status: 400 });
    }

    const piiReport: PIIReport = JSON.parse(piiReportJson);
    const piiActions: Record<string, 'drop' | 'mask' | 'hash' | 'none'> = piiActionsJson 
      ? JSON.parse(piiActionsJson)
      : {};
    
    const text = await file.text();
    const records = parse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    // PII 처리 (컬럼별 액션 적용)
    const processed = processPII(records, piiReport, piiActions);

    // SQLite에 저장
    const db = getDb();
    const datasetId = randomUUID();
    
    // 파일명에서 테이블명 생성
    const tableName = sanitizeTableName(file.name);
    const fullTableName = `dataset_${tableName}_${datasetId.slice(0, 8)}`;
    
    // 테이블 생성
    if (processed.length > 0) {
      const columns = Object.keys(processed[0]);
      const columnDefs = columns.map(col => `"${col}" TEXT`).join(', ');
      
      db.exec(`
        CREATE TABLE IF NOT EXISTS "${fullTableName}" (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ${columnDefs}
        );
      `);

      // 데이터 삽입
      const insertStmt = db.prepare(`
        INSERT INTO "${fullTableName}" (${columns.map(c => `"${c}"`).join(', ')})
        VALUES (${columns.map(() => '?').join(', ')})
      `);

      const insertMany = db.transaction((rows: Record<string, any>[]) => {
        for (const row of rows) {
          insertStmt.run(columns.map(col => String(row[col] || '')));
        }
      });

      insertMany(processed);
    }

    // PII 처리된 컬럼 목록 추출 (none이 아닌 것만)
    const piiColumns = Object.entries(piiActions)
      .filter(([_, action]) => action !== 'none')
      .map(([colName]) => colName);
    
    // 메타데이터 저장 (pii_action은 첫 번째 액션이나 'mixed'로 저장)
    const piiAction = piiColumns.length > 0 
      ? (piiActions[piiColumns[0]] || 'drop')
      : 'none';
    
    // 원본 파일명 저장 (확장자 제거)
    const originalFileName = file.name.replace(/\.[^/.]+$/, '');
    
    db.prepare(`
      INSERT INTO datasets (id, name, table_name, pii_action, pii_columns) 
      VALUES (?, ?, ?, ?, ?)
    `).run(
      datasetId, 
      originalFileName, // 원본 파일명 저장
      fullTableName,
      piiColumns.length > 1 ? 'mixed' : piiAction,
      JSON.stringify(piiColumns)
    );

    return NextResponse.json({
      success: true,
      datasetId,
      tableName: fullTableName,
      name: datasetName,
      rowCount: processed.length,
      columns: processed.length > 0 ? Object.keys(processed[0]) : [],
    });
  } catch (error: any) {
    console.error('CSV 처리 오류:', error);
    return NextResponse.json(
      { error: error.message || 'CSV 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

