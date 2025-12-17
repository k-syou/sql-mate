'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Database, FileSpreadsheet } from 'lucide-react';

export default function Home() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            SQL Mate
          </h1>
          <p className="text-xl text-muted-foreground">
            자연어로 SQL 쿼리를 생성하세요
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => router.push('/csv')}>
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <FileSpreadsheet className="h-8 w-8 text-blue-600" />
                <CardTitle className="text-2xl">CSV 트랙</CardTitle>
              </div>
              <CardDescription>
                CSV 파일을 업로드하고 자연어로 데이터를 조회하세요
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>✓ CSV 파일 업로드 및 미리보기</li>
                <li>✓ PII 자동 탐지 및 처리</li>
                <li>✓ 자연어 질문으로 SQL 생성</li>
                <li>✓ 쿼리 결과 실시간 확인</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => router.push('/schema')}>
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <Database className="h-8 w-8 text-purple-600" />
                <CardTitle className="text-2xl">스키마 트랙</CardTitle>
              </div>
              <CardDescription>
                데이터베이스 스키마를 업로드하고 SQL을 생성하세요
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>✓ 스키마 JSON 업로드</li>
                <li>✓ 테이블 구조 트리 뷰</li>
                <li>✓ 자연어 질문으로 SQL 생성</li>
                <li>✓ SQL 복사 및 설명 제공</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

