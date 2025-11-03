import 'dotenv/config';
import { Client, GatewayIntentBits, Events, Partials, Message, userMention } from 'discord.js';
import { appendToHistory, getHistory } from './store.js';
import { completeWithOpenRouter } from './openrouter.js';

const userLocks = new Map<string, Promise<void>>();

function withUserLock(userId: string, task: () => Promise<void>) {
  const prev = userLocks.get(userId) ?? Promise.resolve();
  const next = prev.then(task, task);
  userLocks.set(userId, next.finally(() => {
    if (userLocks.get(userId) === next) userLocks.delete(userId);
  }));
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

client.once(Events.ClientReady, c => {
  console.log(`Logged in as ${c.user.tag}`);
});

client.on(Events.MessageCreate, async (msg: Message) => {
  try {
    if (msg.author.bot) return;

    // respond when the bot is mentioned or in DMs
    const mentioned = msg.inGuild()
      ? msg.mentions.has(client.user?.id || '', { ignoreDirect: false, ignoreRepliedUser: false })
      : true; // always “mentioned” in DMs

    if (!mentioned) return;

    // remove mention (message replies also work) and prepare message
    const raw = msg.content ?? '';
    let cleaned = msg.inGuild()
      ? raw.replace(new RegExp(`<@!?${client.user?.id}>`), '').trim()
      : raw.trim();
    cleaned = cleaned + `(Sent by ${msg.author.displayName} (unique username ${msg.author.username})` +
                        `on server ${msg.guild?.name} at ${Date.now().toLocaleString()})`

    if (!cleaned) {
      await msg.reply('Is your message empty?');
      return;
    }

    await withUserLock(msg.author.id, async () => {
      // send the quick placeholder
      let thinkingReplies = [
        "<a:orb_working:1222295092187107488> I am thinking...",
        "<a:orb_working:1222295092187107488> Thinking...",
        "<a:orb_working:1222295092187107488> Thinking of a reply...",
        "<a:orb_working:1222295092187107488> Considering your message...",
        "<a:orb_working:1222295092187107488> Wondering...",
        "<a:orb_working:1222295092187107488> Doing some stuff...",
        "<a:orb_working:1222295092187107488> Composing an answer...",
        "<a:orb_working:1222295092187107488> Give me a second..."
      ]
      const thinking = await msg.reply( thinkingReplies[Math.floor(Math.random() * thinkingReplies.length)] );

      try {
        // build context
        const history = await getHistory(msg.author.id);
        const userTurn = { role: 'user' as const, content: cleaned };

        // call OpenRouter and store messages
        const assistantText = await completeWithOpenRouter([...history, userTurn]);
        await appendToHistory(msg.author.id, [userTurn, { role: 'assistant', content: assistantText }]);

        await thinking.edit(assistantText.slice(0, 2000) || '(no content)');
      } catch (err: any) {
        console.error(err);
        const details =
          typeof err?.message === 'string' ? `\n\n\`\`\`\n${err.message.slice(0, 800)}\n\`\`\`` : '';
        await thinking.edit(`Sorry, I ran into an error talking to the model.\n${details}`);
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