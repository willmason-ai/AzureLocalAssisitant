import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { User, Bot, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import type { ChatMessage as ChatMessageType, ToolCall } from '../../types';
import CommandBlock from './CommandBlock';

interface ChatMessageProps {
  message: ChatMessageType;
  onExecuteToolCall?: (toolCall: ToolCall) => void;
  onRejectToolCall?: (toolCallId: string) => void;
}

export default function ChatMessage({ message, onExecuteToolCall, onRejectToolCall }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
        isUser ? 'bg-blue-600' : 'bg-slate-700'
      }`}>
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>

      <div className={`flex-1 max-w-[80%] ${isUser ? 'text-right' : ''}`}>
        <div className={`inline-block text-left rounded-lg p-3 text-sm ${
          isUser ? 'bg-blue-600/20 border border-blue-500/30' : 'bg-slate-800 border border-slate-700'
        }`}>
          {isUser ? (
            <p className="text-slate-200 whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="prose prose-invert prose-sm max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || '');
                    const codeStr = String(children).replace(/\n$/, '');

                    if (match) {
                      return (
                        <CodeBlockWithCopy language={match[1]} code={codeStr} />
                      );
                    }
                    return (
                      <code className="bg-slate-900 px-1 py-0.5 rounded text-xs" {...props}>
                        {children}
                      </code>
                    );
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {message.toolCalls?.map((tc) => (
          <CommandBlock
            key={tc.id}
            toolCall={tc}
            onExecute={() => onExecuteToolCall?.(tc)}
            onReject={() => onRejectToolCall?.(tc.id)}
          />
        ))}
      </div>
    </div>
  );
}

function CodeBlockWithCopy({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group">
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1 bg-slate-700 rounded opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 text-slate-400" />}
      </button>
      <SyntaxHighlighter
        style={oneDark}
        language={language}
        customStyle={{ margin: 0, borderRadius: '0.375rem', fontSize: '0.75rem' }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
