import 'dotenv/config';
import { Client, GatewayIntentBits, Events, Partials, Message, TextBasedChannel, Channel, GuildTextBasedChannel, DMChannel } from 'discord.js';
import { appendToHistory, getHistory } from './store.js';
import { chatWithTools } from './openrouter.js';
import { buildSystemPrompt } from './promptbuilder.js';
import { TOOL_SCHEMAS } from './memorytools.js';

const userLocks = new Map<string, Promise<void>>();
const activeCollectors = new Map<string, ReturnType<GuildTextBasedChannel['createMessageCollector']>>();

function withUserLock(userId: string, task: () => Promise<void>) {
  const prev = userLocks.get(userId) ?? Promise.resolve();
  const next = prev.then(task, task);
  userLocks.set(userId, next.finally(() => { if (userLocks.get(userId) === next) userLocks.delete(userId); }));
  return next;
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});

client.once(Events.ClientReady, c => console.log(`Logged in as ${c.user.tag}`));

/**
 * Core pipeline: takes a message and raw user content (already cleaned if needed),
 * runs the tool-call chat, persists history, edits the "thinking" message,
 * and (if in a guild) arms a 30s one-shot followup collector.
 */
async function processPrompt(srcMsg: Message, userContent: string) {
  await withUserLock(srcMsg.author.id, async () => {
    const thinkingReplies = [
      "<a:orb_working:1222295092187107488> Thinking...",
      "<a:orb_working:1222295092187107488> Composing an answer...",
      "<a:orb_working:1222295092187107488> Considering your message..."
    ];
    const thinking = await srcMsg.reply(thinkingReplies[Math.floor(Math.random() * thinkingReplies.length)]);

    try {
      const history = await getHistory(srcMsg.author.id);

      const systemComposite = buildSystemPrompt({
        userId: srcMsg.author.id,
        guildId: srcMsg.guild?.id
      });

      if (history.length === 0 || history[0].role !== 'system') {
        history.unshift({ role: 'system', content: systemComposite });
      } else {
        history[0] = { ...history[0], content: systemComposite };
      }

      // attach lightweight metadata
      const stamped = `${userContent}\n\n(Sent by ${srcMsg.author.displayName}/${srcMsg.author.username} (User ID: ${srcMsg.author.id}) on server ${srcMsg.guild?.name ?? 'DM'} (Server ID: ${srcMsg.guild?.id ?? 'none'}) at ${new Date().toLocaleString()})`;

      const userTurn = { role: 'user' as const, content: stamped };

      const assistantText = await chatWithTools({
        messages: [...history, userTurn],
        tools: TOOL_SCHEMAS
      });

      await appendToHistory(srcMsg.author.id, [userTurn, { role: 'assistant', content: assistantText }]);

      await thinking.edit(assistantText.slice(0, 2000) || '(no content)');

      // After replying in a guild, start a one-shot 30s follow-up collector for this user in this channel
      if (srcMsg.inGuild()) {
        startFollowupCollector(srcMsg);
      }
    } catch (err: any) {
      console.error(err);
      const details = typeof err?.message === 'string' ? `\n\n\`\`\`\n${err.message.slice(0, 800)}\n\`\`\`` : '';
      await thinking.edit(`Sorry, I ran into an error talking to the model.${details}`);
    }
  });
}

/**
 * Arms a one-shot 30s collector for the *next* message from the same user in this channel.
 * If it collects a message, it processes it (without requiring a mention) and then, after replying,
 * arms a fresh 30s window again (since processPrompt is called from the collect branch).
 */
function startFollowupCollector(contextMsg: Message) {
  if (!contextMsg.inGuild()) return;

  const channel = contextMsg.channel;
  const userId = contextMsg.author.id;
  const key = `${channel.id}:${userId}`;

  // If an old collector exists, stop and replace to reset the 30s window
  const existing = activeCollectors.get(key);
  if (existing) {
    try { existing.stop('replaced'); } catch {}
    activeCollectors.delete(key);
  }

  const collector = channel.createMessageCollector({
    filter: (m) => !m.author.bot && m.author.id === userId,
    max: 1,
    time: 40_000 // 30 seconds
  });

  activeCollectors.set(key, collector);

  collector.on('collect', async (m: Message) => {
    // Once we got the next message, clear from registry
    activeCollectors.delete(key);
    try {
      // Process without requiring a mention—just the raw content
      const content = (m.content ?? '').trim();
      if (content.length === 0) return;
      await processPrompt(m, content);
    } catch (e) {
      console.error('Error handling collected follow-up:', e);
    }
  });

  collector.on('end', () => {
    activeCollectors.delete(key);
  });
}

client.on(Events.MessageCreate, async (msg: Message) => {
  try {
    if (msg.author.bot) return;

    // In DMs, always respond. In guilds, require a mention *unless* it’s captured by a follow-up collector.
    const mentioned = msg.inGuild()
      ? msg.mentions.has(client.user?.id || '', { ignoreDirect: false, ignoreRepliedUser: false })
      : true;

    if (!mentioned) return;

    // Strip the mention for guilds; in DMs we keep as-is
    const raw = msg.content ?? '';
    const cleaned = msg.inGuild()
      ? raw.replace(new RegExp(`<@!?${client.user?.id}>`), '').trim()
      : raw.trim();

    if (!cleaned) {
      await msg.reply('Is your message empty?');
      return;
    }

    await processPrompt(msg, cleaned);
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