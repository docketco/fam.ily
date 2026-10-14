import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { DollEmotion } from '@/features/doll/pose';

import type { ChatMode, HistoryTurn } from './api';

const STORAGE_KEY = 'conversation.v1';
const MAX_STORED = 200;
const HISTORY_FOR_AI = 16;

export interface Message {
  id: string;
  role: 'user' | 'doll';
  text: string;
  /** Where it was said, so the chat can mark lines from calls. */
  via: ChatMode;
  emotion?: DollEmotion;
  at: number;
}

interface ConversationValue {
  messages: Message[];
  add: (m: Omit<Message, 'id' | 'at'>) => Message;
  clear: () => Promise<void>;
  /** The most recent turns, in the shape the backend expects. */
  recentHistory: () => HistoryTurn[];
}

const ConversationContext = createContext<ConversationValue | null>(null);

export function parseStoredMessages(raw: string | null): Message[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter(
      (m): m is Message =>
        m && (m.role === 'user' || m.role === 'doll') && typeof m.text === 'string' && typeof m.id === 'string',
    );
  } catch {
    return [];
  }
}

export function toHistory(messages: Message[], limit = HISTORY_FOR_AI): HistoryTurn[] {
  return messages
    .filter((m) => m.text.trim())
    .slice(-limit)
    .map((m) => ({ role: m.role, text: m.text.slice(0, 1000) }));
}

/**
 * One running conversation shared by chat, voice calls and camera calls, kept on the phone,
 * so the doll remembers what you talked about whichever way you talk to it.
 */
export function ConversationProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => setMessages(parseStoredMessages(raw)))
      .catch(() => setMessages([]));
  }, []);

  const add = useCallback((m: Omit<Message, 'id' | 'at'>) => {
    const message: Message = { ...m, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, at: Date.now() };
    setMessages((prev) => {
      const next = [...prev, message].slice(-MAX_STORED);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
    return message;
  }, []);

  const clear = useCallback(async () => {
    setMessages([]);
    await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  }, []);

  const recentHistory = useCallback(() => toHistory(messages), [messages]);

  const value = useMemo(() => ({ messages, add, clear, recentHistory }), [messages, add, clear, recentHistory]);
  return <ConversationContext.Provider value={value}>{children}</ConversationContext.Provider>;
}

export function useConversation(): ConversationValue {
  const ctx = useContext(ConversationContext);
  if (!ctx) throw new Error('useConversation must be used inside <ConversationProvider>');
  return ctx;
}
