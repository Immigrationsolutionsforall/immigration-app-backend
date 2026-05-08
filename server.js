require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cron = require("node-cron");
const { buildDailyReport, buildWhatsAppDailyReport, buildBothReports } = require("./services/report");
const { sendEmail } = require("./services/gmail");
const { sendWhatsAppReport } = require("./services/whatsapp");
const whatsappWebhookRoutes = require("./routes/whatsappWebhook");
const gmailAuthRoutes = require("./routes/gmailAuth");
const { processRecentGmail } = require("./services/gmailAgent");
const { processWhatsAppMessage, processWhatsAppWebhook } = require("./services/whatsappAgent");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/", (req, res) => res.json({ ok: true, name: "Secretaria Operativa AI Backend", status: "running" }));
app.get("/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.get("/report/preview", async (req, res) => {
  try { res.type("text/plain").send(await buildDailyReport()); }
  catch (e) { console.error(e); res.status(500).json({ ok:false, error:e.message }); }
});

app.get("/report/preview-full", async (req, res) => {
  try { res.type("text/plain").send(await buildDailyReport()); }
  catch (e) { console.error(e); res.status(500).json({ ok:false, error:e.message }); }
});

app.get("/report/preview-whatsapp", async (req, res) => {
  try { res.type("text/plain").send(await buildWhatsAppDailyReport()); }
  catch (e) { console.error(e); res.status(500).json({ ok:false, error:e.message }); }
});

app.post("/tasks/send-daily-report", async (req, res) => {
  try {
    const { emailReport, whatsappReport } = await buildBothReports();
    const results = {};
    if (process.env.EMAIL_REPORT_TO) {
      results.email = await sendEmail({ to: process.env.EMAIL_REPORT_TO, subject: `Reporte diario operativo - ${new Date().toLocaleDateString("en-US")}`, text: emailReport });
    }
    if (process.env.WHATSAPP_REPORT_TO) {
      results.whatsapp = await sendWhatsAppReport({ to: process.env.WHATSAPP_REPORT_TO, report: whatsappReport });
    }
    res.json({ ok:true, results, emailReport, whatsappReport });
  } catch (e) { console.error(e); res.status(500).json({ ok:false, error:e.message }); }
});


app.get("/agent/gmail/preview", async (req, res) => {
  try {
    const days = Number(req.query.days || 3);
    const maxResults = Number(req.query.maxResults || process.env.AGENT_MAX_EMAILS || 10);
    const result = await processRecentGmail({ days, maxResults, dryRun: true });
    res.json(result);
  } catch (e) { console.error(e); res.status(500).json({ ok:false, error:e.message }); }
});

app.post("/agent/gmail/process", async (req, res) => {
  try {
    const days = Number(req.body?.days || req.query.days || 1);
    const maxResults = Number(req.body?.maxResults || req.query.maxResults || process.env.AGENT_MAX_EMAILS || 10);
    const result = await processRecentGmail({ days, maxResults, dryRun: false });
    res.json(result);
  } catch (e) { console.error(e); res.status(500).json({ ok:false, error:e.message }); }
});

app.post("/tasks/process-gmail-daily", async (req, res) => {
  try {
    const result = await processRecentGmail({ days: 1, maxResults: Number(process.env.AGENT_MAX_EMAILS || 10), dryRun: false });
    res.json(result);
  } catch (e) { console.error(e); res.status(500).json({ ok:false, error:e.message }); }
});



app.post("/agent/whatsapp/test", async (req, res) => {
  try {
    const message = {
      id: `manual-test-${Date.now()}`,
      from: req.body?.from || req.query.from || process.env.WHATSAPP_REPORT_TO || "13464827728",
      type: "text",
      timestamp: new Date().toISOString(),
      profileName: req.body?.profileName || req.query.profileName || "Prueba WhatsApp",
      text: req.body?.text || req.query.text || "Hola, ya hice el pago y envié el comprobante.",
    };
    const dryRun = String(req.body?.dryRun ?? req.query.dryRun ?? "true").toLowerCase() !== "false";
    const result = await processWhatsAppMessage(message, { dryRun });
    res.json({ ok: true, dryRun, result });
  } catch (e) { console.error(e); res.status(500).json({ ok:false, error:e.message }); }
});

app.post("/agent/whatsapp/process-webhook-test", async (req, res) => {
  try {
    const dryRun = String(req.body?.dryRun ?? req.query.dryRun ?? "true").toLowerCase() !== "false";
    const result = await processWhatsAppWebhook(req.body, { dryRun });
    res.json({ ok: true, dryRun, result });
  } catch (e) { console.error(e); res.status(500).json({ ok:false, error:e.message }); }
});

app.use("/", gmailAuthRoutes);
app.use("/webhook/whatsapp", whatsappWebhookRoutes);

const port = process.env.PORT || 10000;
app.listen(port, () => console.log(`Server running on port ${port}`));

const timezone = process.env.TIMEZONE || "America/New_York";

// Internal cron is optional. For production, prefer Render Cron Jobs calling scripts/*.js
// so reports still run even if the web service has been idle.
if (String(process.env.ENABLE_INTERNAL_CRONS || "false").toLowerCase() === "true") {
  const cronExpression = process.env.REPORT_CRON || "0 8 * * 1-5";
  cron.schedule(cronExpression, async () => {
    console.log(`[CRON] Starting daily report at ${new Date().toISOString()}`);
    try {
      const { emailReport, whatsappReport } = await buildBothReports();
      if (process.env.EMAIL_REPORT_TO) await sendEmail({ to: process.env.EMAIL_REPORT_TO, subject: `Reporte diario operativo - ${new Date().toLocaleDateString("en-US")}`, text: emailReport });
      if (process.env.WHATSAPP_REPORT_TO) await sendWhatsAppReport({ to: process.env.WHATSAPP_REPORT_TO, report: whatsappReport });
      console.log("[CRON] Daily report sent successfully.");
    } catch (e) { console.error("[CRON] Daily report failed:", e); }
  }, { timezone });

  const agentCronExpression = process.env.AGENT_GMAIL_CRON || "15 7 * * 1-5";
  if (String(process.env.AGENT_GMAIL_ENABLED || "false").toLowerCase() === "true") {
    cron.schedule(agentCronExpression, async () => {
      console.log(`[CRON] Starting Gmail IA agent at ${new Date().toISOString()}`);
      try {
        const result = await processRecentGmail({ days: 1, maxResults: Number(process.env.AGENT_MAX_EMAILS || 10), dryRun: false });
        console.log(`[CRON] Gmail IA agent processed ${result.count} emails.`);
      } catch (e) { console.error("[CRON] Gmail IA agent failed:", e); }
    }, { timezone });
  }
}
