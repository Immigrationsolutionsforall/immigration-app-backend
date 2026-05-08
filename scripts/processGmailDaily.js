require('dotenv').config();

const { processRecentGmail } = require('../services/gmailAgent');

async function main() {
  const days = Number(process.env.AGENT_GMAIL_DAYS || 1);
  const maxResults = Number(process.env.AGENT_MAX_EMAILS || 10);

  console.log(`[CRON SCRIPT] Starting Gmail IA agent at ${new Date().toISOString()}`);
  console.log(`[CRON SCRIPT] days=${days}, maxResults=${maxResults}`);

  const result = await processRecentGmail({
    days,
    maxResults,
    dryRun: false,
  });

  console.log(`[CRON SCRIPT] Gmail IA agent completed. Processed ${result.count} emails.`);
  console.log(JSON.stringify(result, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[CRON SCRIPT] Gmail IA agent failed:', error?.response?.data || error.message || error);
    process.exit(1);
  });
