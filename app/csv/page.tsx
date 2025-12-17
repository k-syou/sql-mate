"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ChatMessage } from "@/components/chat-message";
import { ChatInput } from "@/components/chat-input";
import { ModelSelector } from "@/components/model-selector";
import { ResultTable } from "@/components/result-table";
import { useToast } from "@/components/ui/use-toast";
import {
  Upload,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  X,
  Copy,
  Check,
} from "lucide-react";
import { useDropzone } from "react-dropzone";

interface Message {
  role: "user" | "assistant";
  content: string;
  sql?: string;
  explanation?: string;
  warnings?: string[];
  data?: any[];
}

export default function CSVTrackPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<Record<string, any[]>>({});
  const [filePiiReports, setFilePiiReports] = useState<Record<string, any>>({});
  const [filePiiActions, setFilePiiActions] = useState<
    Record<string, Record<string, "drop" | "mask" | "hash" | "none">>
  >({});
  const [datasetId, setDatasetId] = useState<string | null>(null);
  const [datasetGroupId, setDatasetGroupId] = useState<string | null>(null);
  const [datasetInfo, setDatasetInfo] = useState<
    Array<{ id: string; name: string; tableName: string }>
  >([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState("openai");
  const [model, setModel] = useState("gpt-4o-mini");
  const [apiKey, setApiKey] = useState("");
  const [baseURL, setBaseURL] = useState("");
  const [recommendations, setRecommendations] = useState<string[]>([]);
  const [copiedSql, setCopiedSql] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "text/csv": [".csv"] },
    multiple: true,
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        handleFilesUpload(acceptedFiles);
      }
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const storedKey = localStorage.getItem("llm_api_key");
    const storedProvider = localStorage.getItem("llm_provider");
    const storedModel = localStorage.getItem("llm_model");
    if (storedKey) setApiKey(storedKey);
    if (storedProvider) setProvider(storedProvider);
    if (storedModel) setModel(storedModel);
  }, []);

  const handleFilesUpload = async (uploadedFiles: File[]) => {
    setFiles(uploadedFiles);
    setLoading(true);

    try {
      const newPreviews: Record<string, any[]> = {};
      const newPiiReports: Record<string, any> = {};
      const newPiiActions: Record<
        string,
        Record<string, "drop" | "mask" | "hash" | "none">
      > = {};

      // 각 파일별로 PII 탐지
      for (const file of uploadedFiles) {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/upload/csv", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || `파일 ${file.name} 업로드 실패`);
        }

        const fileKey = file.name;
        newPreviews[fileKey] = data.preview;
        newPiiReports[fileKey] = data.piiReport;

        // 각 컬럼별 기본 액션 설정
        const initialActions: Record<
          string,
          "drop" | "mask" | "hash" | "none"
        > = {};
        if (data.piiReport && data.piiReport.columns) {
          data.piiReport.columns.forEach((col: any) => {
            initialActions[col.name] = col.suggestedAction || "drop";
          });
        }
        newPiiActions[fileKey] = initialActions;
      }

      setFilePreviews(newPreviews);
      setFilePiiReports(newPiiReports);
      setFilePiiActions(newPiiActions);

      toast({
        title: "파일 업로드 완료",
        description: `${uploadedFiles.length}개 파일이 업로드되었습니다.`,
      });
    } catch (error: any) {
      toast({
        title: "오류",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopySQL = (sql: string) => {
    navigator.clipboard.writeText(sql);
    setCopiedSql(sql);
    toast({
      title: "복사됨",
      description: "SQL이 클립보드에 복사되었습니다.",
    });
    setTimeout(() => setCopiedSql(null), 2000);
  };

  const handleRemoveFile = () => {
    // 이 함수는 더 이상 사용되지 않음 (개별 파일 제거는 UI에서 처리)
    handleResetDataset();
  };

  const handleLoadSample = async () => {
    try {
      setLoading(true);
      // 두 개의 샘플 CSV 파일 가져오기
      const [ordersResponse, sellersResponse] = await Promise.all([
        fetch("/samples/sqlmate_sample_orders_with_pii.csv"),
        fetch("/samples/sqlmate_sample_sellers.csv"),
      ]);

      if (!ordersResponse.ok || !sellersResponse.ok) {
        throw new Error("샘플 파일을 불러올 수 없습니다.");
      }

      const [ordersText, sellersText] = await Promise.all([
        ordersResponse.text(),
        sellersResponse.text(),
      ]);

      // File 객체 생성
      const ordersBlob = new Blob([ordersText], { type: "text/csv" });
      const sellersBlob = new Blob([sellersText], { type: "text/csv" });

      const ordersFile = new File(
        [ordersBlob],
        "sqlmate_sample_orders_with_pii.csv",
        { type: "text/csv" }
      );
      const sellersFile = new File(
        [sellersBlob],
        "sqlmate_sample_sellers.csv",
        { type: "text/csv" }
      );

      // 두 파일을 동시에 업로드 처리
      await handleFilesUpload([ordersFile, sellersFile]);

      toast({
        title: "샘플 데이터 로드 완료",
        description: "2개의 샘플 CSV 파일이 로드되었습니다.",
      });
    } catch (error: any) {
      toast({
        title: "오류",
        description: error.message || "샘플 파일 로드 실패",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResetDataset = () => {
    if (
      confirm(
        "데이터셋을 초기화하시겠습니까? 모든 데이터와 채팅 기록이 삭제됩니다."
      )
    ) {
      setFiles([]);
      setFilePreviews({});
      setFilePiiReports({});
      setFilePiiActions({});
      setDatasetId(null);
      setDatasetGroupId(null);
      setDatasetInfo([]);
      setMessages([]);
      setRecommendations([]);
      toast({
        title: "초기화 완료",
        description: "데이터셋이 초기화되었습니다.",
      });
    }
  };

  const handleProcessPII = async () => {
    if (files.length === 0) return;

    setLoading(true);
    try {
      // 여러 파일을 하나의 그룹으로 처리
      const formData = new FormData();
      formData.append("files", JSON.stringify(files.map((f) => f.name)));

      // 각 파일별 정보 추가
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileKey = file.name;
        formData.append(`file_${i}`, file);
        formData.append(
          `piiActions_${i}`,
          JSON.stringify(filePiiActions[fileKey] || {})
        );
        formData.append(
          `piiReport_${i}`,
          JSON.stringify(filePiiReports[fileKey])
        );
      }

      const res = await fetch("/api/upload/csv/process-multiple", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "처리 실패");
      }

      setDatasetGroupId(data.groupId);
      setDatasetInfo(data.datasets);
      // 첫 번째 데이터셋 ID를 메인으로 사용 (하위 호환성)
      if (data.datasets && data.datasets.length > 0) {
        setDatasetId(data.datasets[0].id);
      }

      // 추천 질문 가져오기 (API 키가 있으면 LLM으로 생성)
      try {
        const recRes = await fetch("/api/query/recommendations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            datasetId: data.datasets?.[0]?.id,
            groupId: data.groupId,
            provider: apiKey ? provider : undefined,
            model: apiKey ? model : undefined,
            apiKey: apiKey || undefined,
            baseURL: apiKey ? baseURL : undefined,
          }),
        });
        const recData = await recRes.json();
        if (recData.recommendations) {
          setRecommendations(recData.recommendations);
        }
      } catch (recError) {
        // 추천 질문 생성 실패는 무시 (선택적 기능)
        console.warn("추천 질문 생성 실패:", recError);
      }

      toast({
        title: "처리 완료",
        description: `${files.length}개 파일이 준비되었습니다. 이제 JOIN 쿼리를 사용할 수 있습니다.`,
      });
    } catch (error: any) {
      toast({
        title: "오류",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (question: string) => {
    if ((!datasetId && !datasetGroupId) || !apiKey) {
      toast({
        title: "오류",
        description:
          "데이터셋이 준비되지 않았거나 API 키가 설정되지 않았습니다.",
        variant: "destructive",
      });
      return;
    }

    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setLoading(true);

    // API 키 저장
    localStorage.setItem("llm_api_key", apiKey);
    localStorage.setItem("llm_provider", provider);
    localStorage.setItem("llm_model", model);

    try {
      // SQL 생성
      const genRes = await fetch("/api/query/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          datasetId: datasetGroupId ? undefined : datasetId,
          groupId: datasetGroupId || undefined,
          provider,
          model,
          apiKey,
          baseURL: baseURL || undefined,
        }),
      });

      const genData = await genRes.json();

      if (!genRes.ok) {
        throw new Error(genData.error || "SQL 생성 실패");
      }

      // SQL 실행
      const execRes = await fetch("/api/query/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sql: genData.sql,
          datasetId: datasetGroupId ? undefined : datasetId,
          groupId: datasetGroupId || undefined,
        }),
      });

      const execData = await execRes.json();

      if (!execRes.ok && execData.shouldRetry) {
        // SQL 실행 실패 시 에러 메시지를 포함해 재생성
        try {
          const retryRes = await fetch("/api/query/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              question: `${question} (이전 SQL 실행 오류: ${execData.error})`,
              datasetId: datasetGroupId ? undefined : datasetId,
              groupId: datasetGroupId || undefined,
              provider,
              model,
              apiKey,
              baseURL: baseURL || undefined,
            }),
          });

          const retryData = await retryRes.json();

          if (retryRes.ok) {
            // 재생성된 SQL 실행
            const retryExecRes = await fetch("/api/query/execute", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sql: retryData.sql,
                datasetId: datasetGroupId ? undefined : datasetId,
                groupId: datasetGroupId || undefined,
              }),
            });

            const retryExecData = await retryExecRes.json();

            if (retryExecRes.ok) {
              setMessages((prev) => [
                ...prev,
                {
                  role: "assistant",
                  content: `쿼리 결과를 찾았습니다. ${retryExecData.rowCount}개의 행이 반환되었습니다. (재시도 성공)`,
                  sql: retryData.sql,
                  explanation: retryData.explanation,
                  warnings: retryData.warnings,
                  data: retryExecData.data,
                },
              ]);
              return;
            }
          }
        } catch (retryError) {
          // 재시도 실패 시 원래 에러 메시지 표시
        }
      }

      if (!execRes.ok) {
        // SQL 생성은 성공했지만 실행 실패
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `SQL을 생성했지만 실행 중 오류가 발생했습니다: ${execData.error}`,
            sql: genData.sql,
            explanation: genData.explanation,
            warnings: genData.warnings,
          },
        ]);
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `쿼리 결과를 찾았습니다. ${execData.rowCount}개의 행이 반환되었습니다.`,
          sql: genData.sql,
          explanation: genData.explanation,
          warnings: genData.warnings,
          data: execData.data,
        },
      ]);
    } catch (error: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `오류가 발생했습니다: ${error.message}`,
        },
      ]);
      toast({
        title: "오류",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push("/")}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-2xl font-bold">CSV 트랙</h1>
          </div>
          <div className="flex items-center gap-4">
            <Input
              type="password"
              placeholder="LLM API Key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className={`w-[200px] ${
                !apiKey ? "border-red-500 focus-visible:ring-red-500" : ""
              }`}
            />
            {provider === "custom" && (
              <Input
                type="text"
                placeholder="Base URL"
                value={baseURL}
                onChange={(e) => setBaseURL(e.target.value)}
                className="w-[200px]"
              />
            )}
            <ModelSelector
              provider={provider}
              model={model}
              onProviderChange={setProvider}
              onModelChange={setModel}
            />
          </div>
        </div>
      </div>

      <div className="flex-1 container mx-auto px-4 py-6 flex gap-6">
        <div className="w-1/3 space-y-4">
          {!datasetId ? (
            <Card>
              <CardHeader>
                <CardTitle>CSV 파일 업로드</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div
                  {...getRootProps()}
                  className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                    isDragActive
                      ? "border-primary bg-primary/5"
                      : "border-muted"
                  }`}
                >
                  <input {...getInputProps()} />
                  <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {isDragActive
                      ? "파일을 놓으세요"
                      : "CSV 파일을 드래그하거나 클릭하여 업로드 (여러 파일 선택 가능)"}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1 border-t"></div>
                  <span className="text-xs text-muted-foreground">또는</span>
                  <div className="flex-1 border-t"></div>
                </div>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleLoadSample}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      로딩 중...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      샘플 데이터 로드
                    </>
                  )}
                </Button>

                {files.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold">
                        업로드된 파일 ({files.length}개)
                      </h3>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleResetDataset}
                        className="text-destructive hover:text-destructive"
                      >
                        <X className="w-4 h-4 mr-1" />
                        모두 제거
                      </Button>
                    </div>

                    <div className="space-y-4 max-h-[600px] overflow-y-auto">
                      {files.map((file, fileIndex) => {
                        const fileKey = file.name;
                        const preview = filePreviews[fileKey] || [];
                        const piiReport = filePiiReports[fileKey];
                        const piiActions = filePiiActions[fileKey] || {};

                        return (
                          <Card key={fileIndex} className="p-4">
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="font-medium text-sm">
                                {file.name}
                              </h4>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const newFiles = files.filter(
                                    (_, i) => i !== fileIndex
                                  );
                                  const newPreviews = { ...filePreviews };
                                  const newPiiReports = { ...filePiiReports };
                                  const newPiiActions = { ...filePiiActions };
                                  delete newPreviews[fileKey];
                                  delete newPiiReports[fileKey];
                                  delete newPiiActions[fileKey];
                                  setFiles(newFiles);
                                  setFilePreviews(newPreviews);
                                  setFilePiiReports(newPiiReports);
                                  setFilePiiActions(newPiiActions);
                                }}
                                className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </div>

                            {preview.length > 0 && (
                              <div className="mb-3">
                                <h5 className="text-xs font-medium mb-2">
                                  미리보기 (5행)
                                </h5>
                                <div className="border rounded-lg overflow-auto max-h-[150px]">
                                  <table className="w-full text-xs">
                                    <thead className="bg-muted">
                                      <tr>
                                        {Object.keys(preview[0] || {}).map(
                                          (key) => (
                                            <th
                                              key={key}
                                              className="p-1 text-left"
                                            >
                                              {key}
                                            </th>
                                          )
                                        )}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {preview.slice(0, 5).map((row, i) => (
                                        <tr key={i} className="border-t">
                                          {Object.values(row).map(
                                            (val: any, j) => (
                                              <td key={j} className="p-1">
                                                {String(val).slice(0, 30)}
                                              </td>
                                            )
                                          )}
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}

                            {piiReport &&
                              piiReport.columns &&
                              piiReport.columns.length > 0 && (
                                <div className="mb-3">
                                  <h5 className="text-xs font-medium mb-2 flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3 text-amber-600" />
                                    PII 탐지 결과
                                  </h5>
                                  <div className="space-y-2 text-xs">
                                    {piiReport.columns.map(
                                      (col: any, i: number) => (
                                        <div
                                          key={i}
                                          className="p-2 bg-amber-50 dark:bg-amber-950 rounded border"
                                        >
                                          <div className="mb-1">
                                            <p className="font-medium">
                                              {col.name}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                              {col.reason}
                                            </p>
                                          </div>
                                          <div className="flex gap-1 flex-wrap mt-1">
                                            <Button
                                              size="sm"
                                              variant={
                                                piiActions[col.name] === "none"
                                                  ? "default"
                                                  : "outline"
                                              }
                                              onClick={() =>
                                                setFilePiiActions({
                                                  ...filePiiActions,
                                                  [fileKey]: {
                                                    ...piiActions,
                                                    [col.name]: "none",
                                                  },
                                                })
                                              }
                                              className="text-xs h-6 px-2"
                                            >
                                              보관
                                            </Button>
                                            <Button
                                              size="sm"
                                              variant={
                                                piiActions[col.name] === "drop"
                                                  ? "default"
                                                  : "outline"
                                              }
                                              onClick={() =>
                                                setFilePiiActions({
                                                  ...filePiiActions,
                                                  [fileKey]: {
                                                    ...piiActions,
                                                    [col.name]: "drop",
                                                  },
                                                })
                                              }
                                              className="text-xs h-6 px-2"
                                            >
                                              Drop
                                            </Button>
                                            <Button
                                              size="sm"
                                              variant={
                                                piiActions[col.name] === "mask"
                                                  ? "default"
                                                  : "outline"
                                              }
                                              onClick={() =>
                                                setFilePiiActions({
                                                  ...filePiiActions,
                                                  [fileKey]: {
                                                    ...piiActions,
                                                    [col.name]: "mask",
                                                  },
                                                })
                                              }
                                              className="text-xs h-6 px-2"
                                            >
                                              Mask
                                            </Button>
                                            <Button
                                              size="sm"
                                              variant={
                                                piiActions[col.name] === "hash"
                                                  ? "default"
                                                  : "outline"
                                              }
                                              onClick={() =>
                                                setFilePiiActions({
                                                  ...filePiiActions,
                                                  [fileKey]: {
                                                    ...piiActions,
                                                    [col.name]: "hash",
                                                  },
                                                })
                                              }
                                              className="text-xs h-6 px-2"
                                            >
                                              Hash
                                            </Button>
                                          </div>
                                        </div>
                                      )
                                    )}
                                  </div>
                                </div>
                              )}

                            {piiReport &&
                              (!piiReport.columns ||
                                piiReport.columns.length === 0) && (
                                <div className="p-2 bg-green-50 dark:bg-green-950 rounded-lg flex items-center gap-2 text-xs">
                                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                                  <p>PII가 탐지되지 않았습니다.</p>
                                </div>
                              )}
                          </Card>
                        );
                      })}
                    </div>

                    {files.length > 0 && (
                      <Button
                        className="w-full"
                        onClick={handleProcessPII}
                        disabled={loading}
                      >
                        {loading ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            처리 중...
                          </>
                        ) : (
                          `${files.length}개 파일 데이터셋 준비하기`
                        )}
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>데이터셋 준비 완료</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleResetDataset}
                    className="text-destructive hover:text-destructive"
                  >
                    <X className="w-4 h-4 mr-1" />
                    초기화
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-green-600 mb-4">
                  <CheckCircle2 className="w-5 h-5" />
                  <p className="text-sm">
                    {datasetInfo.length > 1
                      ? `${datasetInfo.length}개 파일이 준비되었습니다. JOIN 쿼리를 사용할 수 있습니다.`
                      : "데이터셋이 준비되었습니다."}
                  </p>
                </div>
                {datasetInfo.length > 0 && (
                  <div className="mb-4 space-y-2">
                    <p className="text-sm font-medium">업로드된 파일:</p>
                    {datasetInfo.map((info, i) => (
                      <div key={i} className="p-2 bg-muted rounded text-sm">
                        <p className="font-medium">{info.name}</p>
                      </div>
                    ))}
                  </div>
                )}
                {recommendations.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">추천 질문:</p>
                    <div className="space-y-2">
                      {recommendations.map((rec, i) => (
                        <Button
                          key={i}
                          variant="outline"
                          size="sm"
                          className="w-full text-left justify-start whitespace-normal break-words h-auto py-2 px-3"
                          onClick={() => handleSendMessage(rec)}
                        >
                          <span className="break-words">{rec}</span>
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex-1 flex flex-col">
          <Card className="flex-1 flex flex-col">
            <CardHeader>
              <CardTitle>채팅</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto overflow-x-hidden space-y-4 mb-4 max-w-full">
                {messages.length === 0 && (
                  <div className="text-center text-muted-foreground py-12">
                    <p>질문을 입력하여 SQL 쿼리를 생성하세요.</p>
                  </div>
                )}
                {messages.map((msg, i) => (
                  <div key={i}>
                    <ChatMessage {...msg} />
                    {msg.sql && (
                      <div className="mt-2 flex justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCopySQL(msg.sql!)}
                        >
                          {copiedSql === msg.sql ? (
                            <>
                              <Check className="w-4 h-4 mr-2" />
                              복사됨
                            </>
                          ) : (
                            <>
                              <Copy className="w-4 h-4 mr-2" />
                              SQL 복사
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                    {msg.data && msg.data.length > 0 && (
                      <ResultTable
                        data={msg.data}
                        columns={Object.keys(msg.data[0])}
                      />
                    )}
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center">
                        <Loader2 className="w-4 h-4 text-white animate-spin" />
                      </div>
                      <Card className="p-4 bg-purple-50 dark:bg-purple-950">
                        <p className="text-sm">생성 중...</p>
                      </Card>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
              <ChatInput
                onSend={handleSendMessage}
                disabled={!datasetId || loading || !apiKey}
                placeholder={
                  datasetId
                    ? "질문을 입력하세요..."
                    : "먼저 데이터셋을 준비하세요"
                }
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
