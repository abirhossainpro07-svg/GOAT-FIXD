const axios = require("axios");

// 🔹 SAME API as slot.js
const API_URL = "https://balance-bot-api.onrender.com";

// 🔹 Get balance
async function getBalance(userID) {
  try {
    const res = await axios.get(`${API_URL}/api/balance/${userID}`);
    return res.data.balance || 100;
  } catch {
    return 100;
  }
}

// 🔹 Add balance
async function winGame(userID, amount) {
  try {
    const res = await axios.post(`${API_URL}/api/balance/win`, { userID, amount });
    return res.data.success ? res.data.balance : null;
  } catch {
    return null;
  }
}

// 🔹 Lose balance
async function loseGame(userID, amount) {
  try {
    const res = await axios.post(`${API_URL}/api/balance/lose`, { userID, amount });
    return res.data.success ? res.data.balance : null;
  } catch {
    return null;
  }
}

// 🔹 Format balance
function formatBalance(num) {
  return num.toLocaleString("en-US") + " $";
}

module.exports = {
  config: {
    name: "quiz",
    version: "1.1",
    author: "Mᴏʜᴀᴍᴍᴀᴅ Aᴋᴀsʜ",
    role: 0,
    category: "game",
    shortDescription: "Quiz Game (Reply Based)"
  },

  onStart: async function ({ api, event }) {
    const { threadID, senderID, messageID } = event;

    const balance = await getBalance(senderID);
    if (balance < 50) {
      return api.sendMessage(
        `❌ Insufficient Balance!\n💳 Balance: ${formatBalance(balance)}`,
        threadID,
        messageID // ✅ reply to command
      );
    }

    try {
      // ✅ FREE QUIZ API (English)
      const res = await axios.get("https://opentdb.com/api.php?amount=1&type=multiple");
      const q = res.data.results[0];

      const options = [...q.incorrect_answers, q.correct_answer]
        .sort(() => Math.random() - 0.5);

      const answerMap = ["A", "B", "C", "D"];
      const correctIndex = options.indexOf(q.correct_answer);
      const correctAnswer = answerMap[correctIndex];

      const quizMsg =
`✦ Qᴜɪᴢ Gᴀᴍᴇ ✦

${q.question}

🇦 ${options[0]}
🇧 ${options[1]}
🇨 ${options[2]}
🇩 ${options[3]}

✍️ Reply: A / B / C / D`;

      api.sendMessage(
        quizMsg,
        threadID,
        (err, info) => {
          if (err) return;

          global.GoatBot.onReply.set(info.messageID, {
            commandName: "quiz",
            author: senderID,
            correctAnswer,
            messageID: info.messageID
          });

          // ⏳ Auto delete after 30s if no reply
          setTimeout(() => {
            global.GoatBot.onReply.delete(info.messageID);
            api.unsendMessage(info.messageID).catch(() => {});
          }, 30000);
        },
        messageID // ✅ reply to command
      );

    } catch {
      api.sendMessage(
        "❌ Failed to load quiz. Try again.",
        threadID,
        messageID // ✅ reply to command
      );
    }
  },

  onReply: async function ({ api, event, Reply }) {
    const { senderID, body, threadID } = event;
    if (senderID !== Reply.author) return;

    const userAns = body.trim().toUpperCase();
    if (!["A", "B", "C", "D"].includes(userAns)) return;

    await api.unsendMessage(Reply.messageID);
    global.GoatBot.onReply.delete(Reply.messageID);

    if (userAns === Reply.correctAnswer) {
      const newBal = await winGame(senderID, 300);
      return api.sendMessage(
        `✅ Correct Answer!\n🎉 You earned 300 $\n💳 New Balance: ${formatBalance(newBal)}`,
        threadID
      );
    } else {
      const newBal = await loseGame(senderID, 50);
      return api.sendMessage(
        `❌ Wrong Answer!\n−50 $\n💳 Balance: ${formatBalance(newBal)}`,
        threadID
      );
    }
  }
};
