import { useState, useRef, useEffect } from 'react';
import { Send, Trash2, Loader2, RefreshCw } from 'lucide-react';
import { useAIChat } from '../../hooks/useAIChat';
import ChatMessage from './ChatMessage';

export default function ChatInterface() {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // BUG-038: Track message count to only scroll on new messages
  const prevMessageCount = useRef(0);

  const {
    messages,
    isStreaming,
    streamError,
    sendMessage,
    executeToolCall,
    rejectToolCall,
    retryLastMessage,
    clearMessages,
  } = useAIChat();

  useEffect(() => {
    // BUG-038: Only scroll when new messages are added
    if (messages.length > prevMessageCount.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMessageCount.current = messages.length;
  }, [messages.length]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    sendMessage(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    // BUG-037: Use flex-grow with min-h-0 for flexible height
    <div className="flex flex-col flex-grow min-h-0" style={{ height: 'calc(100vh - 8rem)' }}>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-lg font-medium text-slate-400">Azure Local AI Assistant</p>
              <p className="text-sm text-slate-500 mt-2 max-w-md">
                Ask me about your cluster health, troubleshoot updates, check credentials,
                or investigate issues. I can run PowerShell commands on your cluster nodes
                with your approval.
              </p>
              <div className="flex flex-wrap gap-2 mt-4 justify-center">
                {[
                  'What is the current cluster health?',
                  'Check if any updates are available',
                  'Are my credentials about to expire?',
                  'Show me the running VMs',
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => sendMessage(suggestion)}
                    className="px-3 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-full text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <ChatMessage
            key={i}
            message={msg}
            onExecuteToolCall={executeToolCall}
            onRejectToolCall={rejectToolCall}
          />
        ))}

        {/* BUG-026: Show retry button on stream error */}
        {streamError && !isStreaming && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <span className="text-sm text-red-400 flex-1">Connection error: {streamError}</span>
            <button
              onClick={retryLastMessage}
              className="flex items-center gap-1 px-3 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              Retry
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-slate-700 p-4 bg-slate-900/50">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your Azure Local cluster..."
              rows={1}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
              disabled={isStreaming}
            />
          </div>
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg transition-colors"
          >
            {isStreaming ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={clearMessages}
              className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg transition-colors"
              title="Clear conversation"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
