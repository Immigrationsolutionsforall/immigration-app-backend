const express = require("express");
const router = express.Router();
const { processWhatsAppWebhook } = require("../services/whatsappAgent");

router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log("WhatsApp webhook verified.");
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

router.post("/", (req, res) => {
  // Meta requires a fast 200 response. We process asynchronously after acknowledging.
  res.sendStatus(200);

  const enabled = String(process.env.AGENT_WHATSAPP_ENABLED || "false").toLowerCase() === "true";
  if (!enabled) {
    console.log("Incoming WhatsApp webhook received, but AGENT_WHATSAPP_ENABLED is false.", JSON.stringify(req.body));
    return;
  }

  processWhatsAppWebhook(req.body, { dryRun: false })
    .then(result => console.log("WhatsApp IA processed:", JSON.stringify({ count: result.count })))
    .catch(error => console.error("WhatsApp IA processing failed:", error.message, error.stack));
});

module.exports = router;
