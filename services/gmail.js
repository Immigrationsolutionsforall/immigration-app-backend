const { google } = require("googleapis");
function requireEnv(name){ const v=process.env[name]; if(!v) throw new Error(`Missing required environment variable: ${name}`); return v; }
function getOAuthClient(){ const c=new google.auth.OAuth2(requireEnv("GMAIL_CLIENT_ID"),requireEnv("GMAIL_CLIENT_SECRET"),requireEnv("GMAIL_REDIRECT_URI")); c.setCredentials({refresh_token:requireEnv("GMAIL_REFRESH_TOKEN")}); return c; }
function makeEmail({from,to,subject,text}){ const m=[`From: ${from}`,`To: ${to}`,`Subject: ${subject}`,"MIME-Version: 1.0","Content-Type: text/plain; charset=utf-8","",text].join("\n"); return Buffer.from(m).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""); }
async function sendEmail({to,subject,text}){ const gmail=google.gmail({version:"v1",auth:getOAuthClient()}); const from=process.env.GMAIL_FROM||process.env.EMAIL_REPORT_TO; if(!from) throw new Error("Missing GMAIL_FROM or EMAIL_REPORT_TO."); const response=await gmail.users.messages.send({userId:"me",requestBody:{raw:makeEmail({from,to,subject,text})}}); return {id:response.data.id, threadId:response.data.threadId}; }
module.exports={ sendEmail, getOAuthClient };
