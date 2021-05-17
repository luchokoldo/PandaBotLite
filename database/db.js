const Database = require("mysql2/promise")
const Config = require("./dbconfig.json")
require('dotenv').config()

Config['db_host'] = process.env.HOST
Config['db_user'] = process.env.USER
Config['db_pass'] = process.env.PASS
Config['db_name'] = process.env.NAME

module.exports = Database.createConnection({

    host: Config.db_host,
    user: Config.db_user,
    password: Config.db_pass,
    database: Config.db_name

})