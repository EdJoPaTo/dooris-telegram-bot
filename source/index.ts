import {Bot, InlineKeyboard} from 'grammy';
import {generateUpdateMiddleware} from 'telegraf-middleware-console-time';
import {InlineQueryResultArticle} from 'grammy/types';
import got from 'got';

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

process.title = 'dooris-tgbot';

const token = process.env['BOT_TOKEN'];
if (!token) {
	throw new Error('You have to provide the bot-token from @BotFather via environment variable (BOT_TOKEN)');
}

const bot = new Bot(token);

bot.use(generateUpdateMiddleware());

let statusCache: DoorStatusResult;
let statusTimestamp = 0;
async function doorisStatus(): Promise<DoorStatusResult> {
	const age = (Date.now() - statusTimestamp) / 1000;
	if (age > 60) { // Older than 60 seconds
		statusTimestamp = Date.now();
		statusCache = await got('https://www.hamburg.ccc.de/dooris/status.json').json();
	}

	return statusCache;
}

function statusString(status: DoorStatusResult) {
	const {open, lastchange} = status.state;
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
			return 'einer Minute';
		}

		return `${minutes} Minuten`;
	}

	const hours = Math.floor(ageInSeconds / (60 * 60));
	if (hours === 1) {
		return 'einer Stunde';
	}

	return `${hours} Stunden`;
}

bot.command('start', async ctx => ctx.reply(
	`Hey ${ctx.from!.first_name}!
Benutze /door für den aktuellen Zustand.
Wenn du Anderen den Zustand der Tür zeigen willst, schreibe in jedem beliebigen Telegram Chat \`@${username}\` und wähle den Türzustand. (Die Textzeile darf nichts anderes als \`@${username}\` beinhalten)`,
	{parse_mode: 'Markdown'},
));

bot.command('door', async ctx => ctx.reply(statusString(await doorisStatus())));

bot.command('where', async ctx => {
	const status = await doorisStatus();
	const {lon, lat, address} = status.location;
	return ctx.replyWithVenue(lat, lon, 'CCC Hamburg', address);
});

const updateKeyboard = new InlineKeyboard().text('update', 'update');

bot.on('inline_query', async ctx => {
	const results: InlineQueryResultArticle[] = [];

	const status = await doorisStatus();
	results.push({
		type: 'article',
		id: String(status.state.open),
		title: `Die Tür ist ${status.state.open ? 'offen' : 'zu'}`,
		input_message_content: {
			message_text: statusString(status),
		},
		reply_markup: updateKeyboard,
	});

	return ctx.answerInlineQuery(results, {
		cache_time: 120, // 120 seconds -> 2 minutes
	});
});

bot.callbackQuery('update', async ctx => {
	const status = await doorisStatus();
	const text = statusString(status);

	try {
		await ctx.editMessageText(text, {reply_markup: updateKeyboard});
	} catch (error: unknown) {
		if (error instanceof Error && error.message.includes('message is not modified')) {
			// Ignore
		} else {
			throw error;
		}
	}

	return ctx.answerCallbackQuery({text: 'updated 😘'});
});

bot.on('channel_post', async ctx => {
	await ctx.reply('Adding a random bot as an admin to your channel is maybe not the best idea…\n\nSincerely, a random bot, added as an admin to this channel.');
	console.log('leave the channel…', ctx.chat);
	return ctx.leaveChat();
});

let username: string;

async function startup() {
	await bot.api.setMyCommands([
		{command: 'door', description: 'Zustand der Tür'},
		{command: 'where', description: 'Wo ist besagte Tür?'},
	]);

	await bot.start({
		onStart(botInfo) {
			username = botInfo.username;
			console.log(new Date(), 'Bot starts as', botInfo.username);
		},
	});
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
startup();
