import { NextRequest, NextResponse } from 'next/server';
import { parse } from 'csv-parse/sync';
import { generatePIIReport, processPII } from '@/lib/piiDetect';
import { getDb } from '@/lib/db';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 });
    }

    const text = await file.text();
    const records = parse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    if (records.length === 0) {
      return NextResponse.json({ error: 'CSV 파일이 비어있습니다.' }, { status: 400 });
    }

    // PII 탐지
    const piiReport = generatePIIReport(
      Object.keys(records[0]),
      records
    );

    // 미리보기 (최대 20행)
    const preview = records.slice(0, 20);

    return NextResponse.json({
      success: true,
      preview,
      piiReport,
      totalRows: records.length,
      columns: Object.keys(records[0]),
    });
  } catch (error: any) {
    console.error('CSV 업로드 오류:', error);
    return NextResponse.json(
      { error: error.message || 'CSV 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

