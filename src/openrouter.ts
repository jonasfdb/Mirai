type ORMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export async function completeWithOpenRouter(messages: ORMessage[]): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY missing');

  const model = process.env.OPENROUTER_MODEL || 'openrouter/auto';

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      // Optional but recommended headers for routing & analytics
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL || '',
      'X-Title': process.env.OPENROUTER_APP_NAME || 'DiscordBot'
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false, // keep it simple; Discord edit handles the UX
      // You can add max_tokens, temperature, etc. here.
    })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenRouter error ${res.status}: ${text}`);
  }

  const json = await res.json();
  const content: string | undefined = json?.choices?.[0]?.message?.content;

  if (!content) throw new Error('No content returned from OpenRouter');
  return content.trim();
}