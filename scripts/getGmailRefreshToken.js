require("dotenv").config();
const http=require("http"), url=require("url");
const { google }=require("googleapis");
const port=3000;
const oauth2Client=new google.auth.OAuth2(process.env.GMAIL_CLIENT_ID,process.env.GMAIL_CLIENT_SECRET,process.env.GMAIL_REDIRECT_URI||`http://localhost:${port}/oauth2callback`);
const authUrl=oauth2Client.generateAuthUrl({access_type:"offline",prompt:"consent",scope:["https://www.googleapis.com/auth/gmail.readonly","https://www.googleapis.com/auth/gmail.send"]});
console.log("\nOpen this URL in your browser:\n"); console.log(authUrl); console.log("\nWaiting for OAuth callback...\n");
const server=http.createServer(async(req,res)=>{ const parsed=url.parse(req.url,true); if(parsed.pathname!=="/oauth2callback"){res.writeHead(404);res.end("Not found");return;} try{ const {tokens}=await oauth2Client.getToken(parsed.query.code); console.log("\nOAuth complete. Save this refresh token in Render:"); console.log(tokens.refresh_token); res.writeHead(200,{"Content-Type":"text/plain"}); res.end("OAuth complete. You can close this window and check your terminal for the refresh token."); server.close(); }catch(e){ console.error(e); res.writeHead(500); res.end(e.message); }});
server.listen(port);
