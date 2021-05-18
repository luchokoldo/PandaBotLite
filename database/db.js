const Database = require("mysql2/promise")
const Config = {}
require('dotenv').config()

Config['db_host'] = process.env.HOST
Config['db_user'] = process.env.USER
Config['db_pass'] = process.env.PASS
Config['db_name'] = process.env.NAME
Config['db_table'] = process.env.TABLE

function Connect() {

    return Database.createConnection({

        host: Config.db_host,
        user: Config.db_user,
        password: Config.db_pass,
        database: Config.db_name
    
    })    
}

const Query = async function SendQuery(string) {

    let db = await Connect()

    return db.query(string)

}

module.exports.Query = Query

module.exports.table = Config.db_table