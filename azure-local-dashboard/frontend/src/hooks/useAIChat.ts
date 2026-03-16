import { useState, useCallback, useRef, useEffect } from 'react';
import type { ChatMessage, ToolCall, SSEEvent } from '../types';

// BUG-036: Use crypto.randomUUID for collision-free conversation IDs
function generateConversationId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `conv-${crypto.randomUUID()}`;
  }
  return `conv-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// Batching interval for text deltas (ms) — reduces React re-renders during streaming
const TEXT_FLUSH_INTERVAL = 50;

export function useAIChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [pendingToolCalls, setPendingToolCalls] = useState<ToolCall[]>([]);
  const [conversationId] = useState(generateConversationId);
  const abortRef = useRef<AbortController | null>(null);

  // Text batching: accumulate deltas in a ref, flush to state on interval
  const pendingTextRef = useRef('');
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const flushPendingText = useCallback(() => {
    if (!pendingTextRef.current) return;
    const chunk = pendingTextRef.current;
    pendingTextRef.current = '';
    setMessages(prev => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last?.role === 'assistant') {
        last.content += chunk;
      }
      return [...updated];
    });
  }, []);

  const startTextBatching = useCallback(() => {
    if (flushTimerRef.current) return;
    flushTimerRef.current = setInterval(flushPendingText, TEXT_FLUSH_INTERVAL);
  }, [flushPendingText]);

  const stopTextBatching = useCallback(() => {
    if (flushTimerRef.current) {
      clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    // Final flush to ensure no text is lost
    flushPendingText();
  }, [flushPendingText]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (flushTimerRef.current) clearInterval(flushTimerRef.current);
    };
  }, []);

  const sendMessage = useCallback(async (message: string) => {
    const userMsg: ChatMessage = { role: 'user', content: message, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setIsStreaming(true);
    setStreamError(null);

    const assistantMsg: ChatMessage = { role: 'assistant', content: '', timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, assistantMsg]);

    startTextBatching();

    // BUG-027: Track consecutive SSE parse failures
    let parseFailures = 0;

    try {
      abortRef.current = new AbortController();
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ conversation_id: conversationId, message }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event: SSEEvent = JSON.parse(line.slice(6));
              parseFailures = 0;
              handleSSEEvent(event);
            } catch (e) {
              parseFailures++;
              console.warn(`SSE parse failure #${parseFailures}:`, line.slice(0, 100), e);
              if (parseFailures >= 5) {
                throw new Error('Too many malformed events from server');
              }
            }
          }
        }
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        const errMsg = (error as Error).message;
        // BUG-026: Set error state for retry UI
        setStreamError(errMsg);
        stopTextBatching();
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last.role === 'assistant') {
            if (!last.content.trim()) {
              // BUG-028: Remove orphaned empty assistant message
              return updated.slice(0, -1);
            }
            last.content += `\n\n**Error:** ${errMsg}`;
          }
          return updated;
        });
      }
    } finally {
      stopTextBatching();
      setIsStreaming(false);
    }
  }, [conversationId, startTextBatching, stopTextBatching]);

  // BUG-026: Retry last failed message
  const retryLastMessage = useCallback(() => {
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (lastUserMsg) {
      // Remove all messages after the last user message
      setMessages(prev => {
        const idx = prev.lastIndexOf(lastUserMsg);
        return prev.slice(0, idx);
      });
      setStreamError(null);
      sendMessage(lastUserMsg.content);
    }
  }, [messages, sendMessage]);

  const handleSSEEvent = useCallback((event: SSEEvent) => {
    switch (event.type) {
      case 'text_delta':
        // Batch text into ref — flushed to state on interval
        pendingTextRef.current += event.content || '';
        break;

      case 'tool_use':
        if (event.tool_call) {
          const tc: ToolCall = { ...event.tool_call, status: 'pending' };
          setPendingToolCalls(prev => [...prev, tc]);
          setMessages(prev => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last.role === 'assistant') {
              last.toolCalls = [...(last.toolCalls || []), tc];
            }
            return [...updated];
          });
        }
        break;

      case 'tool_result':
        // Result from tool execution - appended to conversation
        break;

      case 'error':
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last.role === 'assistant') {
            last.content += `\n\n**Error:** ${event.message}`;
          }
          return [...updated];
        });
        break;
    }
  }, []);

  const executeToolCall = useCallback(async (toolCall: ToolCall) => {
    setPendingToolCalls(prev => prev.map(tc =>
      tc.id === toolCall.id ? { ...tc, status: 'executing' as const } : tc
    ));

    setIsStreaming(true);

    // Add a new assistant message for the follow-up response
    setMessages(prev => [...prev, { role: 'assistant', content: '', timestamp: new Date().toISOString() }]);

    startTextBatching();
    let parseFailures = 0;

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/ai/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          conversation_id: conversationId,
          tool_call_id: toolCall.id,
          tool_name: toolCall.name,
          tool_input: toolCall.input,
        }),
      });

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event: SSEEvent = JSON.parse(line.slice(6));
              parseFailures = 0;

              if (event.type === 'tool_result') {
                // Store command output in toolResults (rendered as collapsible in ChatMessage)
                setMessages(prev => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last.role === 'assistant') {
                    last.toolResults = [...(last.toolResults || []), {
                      toolCallId: toolCall.id,
                      content: event.content || '',
                      success: event.success ?? true,
                    }];
                  }
                  return [...updated];
                });
              } else {
                handleSSEEvent(event);
              }
            } catch (e) {
              parseFailures++;
              console.warn(`SSE parse failure #${parseFailures}:`, line.slice(0, 100), e);
            }
          }
        }
      }

      setPendingToolCalls(prev => prev.map(tc =>
        tc.id === toolCall.id ? { ...tc, status: 'completed' as const } : tc
      ));
    } catch (error) {
      // BUG-028: Clean up orphaned assistant message on failure
      stopTextBatching();
      setMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last.role === 'assistant' && !last.content.trim()) {
          return updated.slice(0, -1);
        }
        return updated;
      });
      setPendingToolCalls(prev => prev.map(tc =>
        tc.id === toolCall.id ? { ...tc, status: 'pending' as const } : tc
      ));
    } finally {
      stopTextBatching();
      setIsStreaming(false);
    }
  }, [conversationId, handleSSEEvent, startTextBatching, stopTextBatching]);

  const rejectToolCall = useCallback((toolCallId: string) => {
    setPendingToolCalls(prev => prev.map(tc =>
      tc.id === toolCallId ? { ...tc, status: 'rejected' as const } : tc
    ));
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setPendingToolCalls([]);
    setStreamError(null);
  }, []);

  return {
    messages,
    isStreaming,
    streamError,
    pendingToolCalls,
    conversationId,
    sendMessage,
    executeToolCall,
    rejectToolCall,
    retryLastMessage,
    clearMessages,
  };
}
