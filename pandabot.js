const Discord = require('discord.js')
const fetch = require('node-fetch')
const pjson = require('./package.json')
const dbConfig = require("./database/dbconfig.json")
const db = require('./database/db')
require('dotenv').config()

const client = new Discord.Client({ partials: ['MESSAGE', 'REACTION'] })
const guildsData = new Map()

const TXPRICE = 0.00002100, CREATE = 0, UPDATE = 1

const APIKEY = process.env.API, GASROLE = 'GasNotification'

var MsgText, BotMsgText;

var lowGwei, avgGwei, highGwei, ethPrice, blockReward, lastBlock; //etherscan

(async () => {

    try {

        await db.Query(`CREATE TABLE IF NOT EXISTS ${dbConfig.db_tableP} (
            guildId VARCHAR(100) NOT NULL PRIMARY KEY, 
            createDate VARCHAR(50) NOT NULL       
        );`)

        await db.Query(`CREATE TABLE IF NOT EXISTS ${dbConfig.db_tableS} (        
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

    let channelID

    client.guilds.cache.forEach(guild => {

        db.Query(`SELECT * FROM ${dbConfig.db_tableS} WHERE guildId = '${guild.id}';`).then(result => {

            if (result[0][0].channelId === '') {

                SetDefault(guild)

                return

            }

            channelID = guild.channels.cache.get(result[0][0].channelId)

            channelID.messages.fetch(result[0][0].msgId).then(r => {

                result[0][0]['intervalId'] = setInterval(UpdateMsg, 900000, r)

                guildsData.set(guild.id, result[0][0])

            }).catch(() => SetDefault(guild))

        }).catch(error => console.log(error))
    })
})

client.on('guildCreate', async (guild) => {

    try {

        await db.Query(`INSERT INTO ${dbConfig.db_tableP} VALUES( '${guild.id}', '${new Date().toLocaleString("en-GB", { timeZone: "America/Argentina/Buenos_Aires" })}' );`)

        await db.Query(`INSERT INTO ${dbConfig.db_tableS} (guildId) VALUES( '${guild.id}' );`)

        let result = await db.Query(`SELECT * FROM ${dbConfig.db_tableS} WHERE guildId = '${guild.id}';`)

        guildsData.set(guild.id, result[0][0])

    }
    catch (error) { console.log(error) }

})

client.on('message', async (message) => {

    if (message.author.bot)
        return

    MsgText = String(message.content).toLowerCase()

    let aData = guildsData.get(message.guild.id)

    if (MsgText.startsWith(`${aData.cmdPrefix}pbrestart`) && message.member.hasPermission("ADMINISTRATOR")) {

        message.delete();

        let role = message.guild.roles.cache.find(role => role.name === GASROLE)

        if (role != null)
            role.delete()

        clearInterval(aData.intervalId)

        if(aData.msgId)
            message.channel.messages.fetch(aData.msgId).then(msgid => msgid.delete()).catch()

        if(aData.notiMsgId)
            message.channel.messages.fetch(aData.notiMsgId).then(msgid => msgid.delete()).catch()

        SetDefault(message.guild)

        return
    }
    else if (message.channel.id != aData.channelId) {

        if (MsgText.startsWith(`${aData.cmdPrefix}pandabot`)) {

            message.delete();

            message.channel.send("Creado por: " + client.users.cache.find(user => user.id === '143413875436421121').username + " Version: " + pjson.version)

            return

        }
        else if (MsgText.startsWith(`${aData.cmdPrefix}pandahelp`)) {

            message.channel.send(`Comandos disponibles: \n
            ***${aData.cmdPrefix}pandabot***: Muestra el Autor y la version del bot\n
            ***${aData.cmdPrefix}register***: Agregar canal para que solo el bot publique y el rol de notificacion\n
            ***${aData.cmdPrefix}unregister***: Remueve el canal agregado al bot y el rol\n
            ***${aData.cmdPrefix}update***: Actualiza los datos\n
            ***${aData.cmdPrefix}gasprice***: Cambia el valor para mandar la alerta; si el valor Avg es igual o menor, envia la alerta uso: ${aData.cmdPrefix}gasprice 50\n
            ***${aData.cmdPrefix}pbprefix***: Cambia el prefijo de los comandos; uso: ${aData.cmdPrefix}pbprefix !!\n
            ***${aData.cmdPrefix}pbrestart***: reinicia todos los valores a default\n`)

            return

        }
        else if (MsgText.startsWith(`${aData.cmdPrefix}pbprefix`)) {

            message.delete();

            let buffer = MsgText.split(' ')

            if (buffer[1]) {

                aData.cmdPrefix = buffer[1]

                await db.Query(`UPDATE ${dbConfig.db_tableS} SET cmdPrefix='${aData.cmdPrefix}' WHERE guildId=${aData.guildId};`).catch(error => console.log(error))

            }

            return
        }
        else if (MsgText.startsWith(`${aData.cmdPrefix}register`) && message.member.hasPermission("ADMINISTRATOR")) {

            message.delete();

            if (aData.channelId == "") {

                aData.channelId = message.channel.id

                if (!message.guild.roles.cache.find(role => role.name === GASROLE)) {

                    message.guild.roles.create({
                        data: {
                            name: GASROLE
                        }
                    }).catch()

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

    if (MsgText.startsWith(`${aData.cmdPrefix}update`)) {

        message.delete();

        if (aData.msgId != '') {

            let handler = await message.channel.messages.fetch(aData.msgId)

            if (!handler) {

                aData.msgId = ''

                return
            }

            UpdateMsg(handler)
        }

        return
    }
    else if (MsgText.startsWith(`${aData.cmdPrefix}unregister`)) {

        message.delete();

        aData.channelId = ''

        clearInterval(aData.intervalId)

        aData.intervalId = null

        if(aData.msgId)
            message.channel.messages.fetch(aData.msgId).then(msgid => msgid.delete()).catch()

        if(aData.notiMsgId)
            message.channel.messages.fetch(aData.notiMsgId).then(msgid => msgid.delete()).catch()

        aData.notiMsgId = ''

        aData.msgId = ''

        await db.Query(`UPDATE ${dbConfig.db_tableS} SET cmdPrefix='${aData.cmdPrefix}', msgId='', notiMsgId='', channelId='' WHERE guildId=${aData.guildId};`).catch(error => console.log(error))

        let role = message.guild.roles.cache.find(role => role.name === GASROLE)

        if (role != null)
            role.delete()

        return
    }
    else if (MsgText.startsWith(`${aData.cmdPrefix}gasprice`)) {

        message.delete();

        let buffer = MsgText.split(' ')

        if (!Number(buffer[1]).isNaN) {

            aData.notiMsgMax = Number(buffer[1])

            await db.Query(`UPDATE ${dbConfig.db_tableS} SET notiMsgMax='${aData.notiMsgMax}' WHERE guildId=${aData.guildId};`).catch(error => console.log(error))

        }

        return
    }

    if (message.channel.id == aData.channelId)
        message.delete();
})

client.on('guildDelete', async (guild) => {

    db.Query(`DELETE FROM ${dbConfig.db_tableS} WHERE guildId=${guild.id};`).catch(error => console.log(error))

})

client.on('messageDelete', async (message) => {

    if (!message.client.user.bot) {

        let aData = guildsData.get(message.guild.id)

        if (message.id != aData.msgId && message.id != aData.notiMsgId)
            return
        else if(message.id === aData.notiMsgId) {

            aData.notiMsgId = ''

            return
        }

        aData.channelId = ''

        clearInterval(aData.intervalId)

        aData.intervalId = ''

        message.channel.messages.fetch(aData.msgId).then(msgid => msgid.delete()).catch()

        message.channel.messages.fetch(aData.notiMsgId).then(msgid => msgid.delete()).catch()

        aData.msgId = ''

        aData.notiMsgId = ''

        db.Query(`UPDATE ${dbConfig.db_tableS} SET cmdPrefix='${aData.cmdPrefix}', msgId='', notiMsgId='', channelId='' WHERE guildId=${aData.guildId};`).catch(error => console.log(error))

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

    let aData = guildsData.get(reaction.message.guild.id)

    if (reaction.message.partial) {

        try {

            let msg = await reaction.message.fetch()

            if (msg.id === aData.msgId)
                ApplyRole()

        }
        catch (error) { console.log(error) }
    }
    else
        if (reaction.message.id === aData.msgId)
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

    let aData = guildsData.get(reaction.message.guild.id)

    if (reaction.message.partial) {

        try {

            let msg = await reaction.message.fetch()

            if (msg.id === aData.msgId)
                RemoveRole()

        }
        catch (error) { console.log(error) }
    }
    else
        if (reaction.message.id === aData.msgId)
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

    let aData = guildsData.get(h_message.guild.id)

    if (type == CREATE) {

        h_message.channel.send(BotMsgText).then(msgid => {

            aData.msgId = msgid.id

            aData.channelId = msgid.channel.id

            aData['intervalId'] = setInterval(UpdateMsg, 900000, msgid)

            msgid.react("⛽")

            db.Query(`UPDATE ${dbConfig.db_tableS} SET cmdPrefix='${aData.cmdPrefix}', msgId='${aData.msgId}', channelId='${aData.channelId}' WHERE guildId=${aData.guildId};`).catch(error => console.log(error))

        }).catch(error => console.log(error))
    }
    else {

        h_message.edit(BotMsgText).then(r => {

            if (avgGwei <= aData.notiMsgMax) {

                if (aData.notiMsgId) {

                    h_message.channel.messages.fetch(aData.notiMsgId).then(msgid => msgid.delete()).catch()

                }

                let role = h_message.guild.roles.cache.find(role => role.name === GASROLE)

                h_message.channel.send(`Low gas price ${role} - ${new Date().toLocaleString("en-GB", { timeZone: "America/Argentina/Buenos_Aires" })}`).then(msgid => {

                    aData.notiMsgId = msgid.id

                    db.Query(`UPDATE ${dbConfig.db_tableS} SET notiMsgId='${aData.notiMsgId}' WHERE guildId=${aData.guildId};`).catch(error => console.log(error))
                })
            }
        })

    }
}

function SetDefault(guild) {

    let role = guild.roles.cache.find(role => role.name === GASROLE)

    if (role != null)
        role.delete()

    let Data = {}

    Data['notiMsgMax'] = 60

    Data['channelId'] = ''

    Data['intervalId'] = ''

    Data['msgId'] = ''

    Data['notiMsgId'] = ''

    Data['cmdPrefix'] = '!'

    Data['guildId'] = guild.id

    guildsData.set(guild.id, Data)

    db.Query(`UPDATE ${dbConfig.db_tableS} SET cmdPrefix='!', msgId='', notiMsgId='', notiMsgMax=60, channelId='' WHERE guildId=${Data.guildId};`).catch(error => console.log(error))

    return
}