import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { completeWithOpenRouter } from './openrouter.js';
import { memoryFileForServer, memoryFileForUser } from './promptbuilder.js';

type ORMessage = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string; name?: string; tool_call_id?: string };

const MAX_LEN = 1200;
const WORKER_MODEL = process.env.WORKER_MODEL || 'anthropic/claude-4.5-haiku';

function ensureParent(p: string) {
  const dir = path.dirname(p);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function readMem(p: string) {
  try { return readFileSync(p, 'utf-8'); } catch { return ''; }
}

function writeMem(p: string, text: string) {
  const clipped = text.slice(0, MAX_LEN);
  ensureParent(p);
  writeFileSync(p, clipped, 'utf-8');
  return clipped;
}

/**
 * Ask a small LLM to merge/prune memory into concise markdown bullets.
 */
async function integrateMemory(existing: string, newFact: string, scopeLabel: 'user' | 'server') {
  const system = `You maintain concise ${scopeLabel} memory for a Discord AI.
- Input: A string beginning with either INSTRUCTION or MEMORY. If MEMORY, add the memory to file. If INSTRUCTION, execute it.
- Output: a revised memory in markdown bullets.
- Each line starts with an ISO date in parentheses.
- Merge duplicates. Remove stale/contradictory info. Prefer stable facts.
- Be terse. No preamble, no code fences. No headings. Only bullets.
- Stay under ${MAX_LEN} characters total.`;

  const user = `CURRENT_MEMORY:\n${existing || '(empty)'}\n\nINPUT: ${newFact.trim()}\n\nToday is ${new Date().toISOString()}.`;

  let msg = [
    { role: 'system', content: system } as ORMessage,
    { role: 'user', content: user } as ORMessage
  ];

  // Use the small model for this tool step
  const result = await completeWithOpenRouter(msg, { modelOverride: WORKER_MODEL });
  // Final safety clamp + normalization
  const cleaned = result
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
    .map(line => line.startsWith('- ') ? line : `- ${line}`)
    .join('\n');

  return cleaned.slice(0, MAX_LEN);
}

export type ToolSchema = {
  type: 'function';
  function: {
    name: 'editUserMemory' | 'editServerMemory';
    description: string;
    parameters: {
      type: 'object',
      properties: Record<string, unknown>;
      required: string[];
    };
  };
};

export const TOOL_SCHEMAS: ToolSchema[] = [
  {
    type: 'function',
    function: {
      name: 'editUserMemory',
      description: 'Store or update facts about the current user. Keep it short and helpful.',
      parameters: {
        type: 'object',
        properties: {
          userId: { type: 'string', description: 'Discord user id' },
          memory: { type: 'string', description: 'Either a MEMORY or an INSTRUCTION in string form.' }
        },
        required: ['userId', 'memory']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'editServerMemory',
      description: 'Store or update facts about the current server. Keep it short and helpful.',
      parameters: {
        type: 'object',
        properties: {
          guildId: { type: 'string', description: 'Discord guild id' },
          memory: { type: 'string', description: 'Either a MEMORY or an INSTRUCTION in string form.' }
        },
        required: ['guildId', 'memory']
      }
    }
  }
];

/**
 * Executes a tool call and returns a string result to send back to the model.
 */
export async function executeTool(name: string, args: any) {
  if (name === 'editUserMemory') {
    const { userId, memory } = args || {};
    if (!userId || !memory) return 'ERROR: missing userId or memory';
    const file = memoryFileForUser(userId);
    const existing = readMem(file);
    const merged = await integrateMemory(existing, `(${new Date().toISOString()}) ${memory}`, 'user');
    const final = writeMem(file, merged);
    return `OK: user memory updated (${final.length}/${MAX_LEN} chars).`;
  }

  if (name === 'editServerMemory') {
    const { guildId, memory } = args || {};
    if (!guildId || !memory) return 'ERROR: missing guildId or memory';
    const file = memoryFileForServer(guildId);
    const existing = readMem(file);
    const merged = await integrateMemory(existing, `(${new Date().toISOString()}) ${memory}`, 'server');
    const final = writeMem(file, merged);
    return `OK: server memory updated (${final.length}/${MAX_LEN} chars).`;
  }

  return 'ERROR: unknown tool';
}
