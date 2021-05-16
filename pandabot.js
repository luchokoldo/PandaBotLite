const Discord = require('discord.js');
const fetch = require('node-fetch')
const pjson = require('./package.json');
const dbConfig = require("./database/dbconfig.json");

const client = new Discord.Client({ partials: ['MESSAGE', 'REACTION'] });
const guildsData = new Map()
let db
var gData

const TXPRICE = 0.00002100, CREATE = 0, UPDATE = 1

const APIKEY = 'UUUCXCGM5QMTI8JQJR2VGJ9YNV7KZ3HNQU', GASROLE = 'GasNotification'

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

            message.channel.send(`Comandos disponibles: \n${gData.cmdPrefix}pandabot: Muestra el Autor y la Version del bot\n${gData.cmdPrefix}register: Agregar canal para que solo el bot publique y el rol de notificacion\n${gData.cmdPrefix}unregister: Remueve el canal agregado al bot y el rol\n${gData.cmdPrefix}update: Actualiza los datos`)

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

    if (message.channel.id == gData.channelId)
        message.delete();
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

        lowGwei = Number(webMsg.result.SafeGasPrice)

        avgGwei = Number(webMsg.result.ProposeGasPrice)

        highGwei = Number(webMsg.result.FastGasPrice)

        lastBlock = webMsg.result.LastBlock

        fetch(`https://api.etherscan.io/api?module=stats&action=ethprice&apikey=${APIKEY}`).then(resp => resp.json()).then(webMsg => {

            ethPrice = Number(webMsg.result.ethusd).toFixed(0)

            fetch(`https://api.etherscan.io/api?module=block&action=getblockreward&blockno=${lastBlock}&apikey=${APIKEY}`).then(resp => resp.json()).then(webMsg => {

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

    var aData = guildsData.get(h_message.guild.id)

    if (type == CREATE) {

        h_message.channel.send(BotMsgText).then(msgid => {

            aData.msgId = msgid.id

            aData.channelId = msgid.channel.id

            aData['intervalId'] = setInterval(UpdateMsg, 900000, msgid)

            msgid.react("⛽")

            db.query(`UPDATE ${dbConfig.db_tableS} SET cmdPrefix='${aData.cmdPrefix}', msgId='${aData.msgId}', channelId='${aData.channelId}' WHERE guildId=${aData.guildId};`).catch(error => console.log(error))

        }).catch(error => console.log(error))
    }
    else {

        h_message.edit(BotMsgText).then(r => {

            if (avgGwei <= aData.notiMsgMax) {

                if (aData.notiMsgId) {

                    h_message.channel.messages.fetch(aData.notiMsgId).then(msgid => {

                        if (msgid)
                            msgid.delete().catch(error => console.log(error))

                    }).catch(error => console.log(error))

                }

                let role = h_message.guild.roles.cache.find(role => role.name === GASROLE)

                h_message.channel.send(`Low gas price ${role} - ${new Date().toLocaleString("en-GB", { timeZone: "America/Argentina/Buenos_Aires" })}`).then(msgid => {

                    aData.notiMsgId = msgid.id

                    db.query(`UPDATE ${dbConfig.db_tableS} SET notiMsgId='${aData.notiMsgId}' WHERE guildId=${aData.guildId};`).catch(error => console.log(error))
                })
            }
        })

    }
}