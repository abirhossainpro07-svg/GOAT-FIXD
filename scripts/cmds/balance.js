const { createCanvas } = require('canvas');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const API_URL = "https://balance-bot-api.onrender.com";

// 🔹 Get balance from API
async function getBalance(userID) {
  try {
    const res = await axios.get(`${API_URL}/api/balance/${userID}`, { timeout: 5000 });
    return res.data.balance || 100;
  } catch {
    return 100;
  }
}

// 🔹 Transfer balance between users
async function transferBalance(senderID, receiverID, amount) {
  try {
    const res = await axios.post(`${API_URL}/api/balance/transfer`, { senderID, receiverID, amount });
    return res.data;
  } catch {
    return { success: false, message: "API connection failed." };
  }
}

// 🔹 Format balance compactly
function formatBalance(num) {
  if (num >= 1e9) return (num / 1e9).toFixed(2).replace(/\.00$/, "") + "B $";
  if (num >= 1e6) return (num / 1e6).toFixed(2).replace(/\.00$/, "") + "M $";
  if (num >= 1e3) return (num / 1e3).toFixed(2).replace(/\.00$/, "") + "K $";
  return num + " $";
}

// 🔹 Get card type based on balance
function getCardType(balance) {
  if (balance >= 1000000) return { type: "SAPPHIRE", color: "#0F52BA", level: 7 };
  if (balance >= 250000) return { type: "GOLD", color: "#FFD700", level: 6 };
  if (balance >= 100000) return { type: "SILVER", color: "#C0C0C0", level: 5 };
  if (balance >= 50000) return { type: "PLATINUM", color: "#E5E4E2", level: 4 };
  if (balance >= 10000) return { type: "CLASSIC", color: "#4169E1", level: 3 };
  return { type: "STANDARD", color: "#808080", level: 2 };
}

module.exports.config = {
  name: "balance",
  aliases: ["bal", "bank"],
  version: "12.1",
  author: "MOHAMMAD AKASH",
  countDown: 5,
  role: 0,
  shortDescription: "Bank Card",
  longDescription: "Check balance with bank card",
  category: "economy",
  guide: { en: "{p}balance | {p}balance transfer @user <amount>" }
};

module.exports.onStart = async function ({ api, event, args, usersData }) {
  const { threadID, senderID, messageID, mentions } = event;

  // 💸 Transfer system
  if (args[0] && args[0].toLowerCase() === "transfer") {
    if (!mentions || Object.keys(mentions).length === 0) {
      return api.sendMessage("❌ Mention someone to transfer.", threadID, messageID);
    }
    const targetID = Object.keys(mentions)[0];
    const amount = parseFloat(args[1]);
    if (isNaN(amount) || amount <= 0) return api.sendMessage("❌ Invalid amount.", threadID, messageID);
    if (targetID === senderID) return api.sendMessage("❌ You can't transfer to yourself.", threadID, messageID);

    const transferResult = await transferBalance(senderID, targetID, amount);
    if (!transferResult.success) return api.sendMessage(`❌ ${transferResult.message}`, threadID, messageID);

    const senderName = await usersData.getName(senderID);
    const receiverName = await usersData.getName(targetID);
    return api.sendMessage(
      `✅ Transfer Complete\nFrom: ${senderName}\nTo: ${receiverName}\nAmount: ${formatBalance(amount)}\nNew Balance: ${formatBalance(transferResult.senderBalance)}`,
      threadID, messageID
    );
  }

  try {
    const balance = await getBalance(senderID);
    const userName = await usersData.getName(senderID);
    const cardInfo = getCardType(balance);

    const userIDStr = senderID.toString();
    const cardDigits = userIDStr.padStart(16, '0').slice(-16);
    const cardNumber = `${cardDigits.slice(0, 4)}  ${cardDigits.slice(4, 8)}  ${cardDigits.slice(8, 12)}  ${cardDigits.slice(12, 16)}`;
    const expiryDate = "12/28";
    const cvv = Math.floor(Math.random() * 900) + 100;

    // Canvas setup
    const width = 850;
    const height = 600;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    // Card
    ctx.fillStyle = '#111111';
    roundRect(ctx, 40, 30, width - 80, height - 60, 20, true);

    // Top Left: Bank Name
    ctx.font = 'bold 36px Arial';
    ctx.fillStyle = '#00d4ff';
    ctx.fillText('GLOBAL BANK', 60, 70);

    // Card Number
    ctx.font = '28px "Courier New", monospace';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(cardNumber, 60, 120);

    // Card Type
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    roundRect(ctx, width - 200, 70, 140, 40, 8, true);
    ctx.font = 'bold 24px Arial';
    ctx.fillStyle = cardInfo.color;
    ctx.fillText(cardInfo.type, width - 190, 100);

    // Available Balance
    ctx.fillStyle = 'rgba(0, 212, 255, 0.15)';
    roundRect(ctx, width - 350, 120, 290, 90, 15, true);
    ctx.font = 'bold 20px Arial';
    ctx.fillStyle = '#00d4ff';
    ctx.fillText('AVAILABLE BALANCE', width - 340, 150);

    const balanceText = formatBalance(balance);
    let fontSize = 38;
    if (balanceText.length > 12) fontSize = 32;
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(balanceText, width - 340, 190);

    // Card Holder
    ctx.font = '18px Arial';
    ctx.fillStyle = '#AAAAAA';
    ctx.fillText('CARD HOLDER', 60, 180);

    ctx.font = 'bold 26px Arial';
    ctx.fillStyle = '#FFFFFF';
    let displayName = userName.toUpperCase();
    if (displayName.length > 20) displayName = displayName.substring(0, 20);
    ctx.fillText(displayName, 60, 210);

    // Valid Thru
    ctx.font = '18px Arial';
    ctx.fillStyle = '#AAAAAA';
    ctx.fillText('VALID THRU', 60, 260);
    ctx.font = 'bold 22px Arial';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(expiryDate, 60, 290);

    // CVV
    ctx.font = '18px Arial';
    ctx.fillStyle = '#AAAAAA';
    ctx.fillText('CVV', 200, 260);
    ctx.font = 'bold 22px Arial';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(cvv.toString(), 200, 290);

    // Authorized Signature
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(60, 320, 200, 25);
    ctx.font = 'italic 14px Arial';
    ctx.fillStyle = '#666666';
    ctx.fillText('Authorized Signature', 70, 340);

    // Chip
    ctx.fillStyle = '#FFD700';
    roundRect(ctx, 60, 380, 70, 50, 6, true);
    ctx.fillStyle = '#B8860B';
    for (let i = 0; i < 3; i++) ctx.fillRect(65, 385 + i * 12, 60, 3);

    // Card Rank System
    ctx.font = 'bold 24px Arial';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('CARD RANK SYSTEM:', 60, 460);

    const ranks = ["STANDARD", "CLASSIC", "PLATINUM", "SILVER", "GOLD"];
    let rankX = 60;
    const rankY = 500;
    ctx.font = 'bold 20px Arial';
    for (let i = 0; i < ranks.length; i++) {
      const rank = ranks[i];
      ctx.fillStyle = (cardInfo.type === rank) ? '#00FF00' : '#888888';
      ctx.fillText(rank, rankX, rankY);
      rankX += 140;
    }

    // Payment Logos
    ctx.fillStyle = '#1a1f71';
    ctx.fillRect(width - 250, 380, 100, 40);
    ctx.font = 'bold 30px Arial';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('VISA', width - 230, 410);

    // MasterCard Logo
    ctx.fillStyle = '#EB001B';
    ctx.beginPath();
    ctx.arc(width - 100, 400, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#F79E1B';
    ctx.beginPath();
    ctx.arc(width - 75, 400, 18, 0, Math.PI * 2);
    ctx.fill();

    // Contactless
    ctx.strokeStyle = '#4A90E2';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(180, 405, 10, -Math.PI / 4, Math.PI / 4);
    ctx.stroke();

    // Save and send
    const cacheDir = path.join(__dirname, 'cache');
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    const filePath = path.join(cacheDir, `card_${senderID}.png`);
    fs.writeFileSync(filePath, canvas.toBuffer('image/png'));

    await api.sendMessage({ attachment: fs.createReadStream(filePath) }, threadID, messageID);
    setTimeout(() => { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); }, 10000);

  } catch (err) {
    console.error(err);
    api.sendMessage("❌ Error generating card.", threadID, messageID);
  }
};

// 🔹 Rounded rectangle helper
function roundRect(ctx, x, y, w, h, r, fill = false, stroke = false) {
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}
