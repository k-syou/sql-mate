import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { datasetId } = body;

    if (!datasetId) {
      return NextResponse.json(
        { error: 'datasetId가 필요합니다.' },
        { status: 400 }
      );
    }

    const db = getDb();
    
    // 데이터셋 메타데이터에서 테이블명 조회
    const datasetMeta = db.prepare(`
      SELECT table_name FROM datasets WHERE id = ?
    `).get(datasetId) as { table_name: string } | undefined;

    if (!datasetMeta || !datasetMeta.table_name) {
      return NextResponse.json(
        { error: '데이터셋을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    const tableName = datasetMeta.table_name;
    const columns = db.prepare(`PRAGMA table_info("${tableName}")`).all() as Array<{
      name: string;
      type: string;
    }>;

    if (columns.length === 0) {
      return NextResponse.json({ recommendations: [] });
    }

    const columnNames = columns.map(c => c.name);
    const recommendations = [
      `전체 데이터를 보여주세요`,
      `${columnNames[0]} 컬럼의 값들을 보여주세요`,
      `데이터의 총 개수는 몇 개인가요?`,
      columnNames.length > 1
        ? `${columnNames[0]}와 ${columnNames[1]} 컬럼을 함께 보여주세요`
        : `${columnNames[0]} 컬럼의 고유한 값들을 보여주세요`,
      `가장 최근 데이터 10개를 보여주세요`,
    ].slice(0, 5);

    return NextResponse.json({
      success: true,
      recommendations,
    });
  } catch (error: any) {
    console.error('추천 질문 생성 오류:', error);
    return NextResponse.json(
      { error: error.message || '추천 질문 생성 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

