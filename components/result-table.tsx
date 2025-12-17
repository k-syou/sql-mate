"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Maximize2 } from "lucide-react";

interface ResultTableProps {
  data: any[];
  columns: string[];
}

function TableContent({
  data,
  columns,
  isFullScreen = false,
}: {
  data: any[];
  columns: string[];
  isFullScreen?: boolean;
}) {
  if (isFullScreen) {
    // 다이얼로그에서는 외부 컨테이너에서 스크롤 처리하므로 여기서는 overflow 없음
    return (
      <table className="text-sm min-w-max">
        <thead className="sticky top-0 z-50">
          <tr className="border-b-2 border-border">
            {columns.map((col) => (
              <th
                key={col}
                className="text-left p-3 font-semibold bg-white dark:bg-gray-950 whitespace-nowrap border-r last:border-r-0 shadow-md backdrop-blur-sm"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-b hover:bg-muted/50">
              {columns.map((col) => (
                <td key={col} className="p-3 whitespace-nowrap">
                  <div className="max-w-none">{String(row[col] ?? "")}</div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <div className="overflow-x-auto max-w-full">
      <table className="text-sm min-w-full table-fixed w-full">
        <thead
          className={
            isFullScreen ? "sticky top-0 bg-background z-10 shadow-sm" : ""
          }
        >
          <tr className="border-b">
            {columns.map((col) => (
              <th
                key={col}
                className={`text-left p-3 font-semibold bg-muted/50 ${
                  isFullScreen ? "whitespace-nowrap" : "break-words"
                }`}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-b hover:bg-muted/50">
              {columns.map((col) => (
                <td
                  key={col}
                  className={`p-3 ${
                    isFullScreen
                      ? "whitespace-nowrap"
                      : "break-words overflow-hidden"
                  }`}
                >
                  {isFullScreen ? (
                    <div className="max-w-none">{String(row[col] ?? "")}</div>
                  ) : (
                    <div className="truncate" title={String(row[col] ?? "")}>
                      {String(row[col] ?? "").slice(0, 100)}
                      {String(row[col] ?? "").length > 100 && "..."}
                    </div>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ResultTable({ data, columns }: ResultTableProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!data || data.length === 0) {
    return (
      <Card className="p-4">
        <p className="text-sm text-muted-foreground">결과가 없습니다.</p>
      </Card>
    );
  }

  return (
    <Card className="p-4 mt-4 max-w-full overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-muted-foreground">
          총 {data.length}개 행 표시
        </p>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs">
              <Maximize2 className="w-3 h-3 mr-1" />
              전체 보기
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-[95vw] max-h-[90vh] w-full flex flex-col p-0">
            <DialogHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
              <DialogTitle>쿼리 결과 ({data.length}개 행)</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-x-auto overflow-y-auto min-h-0 px-6 pb-4">
              <TableContent data={data} columns={columns} isFullScreen={true} />
            </div>
            <div className="px-6 py-3 border-t flex-shrink-0">
              <p className="text-xs text-muted-foreground text-center">
                총 {data.length}개 행 표시
              </p>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <TableContent data={data} columns={columns} isFullScreen={false} />
    </Card>
  );
}
