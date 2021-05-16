CREATE TABLE Guilds (

    guildId VARCHAR(100) NOT NULL PRIMARY KEY,
    createDate VARCHAR(50) NOT NULL

);

CREATE TABLE GuildConfig (

    guildId VARCHAR(100) NOT NULL PRIMARY KEY,  
    cmdPrefix VARCHAR(10) DEFAULT '!',
    msgId VARCHAR(100) DEFAULT '',
    notiMsgId VARCHAR(100) DEFAULT '',
    notiMsgMax INT DEFAULT 60,
    channelId VARCHAR(100) DEFAULT ''

);