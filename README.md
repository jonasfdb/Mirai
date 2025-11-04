## 📦 About This Repository

Mirai is a wrapper to interface with the OpenRouter API to allow you to create your very own AI-powered Discord friend. Currently the bot is purely text-based, but it's actively being worked on. I've got plans! In the future, Mirai will be able to look at images you send, use tools and go search the web, and much more.

To use Mirai, simply invite the bot to your server. Mirai will listen in any channels she has access to, and reply to all messages you ping the bot in (reply pings count as well). You can also talk to Mirai in DMs if you share a server with the bot.

## 🤝 Contribute to Mirai

### Got an idea?

If you have an idea, a suggestion or a feature request, you can make your voice heard in two ways. Either you get in contact with me directly, or, preferably, you create an Issue or a Discussion on here. Both works fine! If you want to submit code directly, please fork and submit a pull request with a clear commit message. I'd love to be able to ask you to adhere to my coding style, but in all fairness, my codebase is still mostly a mess and I am still actively working on improving it. Check my other bots for a testament to that.

## ⚙️ Requirements & Setup

### Prerequisites

You should have a Discord bot token available through your [Discord Developer Portal](https://discord.com/developers), and have [Node.js](https://nodejs.org) >22 installed. This version of Mirai was built and is running on Node.js 22.21.0 and Keyv/SQLite 3.6.7, using discord.js 14.24.2.

### Installation and Setup

Before you begin, make sure that in the Developer portal, the bot instance you use has the Message Content intent enabled. Mirai will not be able to read messages if that is disabled. To get the bot to run, first, clone the repository into a new folder and run `npm install` to install the necessary packages. Then, create a `.env` file based on the structure in `.env.example` at the root of the project, where `.env.example` is. Populate it with the necessary values.

### Optional Stuff

Under `/config/sysmsg.md`, you will find Mirai's system prompt. This prompt defines the behavior of the language model when speaking to the user, and allows you to fine-tune the personality. Mirai comes preloaded with the system prompt I run the bot under, but you are free to edit it to do whatever.
In the `.env` file, you will notice the ability to change the specific model Mirai uses to generate the reply through OpenRouter. You can change this to any model you wish to use. I use Claude 4.5 per default, it sounds most human, but any model provided through OpenRouter will work.
When you are done setting up the bot, run any script from below to get it to start up.

### Run

Mirai provides the following executable scripts through `package.json`:

```bash
npm start               # run compiled build using tsx
npm run dev             # run watched development build for fast prototyping
npm run build           # build-a-bot comes by your house and assembles the bot for you
```

## ⚖️ License

This project is licensed under the OSI-approved **Mozilla Public License Version 2.0 (MPL-2.0)**.

See [`LICENSE`](./LICENSE) for the full text of the license. For a summary of the MPL-2.0, visit [choosealicense.com](https://choosealicense.com/licenses/mpl-2.0/).

## 💭 Contact

Mirai is developed and maintained with love and care by me, jonasfdb <3

I can best be reached through Discord under the username **jonasfdb** if it is urgent. Otherwise, keep contact to Issues, Discussions and pull requests here or send an e-mail to **me@jonasfdb.cc**.
