const axios = require("axios");
const fs = require("fs");
const path = require("path");
const yts = require("yt-search");

const API_JSON =
  "https://raw.githubusercontent.com/aryannix/stuffs/master/raw/apis.json";

// Fetch Base API
async function getBaseApi() {
  const res = await axios.get(API_JSON);
  if (!res.data || !res.data.api) throw new Error("API not found");
  return res.data.api;
}

module.exports = {
  config: {
    name: "sing",
    aliases: ["music", "song"],
    version: "2.3.0",
    author: "RX api x MOHAMMAD AKASH",
    role: 0,
    category: "media",
    shortDescription: "Download YouTube audio",
    longDescription: "Search or download YouTube music (MP3)",
    guide: "{pn} song name | youtube link"
  },

  onStart: async function ({ api, event, args }) {
    if (!args.length)
      return api.sendMessage(
        "❌ Pʟᴇᴀsᴇ ᴘʀᴏᴠɪᴅᴇ ᴀ sᴏɴɢ ɴᴀᴍᴇ ᴏʀ YᴏᴜTᴜʙᴇ ʟɪɴᴋ.",
        event.threadID,
        event.messageID
      );

    const wait = await api.sendMessage(
      "🎧 Sᴇᴀʀᴄʜɪɴɢ ғᴏʀ ʏᴏᴜʀ sᴏɴɢ...",
      event.threadID,
      null,
      event.messageID
    );

    try {
      const baseApi = await getBaseApi();
      const input = args.join(" ");
      let videoUrl;

      // If input is YouTube link
      if (input.startsWith("http")) {
        videoUrl = input;
      } else {
        // Search YouTube
        const search = await yts(input);
        if (!search.videos.length) throw new Error("No results found");

        const results = search.videos.slice(0, 6);

        let msg = "🎵 Cʜᴏᴏsᴇ ᴀ sᴏɴɢ (ʀᴇᴘʟʏ ᴡɪᴛʜ 1–6):\n\n";
        results.forEach((v, i) => {
          msg += `${i + 1}. ${v.title}\n⏱️ ${v.timestamp}\n📺 ${v.author.name}\n\n`;
        });

        api.unsendMessage(wait.messageID);

        return api.sendMessage(
          msg,
          event.threadID,
          (err, info) => {
            global.GoatBot.onReply.set(info.messageID, {
              commandName: "sing",
              author: event.senderID,
              results
            });
          },
          event.messageID
        );
      }

      // Direct download for link
      await downloadAndSend(api, event, baseApi, videoUrl, wait.messageID);
    } catch (err) {
      console.error(err);
      api.unsendMessage(wait.messageID);
      api.sendMessage(
        "❌ Fᴀɪʟᴇᴅ ᴛᴏ ɢᴇᴛ ʏᴏᴜʀ sᴏɴɢ.",
        event.threadID,
        event.messageID
      );
    }
  },

  onReply: async function ({ api, event, Reply }) {
    if (event.senderID !== Reply.author) return;

    const choice = parseInt(event.body);
    if (isNaN(choice) || choice < 1 || choice > Reply.results.length)
      return api.sendMessage(
        "❌ Iɴᴠᴀʟɪᴅ ᴄʜᴏɪᴄᴇ. Pʟᴇᴀsᴇ ʀᴇᴘʟʏ ᴡɪᴛʜ ᴀ ᴠᴀʟɪᴅ ɴᴜᴍʙᴇʀ.",
        event.threadID,
        event.messageID
      );

    const video = Reply.results[choice - 1];

    try {
      const baseApi = await getBaseApi();
      await downloadAndSend(api, event, baseApi, video.url);
    } catch (e) {
      console.error(e);
      api.sendMessage("❌ Dᴏᴡɴʟᴏᴀᴅ Fᴀɪʟᴇᴅ", event.threadID, event.messageID);
    }
  }
};

// ================= HELPER =================
async function downloadAndSend(api, event, baseApi, videoUrl, unsendId) {
  const tmp = path.join(__dirname, "tmp");
  if (!fs.existsSync(tmp)) fs.mkdirSync(tmp, { recursive: true });

  const apiUrl = `${baseApi}/play?url=${encodeURIComponent(videoUrl)}`;
  const { data } = await axios.get(apiUrl);

  if (!data.status || !data.downloadUrl)
    throw new Error("Invalid API response");

  const filePath = path.join(tmp, `${Date.now()}.mp3`);
  const audio = await axios.get(data.downloadUrl, { responseType: "arraybuffer" });
  fs.writeFileSync(filePath, audio.data);

  if (unsendId) api.unsendMessage(unsendId);

  api.sendMessage(
    {
      body: `🎶 ${data.title}`,
      attachment: fs.createReadStream(filePath)
    },
    event.threadID,
    () => fs.unlinkSync(filePath),
    event.messageID
  );
}
