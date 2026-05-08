const express = require("express");
const { google } = require("googleapis");
const router = express.Router();
function client(){ return new google.auth.OAuth2(process.env.GMAIL_CLIENT_ID,process.env.GMAIL_CLIENT_SECRET,process.env.GMAIL_REDIRECT_URI); }
router.get("/oauth/google", (req,res)=>{ const url=client().generateAuthUrl({access_type:"offline",prompt:"consent",scope:["https://www.googleapis.com/auth/gmail.readonly","https://www.googleapis.com/auth/gmail.send"]}); res.redirect(url); });
router.get("/oauth2callback", async (req,res)=>{ try{ const code=req.query.code; if(!code) return res.status(400).send("Missing authorization code."); const { tokens }=await client().getToken(code); console.log("Gmail OAuth tokens:",tokens); res.type("text/plain").send(["Gmail authorization complete.","","Copy the refresh_token below and put it in Render as GMAIL_REFRESH_TOKEN.","",tokens.refresh_token||"No refresh_token returned. Try again with prompt=consent."].join("\n")); } catch(e){ console.error(e); res.status(500).send(e.message); } });
module.exports=router;
