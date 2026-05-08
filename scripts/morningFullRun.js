require('dotenv').config();

const { processRecentGmail } = require('../services/gmailAgent');
const { buildBothReports } = require('../services/report');
const { sendEmail } = require('../services/gmail');
const { sendWhatsAppReport } = require('../services/whatsapp');

async function main() {
  const days = Number(process.env.AGENT_GMAIL_DAYS || 1);
  const maxResults = Number(process.env.AGENT_MAX_EMAILS || 10);

  console.log(`[CRON SCRIPT] Morning full run started at ${new Date().toISOString()}`);

  if (String(process.env.AGENT_GMAIL_ENABLED || 'false').toLowerCase() === 'true') {
    const gmailResult = await processRecentGmail({ days, maxResults, dryRun: false });
    console.log(`[CRON SCRIPT] Gmail processed ${gmailResult.count} emails.`);
  } else {
    console.log('[CRON SCRIPT] AGENT_GMAIL_ENABLED is not true. Gmail agent skipped.');
  }

  const { emailReport, whatsappReport } = await buildBothReports();
  const results = {};

  if (process.env.EMAIL_REPORT_TO) {
    results.email = await sendEmail({
      to: process.env.EMAIL_REPORT_TO,
      subject: `Reporte diario operativo - ${new Date().toLocaleDateString('en-US')}`,
      text: emailReport,
    });
  }

  if (process.env.WHATSAPP_REPORT_TO) {
    results.whatsapp = await sendWhatsAppReport({
      to: process.env.WHATSAPP_REPORT_TO,
      report: whatsappReport,
    });
  }

  console.log('[CRON SCRIPT] Morning full run completed successfully.');
  console.log(JSON.stringify(results, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[CRON SCRIPT] Morning full run failed:', error?.response?.data || error.message || error);
    process.exit(1);
  });
