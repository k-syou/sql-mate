import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { randomUUID } from 'crypto';
import { generateSchemaPrompt, type SchemaData } from '@/lib/schemaPrompt';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { schema, name } = body;

    if (!schema || !schema.tables || !Array.isArray(schema.tables)) {
      return NextResponse.json(
        { error: '유효한 스키마 JSON이 필요합니다.' },
        { status: 400 }
      );
    }

    // 스키마 검증
    const schemaData: SchemaData = schema;
    for (const table of schemaData.tables) {
      if (!table.name || !table.columns || !Array.isArray(table.columns)) {
        return NextResponse.json(
          { error: `테이블 "${table.name}"의 형식이 올바르지 않습니다.` },
          { status: 400 }
        );
      }
    }

    // 스키마 프롬프트 생성
    const schemaPrompt = generateSchemaPrompt(schemaData);

    // SQLite에 저장
    const db = getDb();
    const schemaId = randomUUID();

    db.prepare(`
      INSERT INTO schemas (id, name, schema_json) VALUES (?, ?, ?)
    `).run(schemaId, name || 'Untitled Schema', JSON.stringify(schemaData));

    return NextResponse.json({
      success: true,
      schemaId,
      name: name || 'Untitled Schema',
      schemaPrompt,
      tables: schemaData.tables.map(t => ({
        name: t.name,
        columnCount: t.columns.length,
      })),
    });
  } catch (error: any) {
    console.error('스키마 업로드 오류:', error);
    return NextResponse.json(
      { error: error.message || '스키마 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

