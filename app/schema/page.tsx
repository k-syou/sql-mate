'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ChatMessage } from '@/components/chat-message';
import { ChatInput } from '@/components/chat-input';
import { ModelSelector } from '@/components/model-selector';
import { useToast } from '@/components/ui/use-toast';
import { Upload, ArrowLeft, CheckCircle2, Loader2, Copy, Check, X } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import type { SchemaData } from '@/lib/schemaPrompt';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sql?: string;
  explanation?: string;
  warnings?: string[];
}

export default function SchemaTrackPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [schema, setSchema] = useState<SchemaData | null>(null);
  const [schemaId, setSchemaId] = useState<string | null>(null);
  const [schemaFileName, setSchemaFileName] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<string[]>([]);
  const [provider, setProvider] = useState('openai');
  const [model, setModel] = useState('gpt-4o-mini');
  const [apiKey, setApiKey] = useState('');
  const [baseURL, setBaseURL] = useState('');
  const [copiedSql, setCopiedSql] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'application/json': ['.json'] },
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        handleFileUpload(acceptedFiles[0]);
      }
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const storedKey = localStorage.getItem('llm_api_key');
    const storedProvider = localStorage.getItem('llm_provider');
    const storedModel = localStorage.getItem('llm_model');
    if (storedKey) setApiKey(storedKey);
    if (storedProvider) setProvider(storedProvider);
    if (storedModel) setModel(storedModel);
  }, []);

  const handleFileUpload = async (file: File) => {
    setLoading(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (!parsed.tables || !Array.isArray(parsed.tables)) {
        throw new Error('유효한 스키마 JSON이 아닙니다. "tables" 배열이 필요합니다.');
      }

      setSchema(parsed);

      // 서버에 업로드
      const res = await fetch('/api/upload/schema', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schema: parsed, name: file.name }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '스키마 업로드 실패');
      }

      setSchemaId(data.schemaId);
      setSchemaFileName(file.name);

      // 추천 질문 가져오기 (API 키가 있으면)
      if (apiKey) {
        try {
          const recRes = await fetch('/api/query/recommendations/schema', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              schemaId: data.schemaId,
              provider,
              model,
              apiKey,
              baseURL: baseURL || undefined,
            }),
          });
          const recData = await recRes.json();
          if (recData.recommendations) {
            setRecommendations(recData.recommendations);
          }
        } catch (recError) {
          // 추천 질문 생성 실패는 무시 (선택적 기능)
          console.warn('추천 질문 생성 실패:', recError);
        }
      }

      toast({
        title: '스키마 업로드 완료',
        description: `${data.tables.length}개의 테이블이 로드되었습니다.`,
      });
    } catch (error: any) {
      toast({
        title: '오류',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLoadSample = async () => {
    try {
      setLoading(true);
      // 샘플 스키마 JSON 파일 가져오기
      const response = await fetch('/samples/sqlmate_sample_schema.json');
      if (!response.ok) {
        throw new Error('샘플 파일을 불러올 수 없습니다.');
      }
      const jsonText = await response.text();
      const parsed = JSON.parse(jsonText);
      
      // File 객체 생성
      const sampleFileName = 'sqlmate_sample_schema.json';
      const blob = new Blob([jsonText], { type: 'application/json' });
      const sampleFile = new File([blob], sampleFileName, { type: 'application/json' });
      
      // 파일 업로드 처리
      await handleFileUpload(sampleFile);
      
      toast({
        title: '샘플 데이터 로드 완료',
        description: '샘플 스키마 JSON 파일이 로드되었습니다.',
      });
    } catch (error: any) {
      toast({
        title: '오류',
        description: error.message || '샘플 파일 로드 실패',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (question: string) => {
    if (!schemaId || !apiKey) {
      toast({
        title: '오류',
        description: '스키마가 업로드되지 않았거나 API 키가 설정되지 않았습니다.',
        variant: 'destructive',
      });
      return;
    }

    setMessages((prev) => [...prev, { role: 'user', content: question }]);
    setLoading(true);

    // API 키 저장
    localStorage.setItem('llm_api_key', apiKey);
    localStorage.setItem('llm_provider', provider);
    localStorage.setItem('llm_model', model);

    try {
      const res = await fetch('/api/query/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          schemaId,
          provider,
          model,
          apiKey,
          baseURL: baseURL || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'SQL 생성 실패');
      }

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'SQL 쿼리를 생성했습니다.',
          sql: data.sql,
          explanation: data.explanation,
          warnings: data.warnings,
        },
      ]);
    } catch (error: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `오류가 발생했습니다: ${error.message}`,
        },
      ]);
      toast({
        title: '오류',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopySQL = (sql: string) => {
    navigator.clipboard.writeText(sql);
    setCopiedSql(sql);
    toast({
      title: '복사됨',
      description: 'SQL이 클립보드에 복사되었습니다.',
    });
    setTimeout(() => setCopiedSql(null), 2000);
  };

  const handleRemoveSchema = () => {
    setSchema(null);
    setSchemaId(null);
    setSchemaFileName(null);
    setMessages([]);
    setRecommendations([]);
    toast({
      title: '스키마 제거됨',
      description: '업로드된 스키마가 제거되었습니다.',
    });
  };

  const renderSchemaTree = () => {
    if (!schema) return null;

    return (
      <div className="space-y-4">
        {schema.tables.map((table, i) => (
          <div key={i} className="border rounded-lg p-4">
            <div className="font-semibold mb-2 flex items-center gap-2">
              <span className="text-primary">📊</span>
              {table.name}
              {table.primaryKey && table.primaryKey.length > 0 && (
                <span className="text-xs bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded">
                  PK: {table.primaryKey.join(', ')}
                </span>
              )}
            </div>
            <div className="ml-4 space-y-1">
              {table.columns.map((col, j) => (
                <div key={j} className="text-sm text-muted-foreground">
                  • {col.name} <span className="text-xs">({col.type})</span>
                  {col.nullable === false && (
                    <span className="text-xs text-red-600 ml-1">NOT NULL</span>
                  )}
                </div>
              ))}
              {table.foreignKeys && table.foreignKeys.length > 0 && (
                <div className="mt-2 pt-2 border-t">
                  <p className="text-xs font-medium mb-1">외래키:</p>
                  {table.foreignKeys.map((fk, k) => (
                    <div key={k} className="text-xs text-muted-foreground">
                      {fk.column} → {fk.references.table}.{fk.references.column}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.push('/')}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-2xl font-bold">스키마 트랙</h1>
          </div>
          <div className="flex items-center gap-4">
            <Input
              type="password"
              placeholder="LLM API Key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className={`w-[200px] ${!apiKey ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
            />
            {provider === 'custom' && (
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
          {!schemaId ? (
            <Card>
              <CardHeader>
                <CardTitle>스키마 JSON 업로드</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div
                  {...getRootProps()}
                  className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                    isDragActive ? 'border-primary bg-primary/5' : 'border-muted'
                  }`}
                >
                  <input {...getInputProps()} />
                  <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {isDragActive ? '파일을 놓으세요' : '스키마 JSON 파일을 드래그하거나 클릭하여 업로드'}
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

                <div className="text-xs text-muted-foreground space-y-2">
                  <p className="font-semibold">스키마 JSON 형식:</p>
                  <pre className="bg-muted p-3 rounded overflow-x-auto">
{`{
  "tables": [
    {
      "name": "users",
      "columns": [
        {
          "name": "id",
          "type": "INTEGER",
          "nullable": false
        },
        {
          "name": "email",
          "type": "TEXT"
        }
      ],
      "primaryKey": ["id"],
      "foreignKeys": [
        {
          "column": "user_id",
          "references": {
            "table": "orders",
            "column": "id"
          }
        }
      ]
    }
  ]
}`}
                  </pre>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>스키마 구조</CardTitle>
                  {schemaFileName && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">{schemaFileName}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleRemoveSchema}
                        className="h-8 w-8"
                        title="스키마 제거"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-green-600 mb-4">
                  <CheckCircle2 className="w-5 h-5" />
                  <p className="text-sm">스키마가 로드되었습니다.</p>
                </div>
                <div className="max-h-[400px] overflow-y-auto mb-4">
                  {renderSchemaTree()}
                </div>
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
                {recommendations.length === 0 && apiKey && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={async () => {
                      if (!schemaId || !apiKey) return;
                      setLoading(true);
                      try {
                        const recRes = await fetch('/api/query/recommendations/schema', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            schemaId,
                            provider,
                            model,
                            apiKey,
                            baseURL: baseURL || undefined,
                          }),
                        });
                        const recData = await recRes.json();
                        if (recData.recommendations) {
                          setRecommendations(recData.recommendations);
                        }
                      } catch (error: any) {
                        toast({
                          title: '오류',
                          description: '추천 질문 생성에 실패했습니다.',
                          variant: 'destructive',
                        });
                      } finally {
                        setLoading(false);
                      }
                    }}
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        생성 중...
                      </>
                    ) : (
                      '추천 질문 생성하기'
                    )}
                  </Button>
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
                disabled={!schemaId || loading || !apiKey}
                placeholder={schemaId ? '질문을 입력하세요...' : '먼저 스키마를 업로드하세요'}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

