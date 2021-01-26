const {existsSync, readFileSync} = require('fs')

const {Telegraf, Markup} = require('telegraf')
const got = require('got')

process.title = 'dooris-tgbot'

const token = (existsSync('/run/secrets/bot-token.txt') && readFileSync('/run/secrets/bot-token.txt', 'utf8').trim()) ||
	(existsSync('bot-token.txt') && readFileSync('bot-token.txt', 'utf8').trim()) ||
	process.env.BOT_TOKEN
if (!token) {
  throw new Error('You have to provide the bot-token from @BotFather via file (bot-token.txt) or environment variable (BOT_TOKEN)')
}

const bot = new Telegraf(token)

let statusCache = {}
let statusTimestamp = 0
async function doorisStatus() {
  const age = (Date.now() - statusTimestamp) / 1000
  if (age > 60) { // Older than 60 seconds
    statusTimestamp = Date.now()
    statusCache = await got('https://www.hamburg.ccc.de/dooris/status.json').json()
  }

  return statusCache
}

function statusString(status) {
  const {open, lastchange} = status.state
  const age = (Date.now() / 1000) - lastchange
  const ageString = formatAge(age)

  if (open) {
    return `Die Tür ist seit ${ageString} offen. 🙃`
  }

  return `Die Tür ist seit ${ageString} geschlossen. 😔`
}

function formatAge(ageInSeconds) {
  if (ageInSeconds < 60 * 90) { // Less than 90 min
    const minutes = Math.floor(ageInSeconds / 60)
    if (minutes === 1) {
      return 'einer Minute'
    }

    return `${minutes} Minuten`
  }

  const hours = Math.floor(ageInSeconds / (60 * 60))
  if (hours === 1) {
    return 'einer Stunde'
  }

  return `${hours} Stunden`
}

bot.command('start', ctx => {
  return ctx.reply(`Hey ${ctx.from.first_name}!\nBenutze /door für den aktuellen Zustand.\nWenn du Anderen den Zustand der Tür zeigen willst, schreibe in jedem beliebigen Telegram Chat \`@doorisbot\` und wähle den Türzustand. (Die Textzeile darf nichts anderes als \`@doorisbot\` beinhalten)`, {parse_mode: 'Markdown'})
})

bot.command('door', async ctx => ctx.reply(statusString(await doorisStatus())))

bot.command('where', async ctx => {
  const status = await doorisStatus()
  const {lon, lat, address} = status.location
  return ctx.replyWithVenue(lat, lon, 'CCC Hamburg', address)
})

const updateKeyboard = Markup.inlineKeyboard([
  Markup.button.callback('update', 'update')
])

bot.on('inline_query', async ctx => {
  const results = []

  const status = await doorisStatus()
  results.push({
    type: 'article',
    id: String(status.state.open),
    title: `Die Tür ist ${status.state.open ? 'offen' : 'zu'}`,
    input_message_content: {
      message_text: statusString(status)
    },
    ...updateKeyboard
  })

  return ctx.answerInlineQuery(results, {
    cache_time: 120 // 120 seconds -> 2 minutes
  })
})

bot.action('update', async ctx => {
  const status = await doorisStatus()
  const text = statusString(status)

  return Promise.all([
    ctx.editMessageText(text, updateKeyboard),
    ctx.answerCbQuery('updated 😘')
  ])
})

bot.on('channel_post', async ctx => {
  await ctx.reply('Adding a random bot as an admin to your channel is maybe not the best idea…\n\nSincerely, a random bot, added as an admin to this channel.')
  console.log('leave the channel…', ctx.chat)
  return ctx.leaveChat(ctx.chat.id)
})

bot.catch(error => {
  if (error.message.startsWith('400: Bad Request: message is not modified')) {
    return
  }

  console.error(error)
})

async function startup() {
  await bot.telegram.setMyCommands([
    {command: 'door', description: 'Zustand der Tür'},
    {command: 'where', description: 'Wo ist besagte Tür?'}
  ])

  await bot.launch()
  console.log(new Date(), 'Bot started as', bot.botInfo?.username)
}

startup()
