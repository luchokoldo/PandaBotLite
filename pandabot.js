const Discord = require('discord.js');
const fetch = require('node-fetch')
const pjson = require('./package.json');
const dbConfig = require("./database/dbconfig.json");
require('dotenv').config()

const client = new Discord.Client({ partials: ['MESSAGE', 'REACTION'] });
const guildsData = new Map()
let db
var gData

const TXPRICE = 0.00002100, CREATE = 0, UPDATE = 1

const APIKEY = process.env.API, GASROLE = 'GasNotification'

var MsgText, BotMsgText;

var lowGwei, avgGwei, highGwei, ethPrice, blockReward, lastBlock; //etherscan

(async () => {

    db = await require('./database/db')

    try {

        await db.query(`CREATE TABLE IF NOT EXISTS ${dbConfig.db_tableP} (
            guildId VARCHAR(100) NOT NULL PRIMARY KEY, 
            createDate VARCHAR(50) NOT NULL       
        );`)

        await db.query(`CREATE TABLE IF NOT EXISTS ${dbConfig.db_tableS} (        
            guildId VARCHAR(100) NOT NULL PRIMARY KEY,  
            cmdPrefix VARCHAR(10) DEFAULT '!',
            msgId VARCHAR(100) DEFAULT '',
            notiMsgId VARCHAR(100) DEFAULT '',
            notiMsgMax INT DEFAULT 60,
            channelId VARCHAR(100) DEFAULT ''
        );`)
    }
    catch (error) { console.log(error) }

    await client.login(process.env.BOT_TOKEN);

})()

client.on('ready', () => {

    console.log(`${client.user.tag} Ready`);

    var channelID

    client.guilds.cache.forEach(guild => {

        db.query(`SELECT * FROM ${dbConfig.db_tableS} WHERE guildId = '${guild.id}';`).then(result => {

            gData

            if (result[0][0].channelId === '') {

                guildsData.set(guild.id, result[0][0])

                return

            }

            channelID = guild.channels.cache.get(result[0][0].channelId)

            channelID.messages.fetch(result[0][0].msgId).then(r => {

                if (!r)
                    return

                result[0][0]['intervalId'] = setInterval(UpdateMsg, 900000, r)

                guildsData.set(guild.id, result[0][0])


            }).catch(error => console.log(error))

        }).catch(error => console.log(error))
    })
})

client.on('guildCreate', async (guild) => {

    try {

        await db.query(`INSERT INTO ${dbConfig.db_tableP} VALUES( '${guild.id}', '${new Date().toLocaleString("en-GB", { timeZone: "America/Argentina/Buenos_Aires" })}' );`)

        await db.query(`INSERT INTO ${dbConfig.db_tableS} (guildId) VALUES( '${guild.id}' );`)

        let result = await db.query(`SELECT * FROM ${dbConfig.db_tableS} WHERE guildId = '${guild.id}';`)

        guildsData.set(guild.id, result[0][0])

    }
    catch (error) { console.log(error) }


})

client.on('message', async (message) => {

    if (message.author.bot)
        return

    MsgText = String(message.content).toLowerCase()

    gData = guildsData.get(message.guild.id)

    if (message.channel.id != gData.channelId) {

        if (MsgText.startsWith(`${gData.cmdPrefix}pandabot`)) {

            message.delete();

            message.channel.send("Creado por: " + client.users.cache.find(user => user.id === '143413875436421121').username + " Version: " + pjson.version)

            return

        }
        else if (MsgText.startsWith(`${gData.cmdPrefix}pandahelp`)) {

            message.channel.send(`Comandos disponibles: \n
            ${gData.cmdPrefix}pandabot: Muestra el Autor y la Version del bot\n
            ${gData.cmdPrefix}register: Agregar canal para que solo el bot publique y el rol de notificacion\n
            ${gData.cmdPrefix}unregister: Remueve el canal agregado al bot y el rol\n
            ${gData.cmdPrefix}update: Actualiza los datos\n
            ${gData.cmdPrefix}gasprice: Cambia el valor para mandar la alerta; si el valor Avg es igual o menor, envia la alerta uso: ${gData.cmdPrefix}gasprice 50\n
            ${gData.cmdPrefix}pbprefix: Cambia el prefijo de los comandos; uso: ${gData.cmdPrefix}pbprefix !!\n`)

            return

        }
        else if (MsgText.startsWith(`${gData.cmdPrefix}pbprefix`)) {

            message.delete();

            let buffer = MsgText.split(' ')

            if (buffer[1]) {

                gData.cmdPrefix = buffer[1]

                await db.query(`UPDATE ${dbConfig.db_tableS} SET cmdPrefix='${gData.cmdPrefix}' WHERE guildId=${gData.guildId};`).catch(error => console.log(error))

            }

            return
        }
        else if (MsgText.startsWith(`${gData.cmdPrefix}register`) && message.member.hasPermission("ADMINISTRATOR")) {

            message.delete();

            if (gData.channelId == "") {

                gData.channelId = message.channel.id

                if (!message.guild.roles.cache.find(role => role.name === GASROLE)) {

                    message.guild.roles.create({
                        data: {
                            name: GASROLE
                        }
                    }).catch(error => console.log(error))

                }

                PostNewMsg(message)

            }

            return;
        }

        return
    }

    if (!message.member.hasPermission("ADMINISTRATOR")) {

        message.delete();

        return;
    }

    if (MsgText.startsWith(`${gData.cmdPrefix}update`)) {

        message.delete();

        if (gData.msgId != '') {

            let handler = await message.channel.messages.fetch(gData.msgId)

            if (!handler) {

                gData.msgId = ''

                return
            }

            UpdateMsg(handler)
        }

        return
    }
    else if (MsgText.startsWith(`${gData.cmdPrefix}unregister`)) {

        message.delete();

        gData.channelId = ''

        clearInterval(gData.intervalId)

        gData.intervalId = null

        message.channel.messages.fetch(gData.msgId).then(msgid => {

            if (msgid)
                msgid.delete().catch(error => console.log(error))

        }).catch(error => console.log(error))

        gData.msgId = ''

        gData.notiMsgId = ''

        await db.query(`UPDATE ${dbConfig.db_tableS} SET cmdPrefix='${gData.cmdPrefix}', msgId='', notiMsgId='', channelId='' WHERE guildId=${gData.guildId};`).catch(error => console.log(error))

        let role = message.guild.roles.cache.find(role => role.name === GASROLE)

        if (role != null)
            role.delete()

        return
    }
    else if (MsgText.startsWith(`${gData.cmdPrefix}gasprice`)) {

        message.delete();

        let buffer = MsgText.split(' ')

        if (!Number(buffer[1]).isNaN) {

            gData.notiMsgMax = Number(buffer[1])

            await db.query(`UPDATE ${dbConfig.db_tableS} SET notiMsgMax='${gData.notiMsgMax}' WHERE guildId=${gData.guildId};`).catch(error => console.log(error))

        }

        return
    }
    else if (MsgText.startsWith(`${gData.cmdPrefix}restart`)) {

        message.delete();

        let role = message.guild.roles.cache.find(role => role.name === GASROLE)

        if (role != null)
            role.delete()

        gData.notiMsgMax = 60

        gData.channelId = ''

        gData.intervalId = ''

        gData.msgId = ''

        gData.notiMsgId = ''

        clearInterval(gData.intervalId)

        await db.query(`UPDATE ${dbConfig.db_tableS} SET cmdPrefix='!', msgId='', notiMsgId='', notiMsgMax='60', channelId='' WHERE guildId=${gData.guildId};`).catch(error => console.log(error))
    }

    if (message.channel.id == gData.channelId)
        message.delete();
})

client.on('guildDelete', async (guild) => {

    await db.query(`DELETE FROM ${dbConfig.db_tableS} WHERE guildId=${guild.id};`).catch(error => console.log(error))

})

client.on('messageDelete', async (message) => {

    if (!message.client.user.bot) {

        gData = guildsData.get(message.guild.id)

        if (message.id != gData.msgId && message.id != gData.notiMsgId)
            return
        else if(message.id === gData.notiMsgId) {

            gData.notiMsgId = ''

            return
        }

        gData.channelId = ''

        clearInterval(gData.intervalId)

        gData.intervalId = ''

        message.channel.messages.fetch(gData.msgId).then(msgid => {

            if (msgid)
                msgid.delete().catch(error => console.log(error))

        }).catch(error => console.log(error))

        message.channel.messages.fetch(gData.notiMsgId).then(msgid => {

            if (msgid)
                msgid.delete().catch(error => console.log(error))

        }).catch(error => console.log(error))

        gData.msgId = ''

        gData.notiMsgId = ''

        await db.query(`UPDATE ${dbConfig.db_tableS} SET cmdPrefix='${gData.cmdPrefix}', msgId='', notiMsgId='', channelId='' WHERE guildId=${gData.guildId};`).catch(error => console.log(error))

        let role = message.guild.roles.cache.find(role => role.name === GASROLE)

        if (role != null)
            role.delete()

    }

})

client.on('messageReactionAdd', async (reaction, user) => {

    if (user.bot || reaction.emoji.name != '⛽')
        return

    let ApplyRole = async () => {

        let role = reaction.message.guild.roles.cache.find(role => role.name == GASROLE)
        let member = reaction.message.guild.members.cache.find(member => member.id === user.id)

        try {

            if (role && member)
                member.roles.add(role)


        } catch (error) { console.log(error) }

    }

    gData = guildsData.get(reaction.message.guild.id)

    if (reaction.message.partial) {

        try {

            let msg = await reaction.message.fetch()

            if (msg.id === gData.msgId)
                ApplyRole()

        }
        catch (error) { console.log(error) }
    }
    else
        if (reaction.message.id === gData.msgId)
            ApplyRole()

})

client.on('messageReactionRemove', async (reaction, user) => {

    if (user.bot || reaction.emoji.name != '⛽')
        return

    let RemoveRole = async () => {

        let role = reaction.message.guild.roles.cache.find(role => role.name == GASROLE)
        let member = reaction.message.guild.members.cache.find(member => member.id === user.id)

        try {

            if (role && member)
                member.roles.remove(role)


        } catch (error) { console.log(error) }

    }

    gData = guildsData.get(reaction.message.guild.id)

    if (reaction.message.partial) {

        try {

            let msg = await reaction.message.fetch()

            if (msg.id === gData.msgId)
                RemoveRole()

        }
        catch (error) { console.log(error) }
    }
    else
        if (reaction.message.id === gData.msgId)
            RemoveRole()

})

function PostNewMsg(h_message) {

    GetText(h_message, CREATE)

}

function UpdateMsg(h_message) {

    GetText(h_message, UPDATE)

}

function GetText(h_message, type) {

    fetch(`https://api.etherscan.io/api?module=gastracker&action=gasoracle&apikey=${APIKEY}`).then(resp => resp.json()).then(webMsg => {

        if (webMsg.message != 'OK') {

            setTimeout(GetText, 5000, h_message, type)

            return
        }

        lowGwei = Number(webMsg.result.SafeGasPrice)

        avgGwei = Number(webMsg.result.ProposeGasPrice)

        highGwei = Number(webMsg.result.FastGasPrice)

        lastBlock = webMsg.result.LastBlock

        fetch(`https://api.etherscan.io/api?module=stats&action=ethprice&apikey=${APIKEY}`).then(resp => resp.json()).then(webMsg => {

            if (webMsg.message != 'OK') {

                setTimeout(GetText, 5000, h_message, type)

                return
            }

            ethPrice = Number(webMsg.result.ethusd).toFixed(0)

            fetch(`https://api.etherscan.io/api?module=block&action=getblockreward&blockno=${lastBlock}&apikey=${APIKEY}`).then(resp => resp.json()).then(webMsg => {

                if (webMsg.message != 'OK') {

                    setTimeout(GetText, 5000, h_message, type)

                    return
                }

                blockReward = (Number(webMsg.result.blockReward) * 0.000000000000000001).toFixed(2)

                FormText(h_message, type)

            })

        })

    }).catch(err => console.log(err))
}

async function FormText(h_message, type) {

    BotMsgText = ""

    BotMsgText += ". \n"
    BotMsgText += "----------------------------------------------------------------\n\n"

    BotMsgText += "__**Ethereum Price:**__ **" + ethPrice.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",") + " USD**\n"
    BotMsgText += "__**Last Block:**__ **" + blockReward + " ETH**\n"
    BotMsgText += "__**Gas Tracker**__\n"
    BotMsgText += "_Low:_ ***" + lowGwei + "*** _Gwei -_ ***" + ((lowGwei * TXPRICE) * ethPrice).toFixed(2) + "*** _USD_\n"
    BotMsgText += "_Avg:_ ***" + avgGwei + "*** _Gwei -_ ***" + ((avgGwei * TXPRICE) * ethPrice).toFixed(2) + "*** _USD_\n"
    BotMsgText += "_High:_ ***" + highGwei + "*** _Gwei -_ ***" + ((highGwei * TXPRICE) * ethPrice).toFixed(2) + "*** _USD_\n\n"

    BotMsgText += "----------------------------------------------------------------\n"
    BotMsgText += "*Last Update:* __*" + new Date().toLocaleString("en-GB", { timeZone: "America/Argentina/Buenos_Aires" }) + "*__\n"
    BotMsgText += "----------------------------------------------------------------"

    gData = guildsData.get(h_message.guild.id)

    if (type == CREATE) {

        h_message.channel.send(BotMsgText).then(msgid => {

            gData.msgId = msgid.id

            gData.channelId = msgid.channel.id

            gData['intervalId'] = setInterval(UpdateMsg, 900000, msgid)

            msgid.react("⛽")

            db.query(`UPDATE ${dbConfig.db_tableS} SET cmdPrefix='${gData.cmdPrefix}', msgId='${gData.msgId}', channelId='${gData.channelId}' WHERE guildId=${gData.guildId};`).catch(error => console.log(error))

        }).catch(error => console.log(error))
    }
    else {

        h_message.edit(BotMsgText).then(r => {

            if (avgGwei <= gData.notiMsgMax) {

                if (gData.notiMsgId) {

                    h_message.channel.messages.fetch(gData.notiMsgId).then(msgid => {

                        if (msgid)
                            msgid.delete().catch(error => console.log(error))

                    }).catch(error => console.log(error))

                }

                let role = h_message.guild.roles.cache.find(role => role.name === GASROLE)

                h_message.channel.send(`Low gas price ${role} - ${new Date().toLocaleString("en-GB", { timeZone: "America/Argentina/Buenos_Aires" })}`).then(msgid => {

                    gData.notiMsgId = msgid.id

                    db.query(`UPDATE ${dbConfig.db_tableS} SET notiMsgId='${gData.notiMsgId}' WHERE guildId=${gData.guildId};`).catch(error => console.log(error))
                })
            }
        })

    }
}