import { Bot, InlineKeyboard } from "https://deno.land/x/grammy@v1.1.4/mod.ts";
import { InlineQueryResultArticle } from "https://deno.land/x/grammy@v1.1.4/platform.ts";

interface DoorStatusResult {
  readonly state: {
    readonly open: boolean;
    readonly lastchange: number;
  };
  readonly location: {
    readonly lon: number;
    readonly lat: number;
    readonly address: string;
  };
}

const token = Deno.env.get("BOT_TOKEN");
if (!token) {
  throw new Error(
    "You have to provide the bot-token from @BotFather via environment variable (BOT_TOKEN)",
  );
}

const bot = new Bot(token);

let statusCache: DoorStatusResult;
let statusTimestamp = 0;
async function doorisStatus(): Promise<DoorStatusResult> {
  const age = (Date.now() - statusTimestamp) / 1000;
  if (age > 60) { // Older than 60 seconds
    statusTimestamp = Date.now();
    const response = await fetch(
      "https://www.hamburg.ccc.de/dooris/status.json",
    );
    statusCache = await response.json();
  }

  return statusCache;
}

function statusString(status: DoorStatusResult) {
  const { open, lastchange } = status.state;
  const age = (Date.now() / 1000) - lastchange;
  const ageString = formatAge(age);

  if (open) {
    return `Die Tür ist seit ${ageString} offen. 🙃`;
  }

  return `Die Tür ist seit ${ageString} geschlossen. 😔`;
}

function formatAge(ageInSeconds: number) {
  if (ageInSeconds < 60 * 90) { // Less than 90 min
    const minutes = Math.floor(ageInSeconds / 60);
    if (minutes === 1) {
      return "einer Minute";
    }

    return `${minutes} Minuten`;
  }

  const hours = Math.floor(ageInSeconds / (60 * 60));
  if (hours === 1) {
    return "einer Stunde";
  }

  return `${hours} Stunden`;
}

bot.command("start", async (ctx) => {
  return await ctx.reply(
    `Hey ${ctx.from!.first_name}!
Benutze /door für den aktuellen Zustand.
Wenn du Anderen den Zustand der Tür zeigen willst, schreibe in jedem beliebigen Telegram Chat \`@${username}\` und wähle den Türzustand. (Die Textzeile darf nichts anderes als \`@${username}\` beinhalten)`,
    { parse_mode: "Markdown" },
  );
});

bot.command(
  "door",
  async (ctx) => ctx.reply(statusString(await doorisStatus())),
);

bot.command("where", async (ctx) => {
  const status = await doorisStatus();
  const { lon, lat, address } = status.location;
  // TODO: extra is optional... remove when typigns are fixed
  return ctx.replyWithVenue(lat, lon, "CCC Hamburg", address, {});
});

const updateKeyboard = new InlineKeyboard().text("update", "update");

bot.on("inline_query", async (ctx) => {
  const results: InlineQueryResultArticle[] = [];

  const status = await doorisStatus();
  results.push({
    type: "article",
    id: String(status.state.open),
    title: `Die Tür ist ${status.state.open ? "offen" : "zu"}`,
    input_message_content: {
      message_text: statusString(status),
    },
    reply_markup: updateKeyboard,
  });

  return ctx.answerInlineQuery(results, {
    cache_time: 120, // 120 seconds -> 2 minutes
  });
});

bot.callbackQuery("update", async (ctx) => {
  const status = await doorisStatus();
  const text = statusString(status);

  return Promise.all([
    ctx.editMessageText(text, { reply_markup: updateKeyboard }),
    ctx.answerCallbackQuery({ text: "updated 😘" }),
  ]);
});

bot.on("channel_post", async (ctx) => {
  await ctx.reply(
    "Adding a random bot as an admin to your channel is maybe not the best idea…\n\nSincerely, a random bot, added as an admin to this channel.",
  );
  console.log("leave the channel…", ctx.chat);
  return ctx.leaveChat();
});

bot.catch((error) => {
  if (
    error instanceof Error && error.message.includes("message is not modified")
  ) {
    return;
  }

  console.error(error);
});

await bot.api.setMyCommands([
  { command: "door", description: "Zustand der Tür" },
  { command: "where", description: "Wo ist besagte Tür?" },
]);

const username = (await bot.api.getMe()).username;
await bot.start();
