const fs = require("fs-extra");
const nullAndUndefined = [undefined, null];

function getType(obj) {
    return Object.prototype.toString.call(obj).slice(8, -1);
}

function getRole(threadData, senderID) {
    const adminBot = global.GoatBot.config.adminBot || [];
    if (!senderID) return 0;
    const adminBox = threadData ? threadData.adminIDs || [] : [];
    return adminBot.includes(senderID) ? 2 : adminBox.includes(senderID) ? 1 : 0;
}

function getText(type, reason, time, targetID, lang) {
    const utils = global.utils;
    if (type == "userBanned")
        return utils.getText({ lang, head: "handlerEvents" }, "userBanned", reason, time, targetID);
    else if (type == "threadBanned")
        return utils.getText({ lang, head: "handlerEvents" }, "threadBanned", reason, time, targetID);
    else if (type == "onlyAdminBox")
        return utils.getText({ lang, head: "handlerEvents" }, "onlyAdminBox");
    else if (type == "onlyAdminBot")
        return utils.getText({ lang, head: "handlerEvents" }, "onlyAdminBot");
}

function replaceShortcutInLang(text, prefix, commandName) {
    return text
        .replace(/\{(?:p|prefix)\}/g, prefix)
        .replace(/\{(?:n|name)\}/g, commandName)
        .replace(/\{pn\}/g, `${prefix}${commandName}`);
}

function getRoleConfig(utils, command, isGroup, threadData, commandName) {
    let roleConfig;
    if (utils.isNumber(command.config.role)) {
        roleConfig = { onStart: command.config.role };
    } else if (typeof command.config.role == "object" && !Array.isArray(command.config.role)) {
        if (!command.config.role.onStart) command.config.role.onStart = 0;
        roleConfig = command.config.role;
    } else {
        roleConfig = { onStart: 0 };
    }

    if (isGroup)
        roleConfig.onStart = threadData.data.setRole?.[commandName] ?? roleConfig.onStart;

    for (const key of ["onChat", "onStart", "onReaction", "onReply"]) {
        if (roleConfig[key] == undefined)
            roleConfig[key] = roleConfig.onStart;
    }

    return roleConfig;
}

function isBannedOrOnlyAdmin(userData, threadData, senderID, threadID, isGroup, commandName, message, lang) {
    const config = global.GoatBot.config;
    const { adminBot, hideNotiMessage } = config;

    const infoBannedUser = userData.banned;
    if (infoBannedUser.status == true) {
        const { reason, date } = infoBannedUser;
        if (hideNotiMessage.userBanned == false)
            message.reply(getText("userBanned", reason, date, senderID, lang));
        return true;
    }

    if (
        config.adminOnly.enable == true &&
        !adminBot.includes(senderID) &&
        !config.adminOnly.ignoreCommand.includes(commandName)
    ) {
        if (hideNotiMessage.adminOnly == false)
            message.reply(getText("onlyAdminBot", null, null, null, lang));
        return true;
    }

    if (isGroup == true) {
        if (
            threadData.data.onlyAdminBox === true &&
            !threadData.adminIDs.includes(senderID) &&
            !(threadData.data.ignoreCommanToOnlyAdminBox || []).includes(commandName)
        ) {
            if (!threadData.data.hideNotiMessageOnlyAdminBox)
                message.reply(getText("onlyAdminBox", null, null, null, lang));
            return true;
        }

        const infoBannedThread = threadData.banned;
        if (infoBannedThread.status == true) {
            const { reason, date } = infoBannedThread;
            if (hideNotiMessage.threadBanned == false)
                message.reply(getText("threadBanned", reason, date, threadID, lang));
            return true;
        }
    }
    return false;
}

function createGetText2(langCode, pathCustomLang, prefix, command) {
    const commandType = command.config.countDown ? "command" : "command event";
    const commandName = command.config.name;
    let customLang = {};
    let getText2 = () => { };
    if (fs.existsSync(pathCustomLang))
        customLang = require(pathCustomLang)[commandName]?.text || {};
    if (command.langs || customLang || {}) {
        getText2 = function (key, ...args) {
            let lang = command.langs?.[langCode]?.[key] || customLang[key] || "";
            lang = replaceShortcutInLang(lang, prefix, commandName);
            for (let i = args.length - 1; i >= 0; i--)
                lang = lang.replace(new RegExp(`%${i + 1}`, "g"), args[i]);
            return lang || `❌ Can't find text on language "${langCode}" for ${commandType} "${commandName}" with key "${key}"`;
        };
    }
    return getText2;
}

// --------------------- SMART MENTION RESOLVER FOR FULL NAMES ---------------------
async function resolveMentionFromBody(body, threadID, api, targetName = null) {
    if (!body && !targetName) return null;
    
    try {
        let searchText = targetName;
        
        if (!searchText) {
            // Extract everything after command
            const match = body.match(/^\/(\w+)\s+(.+)/i);
            if (match) {
                searchText = match[2].trim();
            } else {
                return null;
            }
        }
        
        // Remove @ symbol if present
        searchText = searchText.replace(/^@/, "").trim();
        if (!searchText) return null;
        
        const info = await api.getThreadInfo(threadID);
        const userInfo = info.userInfo || [];
        const nicknames = info.nicknames || {};
        
        const searchTextLower = searchText.toLowerCase();
        const searchWords = searchTextLower.split(/\s+/).filter(w => w.length > 0);
        
        const matches = [];
        
        for (const user of userInfo) {
            if (!user.name) continue;
            
            const userName = user.name.toLowerCase();
            const userNick = nicknames[user.id] ? nicknames[user.id].toLowerCase() : "";
            let score = 0;
            
            const scoring = {
                EXACT_NAME_MATCH: 1000,
                EXACT_NICKNAME_MATCH: 900,
                FULL_NAME_WORD_MATCH: 800,
                FIRST_WORD_MATCH: 700,
                PARTIAL_NAME_MATCH: 600,
                PARTIAL_NICKNAME_MATCH: 500,
                SINGLE_WORD_MATCH: 400
            };
            
            // 1. Exact name match
            if (userName === searchTextLower) {
                score += scoring.EXACT_NAME_MATCH;
            }
            
            // 2. Exact nickname match
            if (userNick && userNick === searchTextLower) {
                score += scoring.EXACT_NICKNAME_MATCH;
            }
            
            // 3. Full name word-by-word matching
            if (searchWords.length > 1) {
                const nameWords = userName.split(/\s+/);
                let allWordsMatch = true;
                let matchedWords = 0;
                
                for (const searchWord of searchWords) {
                    let wordFound = false;
                    for (const nameWord of nameWords) {
                        if (nameWord === searchWord) {
                            wordFound = true;
                            matchedWords++;
                            break;
                        }
                    }
                    if (!wordFound) {
                        allWordsMatch = false;
                    }
                }
                
                if (allWordsMatch) {
                    score += scoring.FULL_NAME_WORD_MATCH + (matchedWords * 50);
                }
            }
            
            // 4. First word exact match
            const firstSearchWord = searchWords[0];
            const nameWords = userName.split(/\s+/);
            
            if (nameWords[0] === firstSearchWord) {
                score += scoring.FIRST_WORD_MATCH;
                
                // Bonus if second word also matches
                if (searchWords.length > 1 && nameWords.length > 1) {
                    const secondSearchWord = searchWords[1];
                    if (nameWords[1].includes(secondSearchWord)) {
                        score += 300;
                    }
                }
            }
            
            // 5. Partial name match
            if (userName.includes(searchTextLower)) {
                score += scoring.PARTIAL_NAME_MATCH;
            }
            
            // 6. Partial nickname match
            if (userNick && userNick.includes(searchTextLower)) {
                score += scoring.PARTIAL_NICKNAME_MATCH;
            }
            
            // 7. Individual word matching
            for (const searchWord of searchWords) {
                for (const nameWord of nameWords) {
                    if (nameWord === searchWord) {
                        score += scoring.SINGLE_WORD_MATCH;
                    } else if (nameWord.startsWith(searchWord)) {
                        score += 250;
                    } else if (nameWord.includes(searchWord)) {
                        score += 150;
                    }
                }
                
                if (userNick) {
                    const nickWords = userNick.split(/\s+/);
                    for (const nickWord of nickWords) {
                        if (nickWord === searchWord) {
                            score += scoring.SINGLE_WORD_MATCH - 50;
                        }
                    }
                }
            }
            
            if (score > 0) {
                matches.push({
                    id: user.id,
                    name: user.name,
                    nickname: userNick,
                    score: score,
                    nameLength: userName.length
                });
            }
        }
        
        matches.sort((a, b) => {
            if (b.score !== a.score) {
                return b.score - a.score;
            }
            return a.nameLength - b.nameLength;
        });
        
        return matches.length > 0 ? matches[0].id : null;
        
    } catch (error) {
        console.error("Error in resolveMentionFromBody:", error);
        return null;
    }
}

module.exports = function (api, threadModel, userModel, dashBoardModel, globalModel, usersData, threadsData, dashBoardData, globalData) {
    return async function (event, message) {
        const { utils, client, GoatBot } = global;
        const { getPrefix, removeHomeDir, log, getTime } = utils;
        const { config, configCommands: { envGlobal, envCommands, envEvents } } = GoatBot;
        const { autoRefreshThreadInfoFirstTime } = config.database;
        let { hideNotiMessage = {} } = config;

        const { body, messageID, threadID, isGroup } = event;
        if (!threadID) return;

        const senderID = event.userID || event.senderID || event.author;
        let threadData = global.db.allThreadData.find(t => t.threadID == threadID);
        let userData = global.db.allUserData.find(u => u.userID == senderID);

        if (!userData && !isNaN(senderID))
            userData = await usersData.create(senderID);
        if (!threadData && !isNaN(threadID)) {
            if (global.temp.createThreadDataError.includes(threadID)) return;
            threadData = await threadsData.create(threadID);
            global.db.receivedTheFirstMessage[threadID] = true;
        } else {
            if (
                autoRefreshThreadInfoFirstTime === true &&
                !global.db.receivedTheFirstMessage[threadID]
            ) {
                global.db.receivedTheFirstMessage[threadID] = true;
                await threadsData.refreshInfo(threadID);
            }
        }

        if (typeof threadData.settings.hideNotiMessage == "object")
            hideNotiMessage = threadData.settings.hideNotiMessage;

        const prefix = getPrefix(threadID);
        const role = getRole(threadData, senderID);

        const parameters = {
            api, usersData, threadsData, message, event, userModel, threadModel, prefix, dashBoardModel, globalModel, dashBoardData, globalData, envCommands, envEvents, envGlobal, role,
            removeCommandNameFromBody: function removeCommandNameFromBody(body_, prefix_, commandName_) {
                if ([body_, prefix_, commandName_].every(x => nullAndUndefined.includes(x)))
                    throw new Error("Please provide body, prefix and commandName to use this function, this function without parameters only support for onStart");
                for (let i = 0; i < arguments.length; i++)
                    if (typeof arguments[i] != "string")
                        throw new Error(`The parameter "${i + 1}" must be a string, but got "${getType(arguments[i])}"`);
                return body_.replace(new RegExp(`^${prefix_}(\\s+|)${commandName_}`, "i"), "").trim();
            },
            resolveMentionFromBody: (bodyText, targetName) => resolveMentionFromBody(bodyText, threadID, api, targetName)
        };

        const langCode = threadData.data.lang || config.language || "en";

        function createMessageSyntaxError(commandName) {
            message.SyntaxError = async function () {
                return await message.reply(
                    utils.getText({ lang: langCode, head: "handlerEvents" }, "commandSyntaxError", prefix, commandName)
                );
            };
        }

        let isUserCallCommand = false;

        async function onStart() {
            let usedPrefix = false;
            const mentions = event.mentions || {};
            const mentionIDs = Object.keys(mentions);

            if (mentionIDs.length > 0) {
                event.mentions = mentions;
            } else if (event.messageReply && event.messageReply.senderID) {
                event.mentions = { [event.messageReply.senderID]: "" };
            } else {
                const tagMatch = body.match(/@([^ ]+)/);
                if (tagMatch) {
                    const tagName = tagMatch[1].toLowerCase();
                    const foundID = await resolveMentionFromBody(body, threadID, api, tagName);
                    if (foundID) {
                        event.mentions = { [foundID]: "" };
                    }
                }
            }

            if (!body || !body.startsWith(prefix)) return;

            const dateNow = Date.now();
            const args = body.slice(prefix.length).trim().split(/ +/);
            let commandName = args.shift().toLowerCase();
            let command = GoatBot.commands.get(commandName) || GoatBot.commands.get(GoatBot.aliases.get(commandName));

            const aliasesData = threadData.data.aliases || {};
            for (const cmdName in aliasesData) {
                if (aliasesData[cmdName].includes(commandName)) {
                    command = GoatBot.commands.get(cmdName);
                    break;
                }
            }

            if (command) commandName = command.config.name;

            // ---------- SMART MENTION HANDLING FOR FULL NAMES ----------
            if (args.length > 0) {
                const firstArg = args[0];
                
                // Check if it's a mention (starts with @) and not a numeric ID
                if (firstArg.startsWith('@') && !/^\d+$/.test(firstArg.slice(1))) {
                    // Join all args to capture full name (e.g., "@akash mia")
                    const fullSearchText = args.join(" ").replace(/^@/, "");
                    
                    if (fullSearchText.includes(' ')) {
                        // This is a multi-word name like "akash mia"
                        const foundID = await resolveMentionFromBody(body, threadID, api, fullSearchText);
                        if (foundID) {
                            // Replace the first arg with the found ID
                            args[0] = foundID;
                            // Remove the rest of the args
                            while (args.length > 1) args.pop();
                        }
                    }
                } else if (!/^\d+$/.test(firstArg) && !firstArg.startsWith('@')) {
                    // Handle names without @ (e.g., "akash mia")
                    const fullSearchText = args.join(" ");
                    
                    if (fullSearchText.includes(' ')) {
                        const foundID = await resolveMentionFromBody(body, threadID, api, fullSearchText);
                        if (foundID) {
                            args[0] = foundID;
                            while (args.length > 1) args.pop();
                        }
                    }
                }
            }

            function removeCommandNameFromBody(body_, prefix_, commandName_) {
                if (arguments.length) {
                    if (typeof body_ != "string")
                        throw new Error(`The first argument (body) must be a string, but got "${getType(body_)}"`);
                    if (typeof prefix_ != "string")
                        throw new Error(`The second argument (prefix) must be a string, but got "${getType(prefix_)}"`);
                    if (typeof commandName_ != "string")
                        throw new Error(`The third argument (commandName) must be a string, but got "${getType(commandName_)}"`);
                    return body_.replace(new RegExp(`^${prefix_}(\\s+|)${commandName_}`, "i"), "").trim();
                } else {
                    return body.replace(new RegExp(`^${prefix}(\\s+|)${commandName}`, "i"), "").trim();
                }
            }

            if (isBannedOrOnlyAdmin(userData, threadData, senderID, threadID, isGroup, commandName, message, langCode))
                return;

            if (!command)
                if (!hideNotiMessage.commandNotFound)
                    return await message.reply(
                        commandName
                            ? utils.getText({ lang: langCode, head: "handlerEvents" }, "commandNotFound", commandName, prefix)
                            : utils.getText({ lang: langCode, head: "handlerEvents" }, "commandNotFound2", prefix)
                    );
                else
                    return true;

            const roleConfig = getRoleConfig(utils, command, isGroup, threadData, commandName);
            const needRole = roleConfig.onStart;
            if (needRole > role) {
                if (!hideNotiMessage.needRoleToUseCmd) {
                    if (needRole == 1)
                        return await message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "onlyAdmin", commandName));
                    else if (needRole == 2)
                        return await message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "onlyAdminBot2", commandName));
                } else {
                    return true;
                }
            }

            if (!client.countDown[commandName]) client.countDown[commandName] = {};
            const timestamps = client.countDown[commandName];
            let getCoolDown = command.config.countDown;
            if (!getCoolDown && getCoolDown != 0 || isNaN(getCoolDown)) getCoolDown = 1;
            const cooldownCommand = getCoolDown * 1000;

            if (timestamps[senderID]) {
                const expirationTime = timestamps[senderID] + cooldownCommand;
                if (dateNow < expirationTime)
                    return await message.reply(
                        utils.getText(
                            { lang: langCode, head: "handlerEvents" },
                            "waitingForCommand",
                            ((expirationTime - dateNow) / 1000).toString().slice(0, 3)
                        )
                    );
            }

            const time = getTime("DD/MM/YYYY HH:mm:ss");
            isUserCallCommand = true;

            try {
                (async () => {
                    const analytics = await globalData.get("analytics", "data", {});
                    if (!analytics[commandName]) analytics[commandName] = 0;
                    analytics[commandName]++;
                    await globalData.set("analytics", analytics, "data");
                })();

                createMessageSyntaxError(commandName);
                const getText2 = createGetText2(langCode, `${process.cwd()}/languages/cmds/${langCode}.js`, prefix, command);
                
                await command.onStart({ 
                    ...parameters, 
                    args, 
                    commandName, 
                    getLang: getText2, 
                    removeCommandNameFromBody 
                });
                
                timestamps[senderID] = dateNow;
                log.info("CALL COMMAND", `${commandName} | ${userData.name} | ${senderID} | ${threadID} | ${args.join(" ")}`);
            } catch (err) {
                log.err("CALL COMMAND", `An error occurred when calling the command ${commandName}`, err);
                return await message.reply(
                    utils.getText(
                        { lang: langCode, head: "handlerEvents" },
                        "errorOccurred",
                        time,
                        commandName,
                        removeHomeDir(err.stack ? err.stack.split("\n").slice(0, 5).join("\n") : JSON.stringify(err, null, 2))
                    )
                );
            }
        }

        async function onChat() {
            const allOnChat = GoatBot.onChat || [];
            const args = body ? body.split(/ +/) : [];
            for (const key of allOnChat) {
                const command = GoatBot.commands.get(key);
                if (!command) continue;
                const commandName = command.config.name;
                const roleConfig = getRoleConfig(utils, command, isGroup, threadData, commandName);
                const needRole = roleConfig.onChat;
                if (needRole > role) continue;

                const getText2 = createGetText2(langCode, `${process.cwd()}/languages/cmds/${langCode}.js`, prefix, command);
                const time = getTime("DD/MM/YYYY HH:mm:ss");
                createMessageSyntaxError(commandName);
                if (getType(command.onChat) == "Function") {
                    const defaultOnChat = command.onChat;
                    command.onChat = async function () {
                        return defaultOnChat(...arguments);
                    };
                }
                command
                    .onChat({ ...parameters, isUserCallCommand, args, commandName, getLang: getText2 })
                    .then(async (handler) => {
                        if (typeof handler == "function") {
                            if (isBannedOrOnlyAdmin(userData, threadData, senderID, threadID, isGroup, commandName, message, langCode))
                                return;
                            try {
                                await handler();
                                log.info("onChat", `${commandName} | ${userData.name} | ${senderID} | ${threadID} | ${args.join(" ")}`);
                            } catch (err) {
                                await message.reply(
                                    utils.getText(
                                        { lang: langCode, head: "handlerEvents" },
                                        "errorOccurred2",
                                        time,
                                        commandName,
                                        removeHomeDir(err.stack ? err.stack.split("\n").slice(0, 5).join("\n") : JSON.stringify(err, null, 2))
                                    )
                                );
                            }
                        }
                    })
                    .catch((err) => {
                        log.err("onChat", `An error occurred when calling the command onChat ${commandName}`, err);
                    });
            }
        }

        async function onAnyEvent() {
            const allOnAnyEvent = GoatBot.onAnyEvent || [];
            let args = [];
            if (typeof event.body == "string" && event.body.startsWith(prefix)) args = event.body.split(/ +/);
            for (const key of allOnAnyEvent) {
                if (typeof key !== "string") continue;
                const command = GoatBot.commands.get(key);
                if (!command) continue;
                const commandName = command.config.name;
                const time = getTime("DD/MM/YYYY HH:mm:ss");
                createMessageSyntaxError(commandName);
                const getText2 = createGetText2(langCode, `${process.cwd()}/languages/events/${langCode}.js`, prefix, command);
                if (getType(command.onAnyEvent) == "Function") {
                    const defaultOnAnyEvent = command.onAnyEvent;
                    command.onAnyEvent = async function () {
                        return defaultOnAnyEvent(...arguments);
                    };
                }
                command
                    .onAnyEvent({ ...parameters, args, commandName, getLang: getText2 })
                    .then(async (handler) => {
                        if (typeof handler == "function") {
                            try {
                                await handler();
                                log.info("onAnyEvent", `${commandName} | ${senderID} | ${userData.name} | ${threadID}`);
                            } catch (err) {
                                message.reply(
                                    utils.getText(
                                        { lang: langCode, head: "handlerEvents" },
                                        "errorOccurred7",
                                        time,
                                        commandName,
                                        removeHomeDir(err.stack ? err.stack.split("\n").slice(0, 5).join("\n") : JSON.stringify(err, null, 2))
                                    )
                                );
                                log.err("onAnyEvent", `An error occurred when calling the command onAnyEvent ${commandName}`, err);
                            }
                        }
                    })
                    .catch((err) => {
                        log.err("onAnyEvent", `An error occurred when calling the command onAnyEvent ${commandName}`, err);
                    });
            }
        }

        async function onFirstChat() {
            const allOnFirstChat = GoatBot.onFirstChat || [];
            const args = body ? body.split(/ +/) : [];
            for (const itemOnFirstChat of allOnFirstChat) {
                const { commandName, threadIDsChattedFirstTime } = itemOnFirstChat;
                if (threadIDsChattedFirstTime.includes(threadID)) continue;
                const command = GoatBot.commands.get(commandName);
                if (!command) continue;
                itemOnFirstChat.threadIDsChattedFirstTime.push(threadID);
                const getText2 = createGetText2(langCode, `${process.cwd()}/languages/cmds/${langCode}.js`, prefix, command);
                const time = getTime("DD/MM/YYYY HH:mm:ss");
                createMessageSyntaxError(commandName);
                if (getType(command.onFirstChat) == "Function") {
                    const defaultOnFirstChat = command.onFirstChat;
                    command.onFirstChat = async function () {
                        return defaultOnFirstChat(...arguments);
                    };
                }
                command
                    .onFirstChat({ ...parameters, isUserCallCommand, args, commandName, getLang: getText2 })
                    .then(async (handler) => {
                        if (typeof handler == "function") {
                            if (isBannedOrOnlyAdmin(userData, threadData, senderID, threadID, isGroup, commandName, message, langCode))
                                return;
                            try {
                                await handler();
                                log.info("onFirstChat", `${commandName} | ${userData.name} | ${senderID} | ${threadID} | ${args.join(" ")}`);
                            } catch (err) {
                                await message.reply(
                                    utils.getText(
                                        { lang: langCode, head: "handlerEvents" },
                                        "errorOccurred2",
                                        time,
                                        commandName,
                                        removeHomeDir(err.stack ? err.stack.split("\n").slice(0, 5).join("\n") : JSON.stringify(err, null, 2))
                                    )
                                );
                            }
                        }
                    })
                    .catch((err) => {
                        log.err("onFirstChat", `An error occurred when calling the command onFirstChat ${commandName}`, err);
                    });
            }
        }

        async function onReply() {
            if (!event.messageReply) return;
            const { onReply } = GoatBot;
            const Reply = onReply.get(event.messageReply.messageID);
            if (!Reply) return;
            Reply.delete = () => onReply.delete(messageID);
            const commandName = Reply.commandName;
            if (!commandName) {
                message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "cannotFindCommandName"));
                return log.err("onReply", `Can't find command name to execute this reply!`, Reply);
            }
            const command = GoatBot.commands.get(commandName);
            if (!command) {
                message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "cannotFindCommand", commandName));
                return log.err("onReply", `Command "${commandName}" not found`, Reply);
            }
            const roleConfig = getRoleConfig(utils, command, isGroup, threadData, commandName);
            const needRole = roleConfig.onReply;
            if (needRole > role) {
                if (!hideNotiMessage.needRoleToUseCmdOnReply) {
                    if (needRole == 1)
                        return await message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "onlyAdminToUseOnReply", commandName));
                    else if (needRole == 2)
                        return await message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "onlyAdminBot2ToUseOnReply", commandName));
                } else {
                    return true;
                }
            }
            const getText2 = createGetText2(langCode, `${process.cwd()}/languages/cmds/${langCode}.js`, prefix, command);
            const time = getTime("DD/MM/YYYY HH:mm:ss");
            try {
                if (!command) throw new Error(`Cannot find command with commandName: ${commandName}`);
                const args = body ? body.split(/ +/) : [];
                createMessageSyntaxError(commandName);
                if (isBannedOrOnlyAdmin(userData, threadData, senderID, threadID, isGroup, commandName, message, langCode))
                    return;
                await command.onReply({ ...parameters, Reply, args, commandName, getLang: getText2 });
                log.info("onReply", `${commandName} | ${userData.name} | ${senderID} | ${threadID} | ${args.join(" ")}`);
            } catch (err) {
                log.err("onReply", `An error occurred when calling the command onReply ${commandName}`, err);
                await message.reply(
                    utils.getText(
                        { lang: langCode, head: "handlerEvents" },
                        "errorOccurred3",
                        time,
                        commandName,
                        removeHomeDir(err.stack ? err.stack.split("\n").slice(0, 5).join("\n") : JSON.stringify(err, null, 2))
                    )
                );
            }
        }

        async function onReaction() {
            const { onReaction } = GoatBot;
            const Reaction = onReaction.get(messageID);
            if (!Reaction) return;
            Reaction.delete = () => onReaction.delete(messageID);
            const commandName = Reaction.commandName;
            if (!commandName) {
                message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "cannotFindCommandName"));
                return log.err("onReaction", `Can't find command name to execute this reaction!`, Reaction);
            }
            const command = GoatBot.commands.get(commandName);
            if (!command) {
                message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "cannotFindCommand", commandName));
                return log.err("onReaction", `Command "${commandName}" not found`, Reaction);
            }
            const roleConfig = getRoleConfig(utils, command, isGroup, threadData, commandName);
            const needRole = roleConfig.onReaction;
            if (needRole > role) {
                if (!hideNotiMessage.needRoleToUseCmdOnReaction) {
                    if (needRole == 1)
                        return await message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "onlyAdminToUseOnReaction", commandName));
                    else if (needRole == 2)
                        return await message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "onlyAdminBot2ToUseOnReaction", commandName));
                } else {
                    return true;
                }
            }
            const time = getTime("DD/MM/YYYY HH:mm:ss");
            try {
                if (!command) throw new Error(`Cannot find command with commandName: ${commandName}`);
                const getText2 = createGetText2(langCode, `${process.cwd()}/languages/cmds/${langCode}.js`, prefix, command);
                const args = [];
                createMessageSyntaxError(commandName);
                if (isBannedOrOnlyAdmin(userData, threadData, senderID, threadID, isGroup, commandName, message, langCode))
                    return;
                await command.onReaction({ ...parameters, Reaction, args, commandName, getLang: getText2 });
                log.info("onReaction", `${commandName} | ${userData.name} | ${senderID} | ${threadID} | ${event.reaction}`);
            } catch (err) {
                log.err("onReaction", `An error occurred when calling the command onReaction ${commandName}`, err);
                await message.reply(
                    utils.getText(
                        { lang: langCode, head: "handlerEvents" },
                        "errorOccurred4",
                        time,
                        commandName,
                        removeHomeDir(err.stack ? err.stack.split("\n").slice(0, 5).join("\n") : JSON.stringify(err, null, 2))
                    )
                );
            }
        }

        async function handlerEvent() {
            const { author } = event;
            const allEventCommand = GoatBot.eventCommands.entries();
            for (const [key] of allEventCommand) {
                const getEvent = GoatBot.eventCommands.get(key);
                if (!getEvent) continue;
                const commandName = getEvent.config.name;
                const getText2 = createGetText2(langCode, `${process.cwd()}/languages/events/${langCode}.js`, prefix, getEvent);
                const time = getTime("DD/MM/YYYY HH:mm:ss");
                try {
                    const handler = await getEvent.onStart({ ...parameters, commandName, getLang: getText2 });
                    if (typeof handler == "function") {
                        await handler();
                        log.info("EVENT COMMAND", `Event: ${commandName} | ${author} | ${userData.name} | ${threadID}`);
                    }
                } catch (err) {
                    log.err("EVENT COMMAND", `An error occurred when calling the command event ${commandName}`, err);
                    await message.reply(
                        utils.getText(
                            { lang: langCode, head: "handlerEvents" },
                            "errorOccurred5",
                            time,
                            commandName,
                            removeHomeDir(err.stack ? err.stack.split("\n").slice(0, 5).join("\n") : JSON.stringify(err, null, 2))
                        )
                    );
                }
            }
        }

        async function onEvent() {
            const allOnEvent = GoatBot.onEvent || [];
            const args = [];
            const { author } = event;
            for (const key of allOnEvent) {
                if (typeof key !== "string") continue;
                const command = GoatBot.commands.get(key);
                if (!command) continue;
                const commandName = command.config.name;
                const time = getTime("DD/MM/YYYY HH:mm:ss");
                createMessageSyntaxError(commandName);
                const getText2 = createGetText2(langCode, `${process.cwd()}/languages/events/${langCode}.js`, prefix, command);
                if (getType(command.onEvent) == "Function") {
                    const defaultOnEvent = command.onEvent;
                    command.onEvent = async function () {
                        return defaultOnEvent(...arguments);
                    };
                }
                command
                    .onEvent({ ...parameters, args, commandName, getLang: getText2 })
                    .then(async (handler) => {
                        if (typeof handler == "function") {
                            try {
                                await handler();
                                log.info("onEvent", `${commandName} | ${author} | ${userData.name} | ${threadID}`);
                            } catch (err) {
                                message.reply(
                                    utils.getText(
                                        { lang: langCode, head: "handlerEvents" },
                                        "errorOccurred6",
                                        time,
                                        commandName,
                                        removeHomeDir(err.stack ? err.stack.split("\n").slice(0, 5).join("\n") : JSON.stringify(err, null, 2))
                                    )
                                );
                                log.err("onEvent", `An error occurred when calling the command onEvent ${commandName}`, err);
                            }
                        }
                    })
                    .catch((err) => {
                        log.err("onEvent", `An error occurred when calling the command onEvent ${commandName}`, err);
                    });
            }
        }

        async function presence() {}
        async function read_receipt() {}
        async function typ() {}

        return {
            onAnyEvent,
            onFirstChat,
            onChat,
            onStart,
            onReaction,
            onReply,
            onEvent,
            handlerEvent,
            presence,
            read_receipt,
            typ
        };
    };
};
