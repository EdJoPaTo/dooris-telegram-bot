const fs = require('fs')
const request = require('request-promise-native')
const Telegraf = require('telegraf')

const {Extra, Markup} = Telegraf

const tokenFilePath = process.env.NODE_ENV === 'production' ? process.env.npm_package_config_tokenpath : process.env.npm_package_config_tokenpathdebug
const token = fs.readFileSync(tokenFilePath, 'utf8').trim()
const bot = new Telegraf(token)

let statusCache = {}
let statusTimestamp = 0
async function doorisStatus() {
  const age = (Date.now() - statusTimestamp) / 1000
  if (age > 60) { // Older than 60 seconds
    statusTimestamp = Date.now()
    statusCache = JSON.parse(await request('https://www.hamburg.ccc.de/dooris/status.json'))
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
  return ctx.reply(`Hey ${ctx.from.first_name}!\nBenutze /door für den aktuellen Zustand.\nWenn du Anderen den Zustand der Tür zeigen willst, schreibe in jedem beliebigen Telegram Chat \`@doorisbot\` und wähle den Türzustand. (Die Textzeile darf nichts anderes als \`@doorisbot\` beinhalten)`, Extra.markdown())
})

bot.command('door', async ctx => ctx.reply(statusString(await doorisStatus())))

bot.command('where', async ctx => {
  const status = await doorisStatus()
  const {lon, lat, address} = status.location
  return ctx.replyWithVenue(lat, lon, 'CCC Hamburg', address)
})

const updateKeyboard = Markup.inlineKeyboard([
  Markup.callbackButton('update', 'update')
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
    reply_markup: updateKeyboard
  })

  return ctx.answerInlineQuery(results, {
    cache_time: 120 // 120 seconds -> 2 minutes
  })
})

bot.action('update', async ctx => {
  const status = await doorisStatus()
  const text = statusString(status)

  return Promise.all([
    ctx.editMessageText(text, Extra.markup(updateKeyboard)),
    ctx.answerCbQuery('updated 😘')
  ])
})

bot.on('channel_post', async ctx => {
  await ctx.reply('Adding a random bot as an admin to your channel is maybe not the best idea…\n\nSincerely, a random bot, added as an admin to this channel.')
  console.log('leave the channel…', ctx.chat)
  return ctx.leaveChat(ctx.chat.id)
})

bot.catch(error => {
  if (error.description === 'Bad Request: message is not modified') {
    return
  }

  console.error(error)
})

bot.startPolling()
