import { NextRequest, NextResponse } from 'next/server';
import { parse } from 'csv-parse/sync';
import { processPII, type PIIReport } from '@/lib/piiDetect';
import { getDb } from '@/lib/db';
import { randomUUID } from 'crypto';
import { sanitizeTableName } from '@/lib/tableName';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const filesJson = formData.get('files') as string;
    
    if (!filesJson) {
      return NextResponse.json({ error: '파일 목록이 없습니다.' }, { status: 400 });
    }

    const fileNames: string[] = JSON.parse(filesJson);
    const datasets: Array<{id: string; name: string; tableName: string}> = [];
    const db = getDb();
    const groupId = randomUUID();
    const groupName = `Group_${fileNames.map(f => f.replace(/\.[^/.]+$/, '')).join('_')}`;

    // 그룹 생성
    db.prepare(`
      INSERT INTO dataset_groups (id, name)
      VALUES (?, ?)
    `).run(groupId, groupName);

    // 각 파일 처리
    for (let i = 0; i < fileNames.length; i++) {
      const file = formData.get(`file_${i}`) as File;
      const piiActionsJson = formData.get(`piiActions_${i}`) as string;
      const piiReportJson = formData.get(`piiReport_${i}`) as string;
      
      if (!file || !piiReportJson) {
        continue;
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

      // PII 처리
      const processed = processPII(records, piiReport, piiActions);

      // SQLite에 저장
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

      // PII 처리된 컬럼 목록 추출
      const piiColumns = Object.entries(piiActions)
        .filter(([_, action]) => action !== 'none')
        .map(([colName]) => colName);
      
      const piiAction = piiColumns.length > 0 
        ? (piiActions[piiColumns[0]] || 'drop')
        : 'none';
      
      // 원본 파일명 저장 (확장자 제거)
      const originalFileName = file.name.replace(/\.[^/.]+$/, '');
      
      // 데이터셋 저장
      db.prepare(`
        INSERT INTO datasets (id, name, table_name, pii_action, pii_columns) 
        VALUES (?, ?, ?, ?, ?)
      `).run(
        datasetId, 
        originalFileName,
        fullTableName,
        piiColumns.length > 1 ? 'mixed' : piiAction,
        JSON.stringify(piiColumns)
      );

      // 그룹 멤버로 추가
      db.prepare(`
        INSERT INTO dataset_group_members (group_id, dataset_id)
        VALUES (?, ?)
      `).run(groupId, datasetId);

      datasets.push({
        id: datasetId,
        name: originalFileName,
        tableName: fullTableName,
      });
    }

    return NextResponse.json({
      success: true,
      groupId,
      datasets,
      totalFiles: datasets.length,
    });
  } catch (error: any) {
    console.error('다중 CSV 처리 오류:', error);
    return NextResponse.json(
      { error: error.message || 'CSV 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

