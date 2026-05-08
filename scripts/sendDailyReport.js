require('dotenv').config();

const { buildBothReports } = require('../services/report');
const { sendEmail } = require('../services/gmail');
const { sendWhatsAppReport } = require('../services/whatsapp');

async function main() {
  console.log(`[CRON SCRIPT] Starting daily report at ${new Date().toISOString()}`);

  const { emailReport, whatsappReport } = await buildBothReports();
  const results = {};

  if (process.env.EMAIL_REPORT_TO) {
    results.email = await sendEmail({
      to: process.env.EMAIL_REPORT_TO,
      subject: `Reporte diario operativo - ${new Date().toLocaleDateString('en-US')}`,
      text: emailReport,
    });
    console.log(`[CRON SCRIPT] Email sent: ${JSON.stringify(results.email)}`);
  } else {
    console.log('[CRON SCRIPT] EMAIL_REPORT_TO is empty. Email skipped.');
  }

  if (process.env.WHATSAPP_REPORT_TO) {
    results.whatsapp = await sendWhatsAppReport({
      to: process.env.WHATSAPP_REPORT_TO,
      report: whatsappReport,
    });
    console.log(`[CRON SCRIPT] WhatsApp sent: ${JSON.stringify(results.whatsapp)}`);
  } else {
    console.log('[CRON SCRIPT] WHATSAPP_REPORT_TO is empty. WhatsApp skipped.');
  }

  console.log('[CRON SCRIPT] Daily report completed successfully.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[CRON SCRIPT] Daily report failed:', error?.response?.data || error.message || error);
    process.exit(1);
  });
