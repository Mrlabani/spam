const fetchAPI = async (endpoint, body, token) => {
  return fetch(`https://api.telegram.org/bot${token}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
};

let warnMap = {}; // In-memory warning cache

export default async function handler(req, res) {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  const ADMIN_ID = process.env.ADMIN_CHAT_ID;

  if (req.method !== "POST") return res.status(200).send("OK");

  const update = req.body;
  const msg = update.message;
  const callbackQuery = update.callback_query;

  if (callbackQuery) {
    const [action, userId, chatId] = callbackQuery.data.split(":");
    if (callbackQuery.from.id.toString() !== ADMIN_ID) return res.status(200).send("Unauthorized");

    if (action === "mute") {
      await fetchAPI("restrictChatMember", {
        chat_id: chatId,
        user_id: userId,
        permissions: { can_send_messages: false },
        until_date: Math.floor(Date.now() / 1000) + 300
      }, BOT_TOKEN);
    } else if (action === "kick") {
      await fetchAPI("banChatMember", { chat_id: chatId, user_id: userId }, BOT_TOKEN);
    }

    await fetchAPI("answerCallbackQuery", {
      callback_query_id: callbackQuery.id,
      text: `${action === "mute" ? "Muted" : "Banned"}`
    }, BOT_TOKEN);
    return res.status(200).send("OK");
  }

  if (!msg || !msg.chat || !msg.from) return res.status(200).send("OK");

  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text || "";
  const username = msg.from.username || msg.from.first_name || "user";
  const isGroup = msg.chat.type.includes("group");

  if (!isGroup) return res.status(200).send("OK");

  // New user CAPTCHA
  if (msg.new_chat_members) {
    await fetchAPI("restrictChatMember", {
      chat_id: chatId,
      user_id: userId,
      permissions: { can_send_messages: false },
      until_date: Math.floor(Date.now() / 1000) + 300
    }, BOT_TOKEN);

    await fetchAPI("sendMessage", {
      chat_id: chatId,
      text: `👋 Welcome ${username}, please verify you're human.`,
      reply_to_message_id: msg.message_id
    }, BOT_TOKEN);
    return res.status(200).send("OK");
  }

  const banned = ["bsdk", "money", "casino", "paisa", "hello", "hii"];
  const linkCount = (text.match(/https?:\/\//g) || []).length;
  const isSpam = banned.some(word => text.toLowerCase().includes(word)) || linkCount > 3;

  if (isSpam) {
    warnMap[chatId] ||= {};
    warnMap[chatId][userId] = (warnMap[chatId][userId] || 0) + 1;

    await fetchAPI("deleteMessage", {
      chat_id: chatId,
      message_id: msg.message_id
    }, BOT_TOKEN);

    const replyText = warnMap[chatId][userId] >= 3
      ? `🚫 ${username} muted for spamming.`
      : `⚠️ Warning ${warnMap[chatId][userId]}/3. _Dev by @l_abani_`;

    const buttons = {
      inline_keyboard: [[
        { text: "Mute", callback_data: `mute:${userId}:${chatId}` },
        { text: "Kick", callback_data: `kick:${userId}:${chatId}` }
      ]]
    };

    await fetchAPI("sendMessage", {
      chat_id: chatId,
      reply_to_message_id: msg.message_id,
      text: replyText,
      parse_mode: "Markdown",
      reply_markup: buttons
    }, BOT_TOKEN);

    if (warnMap[chatId][userId] >= 3) {
      await fetchAPI("restrictChatMember", {
        chat_id: chatId,
        user_id: userId,
        permissions: { can_send_messages: false },
        until_date: Math.floor(Date.now() / 1000) + 60
      }, BOT_TOKEN);
    }
  }

  res.status(200).send("OK");
                      }
