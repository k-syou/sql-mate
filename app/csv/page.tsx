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
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any[]>([]);
  const [piiReport, setPiiReport] = useState<any>(null);
  const [piiActions, setPiiActions] = useState<
    Record<string, "drop" | "mask" | "hash" | "none">
  >({});
  const [datasetId, setDatasetId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState("openai");
  const [model, setModel] = useState("gpt-4o-mini");
  const [apiKey, setApiKey] = useState("");
  const [baseURL, setBaseURL] = useState("");
  const [recommendations, setRecommendations] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "text/csv": [".csv"] },
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        handleFileUpload(acceptedFiles[0]);
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

  const handleFileUpload = async (uploadedFile: File) => {
    setFile(uploadedFile);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", uploadedFile);

      const res = await fetch("/api/upload/csv", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "파일 업로드 실패");
      }

      setPreview(data.preview);
      setPiiReport(data.piiReport);

      // 각 컬럼별 기본 액션 설정 (suggestedAction 사용)
      const initialActions: Record<string, "drop" | "mask" | "hash" | "none"> =
        {};
      if (data.piiReport && data.piiReport.columns) {
        data.piiReport.columns.forEach((col: any) => {
          initialActions[col.name] = col.suggestedAction || "drop";
        });
      }
      setPiiActions(initialActions);

      toast({
        title: "파일 업로드 완료",
        description: `${data.totalRows}개 행이 감지되었습니다.`,
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

  const handleRemoveFile = () => {
    setFile(null);
    setPreview([]);
    setPiiReport(null);
    setPiiActions({});
    setDatasetId(null);
    setMessages([]);
    setRecommendations([]);
  };

  const handleLoadSample = async () => {
    try {
      setLoading(true);
      // 샘플 CSV 파일 가져오기
      const response = await fetch(
        "/samples/sqlmate_sample_orders_with_pii.csv"
      );
      if (!response.ok) {
        throw new Error("샘플 파일을 불러올 수 없습니다.");
      }
      const csvText = await response.text();

      // File 객체 생성
      const blob = new Blob([csvText], { type: "text/csv" });
      const sampleFile = new File(
        [blob],
        "sqlmate_sample_orders_with_pii.csv",
        { type: "text/csv" }
      );

      // 파일 업로드 처리
      await handleFileUpload(sampleFile);

      toast({
        title: "샘플 데이터 로드 완료",
        description: "샘플 CSV 파일이 로드되었습니다.",
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
      setFile(null);
      setPreview([]);
      setPiiReport(null);
      setPiiActions({});
      setDatasetId(null);
      setMessages([]);
      setRecommendations([]);
      toast({
        title: "초기화 완료",
        description: "데이터셋이 초기화되었습니다.",
      });
    }
  };

  const handleProcessPII = async () => {
    if (!file || !piiReport) return;

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", file.name);
      formData.append("piiActions", JSON.stringify(piiActions));
      formData.append("piiReport", JSON.stringify(piiReport));

      const res = await fetch("/api/upload/csv/process", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "처리 실패");
      }

      setDatasetId(data.datasetId);

      // 추천 질문 가져오기
      const recRes = await fetch("/api/query/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datasetId: data.datasetId }),
      });
      const recData = await recRes.json();
      if (recData.recommendations) {
        setRecommendations(recData.recommendations);
      }

      toast({
        title: "처리 완료",
        description: "데이터셋이 준비되었습니다. 이제 질문을 할 수 있습니다.",
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
    if (!datasetId || !apiKey) {
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
          datasetId,
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
          datasetId,
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
              datasetId,
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
                datasetId,
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
                      : "CSV 파일을 드래그하거나 클릭하여 업로드"}
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

                {preview.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">업로드된 파일</h3>
                        <span className="text-sm text-muted-foreground">
                          ({file?.name})
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleRemoveFile}
                        className="text-destructive hover:text-destructive"
                      >
                        <X className="w-4 h-4 mr-1" />
                        제거
                      </Button>
                    </div>
                    <div>
                      <h3 className="font-semibold mb-2">미리보기 (20행)</h3>
                      <div className="border rounded-lg overflow-auto max-h-[200px]">
                        <table className="w-full text-xs">
                          <thead className="bg-muted">
                            <tr>
                              {Object.keys(preview[0] || {}).map((key) => (
                                <th key={key} className="p-2 text-left">
                                  {key}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {preview.slice(0, 5).map((row, i) => (
                              <tr key={i} className="border-t">
                                {Object.values(row).map((val: any, j) => (
                                  <td key={j} className="p-2">
                                    {String(val).slice(0, 50)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {piiReport && piiReport.columns.length > 0 && (
                      <div>
                        <h3 className="font-semibold mb-2 flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-600" />
                          PII 탐지 결과
                        </h3>
                        <div className="space-y-3 text-sm">
                          {piiReport.columns.map((col: any, i: number) => (
                            <div
                              key={i}
                              className="p-3 bg-amber-50 dark:bg-amber-950 rounded border"
                            >
                              <div className="flex items-start justify-between mb-2">
                                <div className="flex-1">
                                  <p className="font-medium">{col.name}</p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {col.reason}
                                  </p>
                                </div>
                              </div>
                              <div className="mt-2">
                                <p className="text-xs font-medium mb-1">
                                  처리 방식:
                                </p>
                                <div className="flex gap-1 flex-wrap">
                                  <Button
                                    size="sm"
                                    variant={
                                      piiActions[col.name] === "none"
                                        ? "default"
                                        : "outline"
                                    }
                                    onClick={() =>
                                      setPiiActions({
                                        ...piiActions,
                                        [col.name]: "none",
                                      })
                                    }
                                    className="text-xs h-7"
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
                                      setPiiActions({
                                        ...piiActions,
                                        [col.name]: "drop",
                                      })
                                    }
                                    className="text-xs h-7"
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
                                      setPiiActions({
                                        ...piiActions,
                                        [col.name]: "mask",
                                      })
                                    }
                                    className="text-xs h-7"
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
                                      setPiiActions({
                                        ...piiActions,
                                        [col.name]: "hash",
                                      })
                                    }
                                    className="text-xs h-7"
                                  >
                                    Hash
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {piiReport && piiReport.columns.length === 0 && (
                      <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                        <p className="text-sm">PII가 탐지되지 않았습니다.</p>
                      </div>
                    )}

                    {piiReport && (
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
                          "데이터셋 준비하기"
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
                  <p className="text-sm">데이터셋이 준비되었습니다.</p>
                </div>
                {file && (
                  <div className="mb-4 p-2 bg-muted rounded text-sm">
                    <p className="text-muted-foreground">업로드된 파일:</p>
                    <p className="font-medium">{file.name}</p>
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
                          className="w-full text-left justify-start"
                          onClick={() => handleSendMessage(rec)}
                        >
                          {rec}
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
