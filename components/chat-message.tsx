'use client';

import { Card } from '@/components/ui/card';
import { User, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  sql?: string;
  explanation?: string;
  warnings?: string[];
}

export function ChatMessage({ role, content, sql, explanation, warnings }: ChatMessageProps) {
  const isUser = role === 'user';

  return (
    <div className={cn('flex gap-4 w-full', isUser ? 'justify-end' : 'justify-start')}>
      <div className={cn('flex gap-3 max-w-[80%] min-w-0', isUser && 'flex-row-reverse')}>
        <div className={cn(
          'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
          isUser ? 'bg-blue-600 text-white' : 'bg-purple-600 text-white'
        )}>
          {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
        </div>
        <Card className={cn('p-4 min-w-0 max-w-full overflow-hidden', isUser ? 'bg-blue-50 dark:bg-blue-950' : 'bg-purple-50 dark:bg-purple-950')}>
          <div className="space-y-2 min-w-0">
            <p className="text-sm whitespace-pre-wrap break-words">{content}</p>
            {sql && (
              <div className="mt-3 pt-3 border-t min-w-0">
                <p className="text-xs font-semibold mb-1">생성된 SQL:</p>
                <pre className="text-xs bg-background p-2 rounded overflow-x-auto max-w-full">
                  <code className="break-all whitespace-pre-wrap">{sql}</code>
                </pre>
              </div>
            )}
            {explanation && (
              <div className="mt-2 text-xs text-muted-foreground min-w-0">
                <p className="font-semibold mb-1">설명:</p>
                <p className="break-words">{explanation}</p>
              </div>
            )}
            {warnings && warnings.length > 0 && (
              <div className="mt-2 text-xs text-amber-600 dark:text-amber-400 min-w-0">
                <p className="font-semibold mb-1">경고:</p>
                <ul className="list-disc list-inside">
                  {warnings.map((w, i) => (
                    <li key={i} className="break-words">{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

