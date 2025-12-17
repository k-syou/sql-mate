'use client';

import { Card } from '@/components/ui/card';

interface ResultTableProps {
  data: any[];
  columns: string[];
}

export function ResultTable({ data, columns }: ResultTableProps) {
  if (!data || data.length === 0) {
    return (
      <Card className="p-4">
        <p className="text-sm text-muted-foreground">결과가 없습니다.</p>
      </Card>
    );
  }

  return (
    <Card className="p-4 mt-4 max-w-full overflow-hidden">
      <div className="overflow-x-auto max-w-full">
        <table className="w-full text-sm min-w-full table-fixed">
          <thead>
            <tr className="border-b">
              {columns.map((col) => (
                <th key={col} className="text-left p-2 font-semibold break-words">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i} className="border-b hover:bg-muted/50">
                {columns.map((col) => (
                  <td key={col} className="p-2 break-words overflow-hidden">
                    <div className="truncate" title={String(row[col] ?? '')}>
                      {String(row[col] ?? '').slice(0, 100)}
                      {String(row[col] ?? '').length > 100 && '...'}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        총 {data.length}개 행 표시
      </p>
    </Card>
  );
}

