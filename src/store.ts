import Keyv from 'keyv';
import KeyvSqlite from '@keyv/sqlite';
import { readFileSync } from "node:fs";

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type ChatHistory = ChatMessage[];

const sqlitePath = process.env.SQLITE_PATH || './data.sqlite';
const sqlite = new KeyvSqlite(sqlitePath);

export const kv = new Keyv<ChatHistory>({ store: sqlite, namespace: 'user-chats' });

// helper to load, trim, and save history per user
const MAX_MESSAGES = 22;
const MAX_TOTAL_CHARS = 11500;

export async function getHistory(userId: string): Promise<ChatHistory> {
  const baseSystem: ChatMessage = {
    role: 'system',
    content: readFileSync('./config/sysmsg.md', 'utf-8')
  };

  const hist = (await kv.get(userId)) ?? [baseSystem];

  let total = hist.reduce((n, m) => n + m.content.length, 0);
  let trimmed = [...hist];
  while ((trimmed.length > MAX_MESSAGES || total > MAX_TOTAL_CHARS) && trimmed.length > 1) {
    // never drop the first system prompt!!
    trimmed.splice(1, 1);
    total = trimmed.reduce((n, m) => n + m.content.length, 0);
  }
  if (trimmed !== hist) await kv.set(userId, trimmed);
  return trimmed;
}

export async function appendToHistory(userId: string, msgs: ChatMessage[]) {
  const hist = await getHistory(userId);
  const next = [...hist, ...msgs];
  await kv.set(userId, next);
}