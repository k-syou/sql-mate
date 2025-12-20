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
  maxRows = Infinity,
}: {
  data: any[];
  columns: string[];
  isFullScreen?: boolean;
  maxRows?: number;
}) {
  // 작은 화면에서는 처음 5개 컬럼만 표시, 큰 화면에서는 모든 컬럼 표시
  const visibleColumns = columns;
  const hasMoreColumns = columns.length > 5;
  // 표시할 데이터: 전체 화면이면 모든 데이터, 아니면 maxRows만큼만
  const displayData = isFullScreen ? data : data.slice(0, maxRows);

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
          {displayData.map((row, i) => (
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
    <div className="overflow-x-auto max-w-full -mx-2 sm:mx-0">
      <table className="text-xs sm:text-sm min-w-full table-fixed w-full">
        <thead
          className={
            isFullScreen ? "sticky top-0 bg-background z-10 shadow-sm" : ""
          }
        >
          <tr className="border-b">
            {/* 작은 화면: 처음 5개만 표시, 큰 화면: 모든 컬럼 표시 */}
            {visibleColumns.map((col, index) => (
              <th
                key={col}
                className={`text-left p-2 sm:p-3 font-semibold bg-muted/50 ${
                  isFullScreen ? "whitespace-nowrap" : "break-words"
                } ${
                  hasMoreColumns && index >= 5 ? "hidden lg:table-cell" : ""
                }`}
              >
                {col}
              </th>
            ))}
            {/* 작은 화면에서 5개를 넘는 컬럼이 있을 때 힌트 표시 */}
            {hasMoreColumns && (
              <th className="text-left p-2 sm:p-3 font-semibold bg-muted/50 break-words lg:hidden">
                <span className="text-muted-foreground text-xs">
                  +{columns.length - 5}개 더
                </span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {displayData.map((row, i) => (
            <tr key={i} className="border-b hover:bg-muted/50">
              {visibleColumns.map((col, index) => (
                <td
                  key={col}
                  className={`p-2 sm:p-3 ${
                    isFullScreen
                      ? "whitespace-nowrap"
                      : "break-words overflow-hidden"
                  } ${
                    hasMoreColumns && index >= 5 ? "hidden lg:table-cell" : ""
                  }`}
                >
                  {isFullScreen ? (
                    <div className="max-w-none">{String(row[col] ?? "")}</div>
                  ) : (
                    <div className="truncate" title={String(row[col] ?? "")}>
                      <span className="hidden sm:inline">
                        {String(row[col] ?? "").slice(0, 100)}
                        {String(row[col] ?? "").length > 100 && "..."}
                      </span>
                      <span className="sm:hidden">
                        {String(row[col] ?? "").slice(0, 30)}
                        {String(row[col] ?? "").length > 30 && "..."}
                      </span>
                    </div>
                  )}
                </td>
              ))}
              {/* 작은 화면에서 5개를 넘는 컬럼이 있을 때 힌트 셀 */}
              {hasMoreColumns && (
                <td className="p-2 sm:p-3 break-words overflow-hidden lg:hidden">
                  <div className="text-muted-foreground text-xs text-center">
                    전체 보기 버튼을 눌러 모든 컬럼 확인
                  </div>
                </td>
              )}
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
    <Card className="p-2 sm:p-4 mt-4 max-w-full overflow-hidden">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-2">
        <p className="text-xs text-muted-foreground">
          {data.length > 10 ? (
            <>
              {10}개 행 표시 (전체 {data.length}개 중)
            </>
          ) : (
            <>총 {data.length}개 행 표시</>
          )}
        </p>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs w-full sm:w-auto"
            >
              <Maximize2 className="w-3 h-3 mr-1" />
              전체 보기
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-[95vw] max-h-[90vh] w-full flex flex-col p-0">
            <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4 border-b flex-shrink-0">
              <DialogTitle className="text-sm sm:text-base">
                쿼리 결과 ({data.length}개 행)
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-x-auto overflow-y-auto min-h-0 px-2 sm:px-6 pb-3 sm:pb-4">
              <TableContent data={data} columns={columns} isFullScreen={true} />
            </div>
            <div className="px-4 sm:px-6 py-2 sm:py-3 border-t flex-shrink-0">
              <p className="text-xs text-muted-foreground text-center">
                총 {data.length}개 행 표시
              </p>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <TableContent
        data={data}
        columns={columns}
        isFullScreen={false}
        maxRows={10}
      />
    </Card>
  );
}
