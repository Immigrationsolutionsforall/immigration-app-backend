# Render Cron Jobs Setup

Use Render Cron Jobs for reliable scheduled execution.

## Cron Job 1: Gmail IA Agent

Name: `process-gmail-agent`
Schedule: `15 7 * * 1-5`
Command:

```bash
node scripts/processGmailDaily.js
```

## Cron Job 2: Daily Report

Name: `send-daily-report`
Schedule: `0 8 * * 1-5`
Command:

```bash
node scripts/sendDailyReport.js
```

## Build Command

```bash
npm install
```

## Environment Variables

Use the same environment variables as the web service.
The required ones are in Render under the `secretaria-operativa-ai-backend` web service.

Recommended:

```env
ENABLE_INTERNAL_CRONS=false
AGENT_GMAIL_ENABLED=true
AGENT_MAX_EMAILS=10
AGENT_GMAIL_DAYS=1
TIMEZONE=America/New_York
```

