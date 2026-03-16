import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { User, Bot, Copy, Check, ChevronDown, ChevronRight, Terminal } from 'lucide-react';
import { useState, memo } from 'react';
import type { ChatMessage as ChatMessageType, ToolCall } from '../../types';
import CommandBlock from './CommandBlock';

interface ChatMessageProps {
  message: ChatMessageType;
  isLastAndStreaming?: boolean;
  onExecuteToolCall?: (toolCall: ToolCall) => void;
  onRejectToolCall?: (toolCallId: string) => void;
}

export default function ChatMessage({ message, isLastAndStreaming, onExecuteToolCall, onRejectToolCall }: ChatMessageProps) {
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
          ) : isLastAndStreaming ? (
            // While streaming: render plain text (fast, no markdown overhead)
            <div className="prose prose-invert prose-sm max-w-none">
              <p className="text-slate-200 whitespace-pre-wrap">{message.content}<span className="inline-block w-1.5 h-4 bg-blue-400 animate-pulse ml-0.5 align-text-bottom" /></p>
            </div>
          ) : (
            // After streaming: render full markdown with syntax highlighting
            <RenderedMarkdown content={message.content} />
          )}

          {/* Collapsible command output sections */}
          {message.toolResults && message.toolResults.length > 0 && (
            <div className="mt-2 space-y-2">
              {message.toolResults.map((tr, i) => (
                <CollapsibleOutput key={tr.toolCallId || i} content={tr.content} success={tr.success} />
              ))}
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

// Memoized markdown renderer — only re-renders when content actually changes
const RenderedMarkdown = memo(function RenderedMarkdown({ content }: { content: string }) {
  return (
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
        {content}
      </ReactMarkdown>
    </div>
  );
});

function CollapsibleOutput({ content, success }: { content: string; success: boolean }) {
  const [expanded, setExpanded] = useState(false);

  // Count lines for the summary
  const lines = content.split('\n');
  const lineCount = lines.length;
  const isJson = content.trim().startsWith('{') || content.trim().startsWith('[');

  return (
    <div className={`rounded border ${success ? 'border-slate-600/50 bg-slate-900/50' : 'border-red-600/50 bg-red-900/20'}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-2.5 py-1.5 flex items-center gap-2 hover:bg-slate-700/30 transition-colors rounded"
      >
        {expanded
          ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          : <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        }
        <Terminal className="w-3.5 h-3.5 text-slate-500 shrink-0" />
        <span className="text-[11px] text-slate-400 flex-1 text-left">
          {success ? 'Command Output' : 'Error Output'}
          <span className="text-slate-600 ml-1.5">
            ({lineCount} line{lineCount !== 1 ? 's' : ''}{isJson ? ', JSON' : ''})
          </span>
        </span>
      </button>
      {expanded && (
        <div className="px-1 pb-1">
          <CodeBlockWithCopy language={isJson ? 'json' : 'text'} code={content} />
        </div>
      )}
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
