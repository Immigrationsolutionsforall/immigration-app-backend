const { analyzeWhatsAppMessage } = require("./aiAnalyzer");
const { createInteractionLogGeneric, searchMasterClientsByContact, updateMasterClientGeneric, createNewWhatsAppClient } = require("./agentAirtable");

function normalizeInboundMessage(rawMessage, contact) {
  const type = rawMessage.type || "unknown";
  let text = "";
  if (type === "text") text = rawMessage.text?.body || "";
  else if (type === "button") text = rawMessage.button?.text || rawMessage.button?.payload || "";
  else if (type === "interactive") text = rawMessage.interactive?.button_reply?.title || rawMessage.interactive?.list_reply?.title || JSON.stringify(rawMessage.interactive || {});
  else if (type === "image") text = rawMessage.image?.caption || "Imagen recibida";
  else if (type === "document") text = rawMessage.document?.caption || rawMessage.document?.filename || "Documento recibido";
  else if (type === "audio") text = "Audio recibido";
  else text = JSON.stringify(rawMessage[type] || rawMessage).slice(0, 1000);

  return {
    id: rawMessage.id,
    from: rawMessage.from,
    type,
    timestamp: rawMessage.timestamp ? new Date(Number(rawMessage.timestamp) * 1000).toISOString() : new Date().toISOString(),
    profileName: contact?.profile?.name || "",
    text,
  };
}

function extractMessagesFromWebhook(payload) {
  const out = [];
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const contacts = value.contacts || [];
      const messages = value.messages || [];
      for (const msg of messages) {
        const contact = contacts.find(c => c.wa_id === msg.from) || contacts[0] || null;
        out.push(normalizeInboundMessage(msg, contact));
      }
    }
  }
  return out;
}

async function processWhatsAppMessage(message, { dryRun = false } = {}) {
  const analysis = await analyzeWhatsAppMessage(message);
  let matchedClient = await searchMasterClientsByContact({
    phone: message.from || analysis.contactoDetectado,
    name: analysis.clienteDetectado || message.profileName,
  });

  const createNewEnabled = String(process.env.AGENT_WHATSAPP_CREATE_NEW_CLIENTS || "false").toLowerCase() === "true";
  const result = { message, analysis, matchedClient, createdClient: null, interactionRecord: null, updatedClient: null };
  if (!dryRun) {
    if (!matchedClient && createNewEnabled) {
      result.createdClient = await createNewWhatsAppClient({ message, analysis });
      matchedClient = result.createdClient;
      result.matchedClient = matchedClient;
    }

    result.interactionRecord = await createInteractionLogGeneric({
      channel: "WhatsApp",
      source: message,
      analysis,
      matchedClient,
    });
    if (matchedClient) {
      result.updatedClient = await updateMasterClientGeneric(matchedClient, analysis, "WhatsApp");
    }
  }
  return result;
}

async function processWhatsAppWebhook(payload, { dryRun = false } = {}) {
  const messages = extractMessagesFromWebhook(payload);
  const results = [];
  for (const message of messages) {
    results.push(await processWhatsAppMessage(message, { dryRun }));
  }
  return { ok: true, count: results.length, results };
}

module.exports = { extractMessagesFromWebhook, processWhatsAppMessage, processWhatsAppWebhook };
