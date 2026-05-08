const { listRecentEmails } = require("./gmailReader");
const { analyzeEmail } = require("./aiAnalyzer");
const { createInteractionLog, searchMasterClients, updateMasterClient } = require("./agentAirtable");

async function processRecentGmail({ days = 1, maxResults = 10, dryRun = false } = {}) {
  const emails = await listRecentEmails({ days, maxResults });
  const processed = [];
  for (const email of emails) {
    const analysis = await analyzeEmail(email);
    const matchedClient = await searchMasterClients(email, analysis);
    let interaction = null;
    let updatedClient = null;
    if (!dryRun) {
      interaction = await createInteractionLog({ email, analysis, matchedClient });
      if (matchedClient) updatedClient = await updateMasterClient(matchedClient, analysis);
    }
    processed.push({
      email: { id: email.id, from: email.from, subject: email.subject, date: email.date },
      analysis,
      matchedClient: matchedClient ? { id: matchedClient.id, cliente: matchedClient.cliente } : null,
      interactionId: interaction?.id || null,
      updatedClientId: updatedClient?.id || null,
    });
  }
  return { ok: true, dryRun, count: processed.length, processed };
}

module.exports = { processRecentGmail };
