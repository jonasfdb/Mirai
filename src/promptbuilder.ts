import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const MEM_ROOT = process.env.MEMORIES_DIR || './memories';
const CORE_PATH = path.join('prompts', 'core', 'sysmsg.md'); // your chosen location
const USERS_DIR = path.join(MEM_ROOT, 'users');
const SERVERS_DIR = path.join(MEM_ROOT, 'servers');

function ensureDirs() {
  [MEM_ROOT, USERS_DIR, SERVERS_DIR].forEach(p => {
    if (!existsSync(p)) mkdirSync(p, { recursive: true });
  });
}

export function memoryFileForUser(userId: string) {
  ensureDirs();
  return path.join(USERS_DIR, `${userId}.md`);
}

export function memoryFileForServer(guildId: string) {
  ensureDirs();
  return path.join(SERVERS_DIR, `${guildId}.md`);
}

function safeRead(p: string, fallback = '') {
  try { return readFileSync(p, 'utf-8'); } catch { return fallback; }
}

// assembles system message from core, guilds and users to simulate long term memory
export function buildSystemPrompt(opts: { userId: string; guildId?: string | null }) {
  const core = safeRead(CORE_PATH, '# Core missing\n');
  const userMem = safeRead(memoryFileForUser(opts.userId), '');
  const serverMem = opts.guildId ? safeRead(memoryFileForServer(opts.guildId), '') : '';

  // user/server selections get headers so the model knows how to reference them
  const combined = [
    core.trim(),
    '',
    '---',
    '### [User memory]',
    userMem.trim() || '_No stored user memories yet._',
    '',
    '### [Server memory]',
    (serverMem || '').trim() || '_No stored server memories yet._'
  ].join('\n');

  return combined;
}
