type ORMessage = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string; name?: string; tool_call_id?: string };

type ChatCompletionArgs = {
  model?: string;
  messages: ORMessage[];
  tools?: any[]; // OpenAI-style tools
  tool_choice?: 'auto' | 'none';
};

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

function defaultHeaders() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY missing');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    'HTTP-Referer': process.env.OPENROUTER_SITE_URL || '',
    'X-Title': process.env.OPENROUTER_APP_NAME || 'DiscordBot'
  };
}

/**
 * Low-level call (no loop).
 */
async function createCompletion(args: ChatCompletionArgs) {
  const model = args.model || process.env.REPLY_MODEL || 'openrouter/claude-4.5-sonnet';
  const body = { model, messages: args.messages, tools: args.tools, tool_choice: args.tool_choice ?? 'auto', stream: false };

  const res = await fetch(OPENROUTER_URL, { method: 'POST', headers: defaultHeaders(), body: JSON.stringify(body) });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenRouter error ${res.status}: ${text}`);
  }
  return res.json();
}

/**
 * Simple “just get me text” call (used by memoryTools’ small model too).
 */
export async function completeWithOpenRouter(messages: ORMessage[], opts?: { modelOverride?: string }) {
  const json = await createCompletion({ model: opts?.modelOverride, messages, tool_choice: 'none' });
  const content: string | undefined = json?.choices?.[0]?.message?.content;
  if (!content) throw new Error('No content returned from OpenRouter');
  return content.trim();
}

/**
 * Tool-call loop: run up to N steps until the model returns normal text.
 */
export async function chatWithTools(params: {
  messages: ORMessage[];
  tools: any[];
  maxToolRounds?: number;
}) {
  const maxRounds = params.maxToolRounds ?? 4;
  let messages = params.messages;

  for (let i = 0; i < maxRounds; i++) {
    const json = await createCompletion({ messages, tools: params.tools, tool_choice: 'auto' });
    const choice = json?.choices?.[0]?.message;
    if (!choice) throw new Error('No choice from model');
    const toolCalls = choice.tool_calls;

    if (!toolCalls || toolCalls.length === 0) {
      // normal assistant message
      return choice.content?.trim() || '(no content)';
    }

    // For each tool call, we append the tool result and continue the loop
    for (const call of toolCalls) {
      const name: string = call.function?.name;
      const argsRaw: string = call.function?.arguments ?? '{}';
      let parsed: any = {};
      try { parsed = JSON.parse(argsRaw); } catch { parsed = {}; }

      // Defer to memoryTools executor (import inside function to avoid circular)
      const { executeTool } = await import('./memorytools.js');
      const result = await executeTool(name, parsed);

      messages = [
        ...messages,
        choice, // the assistant message that requested tool(s)
        {
          role: 'tool',
          name,
          tool_call_id: call.id || undefined,
          content: result
        }
      ];
    }
  }

  // Failsafe
  return 'Tool loop limit reached without a final answer.';
}