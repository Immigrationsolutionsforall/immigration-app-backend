const { google } = require("googleapis");
const { getOAuthClient } = require("./gmail");

function stripHtml(html = "") {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function b64urlDecode(data = "") {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function headersToObject(headers = []) {
  const out = {};
  for (const h of headers) out[String(h.name || "").toLowerCase()] = h.value || "";
  return out;
}

function extractBody(payload) {
  if (!payload) return "";
  if (payload.body && payload.body.data) {
    const raw = b64urlDecode(payload.body.data);
    return payload.mimeType === "text/html" ? stripHtml(raw) : raw.trim();
  }
  const parts = payload.parts || [];
  let plain = "";
  let html = "";
  for (const part of parts) {
    if (part.parts) {
      const nested = extractBody(part);
      if (nested) plain += `\n${nested}`;
    } else if (part.mimeType === "text/plain" && part.body?.data) {
      plain += `\n${b64urlDecode(part.body.data)}`;
    } else if (part.mimeType === "text/html" && part.body?.data) {
      html += `\n${stripHtml(b64urlDecode(part.body.data))}`;
    }
  }
  return (plain || html).trim();
}

async function listRecentEmails({ days = 1, maxResults = 10, queryExtra = "" } = {}) {
  const gmail = google.gmail({ version: "v1", auth: getOAuthClient() });
  const newerThan = `${Math.max(1, Number(days || 1))}d`;
  const query = [`newer_than:${newerThan}`, "-category:promotions", "-category:social", queryExtra].filter(Boolean).join(" ");
  const list = await gmail.users.messages.list({ userId: "me", q: query, maxResults });
  const messages = list.data.messages || [];
  const detailed = [];
  for (const msg of messages) {
    const response = await gmail.users.messages.get({ userId: "me", id: msg.id, format: "full" });
    const data = response.data;
    const headers = headersToObject(data.payload?.headers || []);
    const body = extractBody(data.payload).slice(0, Number(process.env.AGENT_MAX_EMAIL_CHARS || 6000));
    detailed.push({
      id: data.id,
      threadId: data.threadId,
      from: headers.from || "",
      to: headers.to || "",
      subject: headers.subject || "",
      date: headers.date || "",
      snippet: data.snippet || "",
      body,
    });
  }
  return detailed;
}

module.exports = { listRecentEmails };
