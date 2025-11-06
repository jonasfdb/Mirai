import 'dotenv/config';
import { Client, GatewayIntentBits, Events, Partials, Message } from 'discord.js';
import { appendToHistory, getHistory } from './store.js';
import { chatWithTools } from './openrouter.js';
import { buildSystemPrompt } from './promptbuilder.js';
import { TOOL_SCHEMAS } from './memorytools.js';

const userLocks = new Map<string, Promise<void>>();

function withUserLock(userId: string, task: () => Promise<void>) {
  const prev = userLocks.get(userId) ?? Promise.resolve();
  const next = prev.then(task, task);
  userLocks.set(userId, next.finally(() => { if (userLocks.get(userId) === next) userLocks.delete(userId); }));
  return next;
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages],
  partials: [Partials.Channel]
});

client.once(Events.ClientReady, c => console.log(`Logged in as ${c.user.tag}`));

client.on(Events.MessageCreate, async (msg: Message) => {
  try {
    if (msg.author.bot) return;

    const mentioned = msg.inGuild()
      ? msg.mentions.has(client.user?.id || '', { ignoreDirect: false, ignoreRepliedUser: false })
      : true;

    if (!mentioned) return;

    const raw = msg.content ?? '';
    let cleaned = msg.inGuild()
      ? raw.replace(new RegExp(`<@!?${client.user?.id}>`), '').trim()
      : raw.trim();

    // include lightweight metadata (fixed the Date.now() bit)
    cleaned = `${cleaned}\n\n(Sent by ${msg.author.displayName}/${msg.author.username} (User ID: ${msg.author.id}) on server ${msg.guild?.name ?? 'DM'} (Server ID: ${msg.guild?.id ?? 'none'}) at ${new Date().toLocaleString()})`;

    if (!cleaned) {
      await msg.reply('Is your message empty?');
      return;
    }

    await withUserLock(msg.author.id, async () => {
      const thinkingReplies = [
        "<a:orb_working:1222295092187107488> Thinking...",
        "<a:orb_working:1222295092187107488> Composing an answer...",
        "<a:orb_working:1222295092187107488> Considering your message..."
      ];
      const thinking = await msg.reply(thinkingReplies[Math.floor(Math.random() * thinkingReplies.length)]);

      try {
        // 1) Load and patch history
        const history = await getHistory(msg.author.id);
        const systemComposite = buildSystemPrompt({ userId: msg.author.id, guildId: msg.guild?.id });
        // Make sure first message is our composite system prompt
        if (history.length === 0 || history[0].role !== 'system') history.unshift({ role: 'system', content: systemComposite });
        else history[0] = { ...history[0], content: systemComposite };

        const userTurn = { role: 'user' as const, content: cleaned };

        // 2) Run tool-call loop
        const assistantText = await chatWithTools({
          messages: [...history, userTurn],
          tools: TOOL_SCHEMAS
        });

        // 3) Persist both sides
        await appendToHistory(msg.author.id, [userTurn, { role: 'assistant', content: assistantText }]);

        // 4) Respond
        await thinking.edit(assistantText.slice(0, 2000) || '(no content)');
      } catch (err: any) {
        console.error(err);
        const details = typeof err?.message === 'string' ? `\n\n\`\`\`\n${err.message.slice(0, 800)}\n\`\`\`` : '';
        await thinking.edit(`Sorry, I ran into an error talking to the model.${details}`);
      }
    });
  } catch (e) {
    console.error('Top-level message handler error:', e);
  }
});

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('DISCORD_TOKEN missing in environment!');
  process.exit(1);
}
client.login(token);
