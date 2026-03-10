import { useState, useCallback, useRef } from 'react';
import type { ChatMessage, ToolCall, SSEEvent } from '../types';

export function useAIChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [pendingToolCalls, setPendingToolCalls] = useState<ToolCall[]>([]);
  const [conversationId] = useState(() => `conv-${Date.now()}`);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (message: string) => {
    const userMsg: ChatMessage = { role: 'user', content: message, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setIsStreaming(true);

    const assistantMsg: ChatMessage = { role: 'assistant', content: '', timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, assistantMsg]);

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
              handleSSEEvent(event);
            } catch {
              // Skip malformed events
            }
          }
        }
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last.role === 'assistant') {
            last.content += `\n\n**Error:** ${(error as Error).message}`;
          }
          return updated;
        });
      }
    } finally {
      setIsStreaming(false);
    }
  }, [conversationId]);

  const handleSSEEvent = useCallback((event: SSEEvent) => {
    switch (event.type) {
      case 'text_delta':
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last.role === 'assistant') {
            last.content += event.content || '';
          }
          return [...updated];
        });
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

              if (event.type === 'tool_result') {
                // Show the command output
                setMessages(prev => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last.role === 'assistant') {
                    last.content += `**Command Output:**\n\`\`\`\n${event.content}\n\`\`\`\n\n`;
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
            } catch {
              // Skip malformed events
            }
          }
        }
      }

      setPendingToolCalls(prev => prev.map(tc =>
        tc.id === toolCall.id ? { ...tc, status: 'completed' as const } : tc
      ));
    } catch (error) {
      setPendingToolCalls(prev => prev.map(tc =>
        tc.id === toolCall.id ? { ...tc, status: 'pending' as const } : tc
      ));
    } finally {
      setIsStreaming(false);
    }
  }, [conversationId, handleSSEEvent]);

  const rejectToolCall = useCallback((toolCallId: string) => {
    setPendingToolCalls(prev => prev.map(tc =>
      tc.id === toolCallId ? { ...tc, status: 'rejected' as const } : tc
    ));
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setPendingToolCalls([]);
  }, []);

  return {
    messages,
    isStreaming,
    pendingToolCalls,
    conversationId,
    sendMessage,
    executeToolCall,
    rejectToolCall,
    clearMessages,
  };
}
