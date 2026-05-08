const axios = require("axios");

function requireEnv(name){ const v=process.env[name]; if(!v) throw new Error(`Missing required environment variable: ${name}`); return v; }
function apiBase(tableName){ return `https://api.airtable.com/v0/${requireEnv("AIRTABLE_BASE_ID")}/${encodeURIComponent(tableName)}`; }
function headers(){ return { Authorization: `Bearer ${requireEnv("AIRTABLE_TOKEN")}`, "Content-Type": "application/json" }; }
function normalize(s=""){ return String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim(); }
function digits(s=""){ return String(s||"").replace(/\D/g,""); }
function escapeFormulaString(value=""){ return String(value).replace(/'/g, "\\'"); }
function safeText(value="", max=800){ return String(value || "").slice(0, max); }

function extractUnknownFieldName(error) {
  const msg = error.response?.data?.error?.message || error.message || "";
  const match = msg.match(/Unknown field name:\s*\"([^\"]+)\"/i);
  return match ? match[1] : null;
}

async function airtablePostWithUnknownFieldFallback(table, fields, context) {
  let currentFields = { ...fields };
  const removed = [];
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const response = await axios.post(apiBase(table), { records: [{ fields: currentFields }], typecast: true }, { headers: headers() });
      const record = response.data.records?.[0];
      if (removed.length && record) record._removedFields = removed;
      return record;
    } catch (e) {
      const unknown = extractUnknownFieldName(e);
      if (unknown && Object.prototype.hasOwnProperty.call(currentFields, unknown)) {
        removed.push(unknown);
        delete currentFields[unknown];
        console.warn(`${context}: Airtable field not found, removed and retrying: ${unknown}`);
        continue;
      }
      throw new Error(airtableErrorMessage(e, context));
    }
  }
  throw new Error(`${context} failed: too many unknown field retries`);
}

async function airtablePatchWithUnknownFieldFallback(table, id, fields, context) {
  let currentFields = { ...fields };
  const removed = [];
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const response = await axios.patch(apiBase(table), { records: [{ id, fields: currentFields }], typecast: true }, { headers: headers() });
      const record = response.data.records?.[0];
      if (removed.length && record) record._removedFields = removed;
      return record;
    } catch (e) {
      const unknown = extractUnknownFieldName(e);
      if (unknown && Object.prototype.hasOwnProperty.call(currentFields, unknown)) {
        removed.push(unknown);
        delete currentFields[unknown];
        console.warn(`${context}: Airtable field not found, removed and retrying: ${unknown}`);
        continue;
      }
      throw new Error(airtableErrorMessage(e, context));
    }
  }
  throw new Error(`${context} failed: too many unknown field retries`);
}

function airtableErrorMessage(error, context="Airtable") {
  const data = error.response?.data;
  const status = error.response?.status;
  const detail = data ? JSON.stringify(data, null, 2) : error.message;
  return `${context} failed${status ? ` (${status})` : ""}: ${detail}`;
}

function normAction(value) {
  const v = normalize(value);
  if (v.includes("cobrar") || v.includes("pago")) return "Cobrar";
  if (v.includes("document")) return "Pedir documentos";
  if (v.includes("contrato")) return "Enviar contrato";
  if (v.includes("llamar") || v.includes("llamada")) return "Llamar";
  if (v.includes("revis")) return "Revisar caso";
  if (v.includes("esper")) return "Esperar respuesta";
  if (v.includes("sin")) return "Sin acción";
  return "Responder mensaje";
}

function normIntent(value) {
  const v = normalize(value);
  if (v.includes("pago") || v.includes("cobro")) return "Pago reportado";
  if (v.includes("document") || v.includes("evidencia")) return "Documento enviado";
  if (v.includes("llamada") || v.includes("llamar")) return "Solicita llamada";
  if (v.includes("queja") || v.includes("molest")) return "Queja";
  if (v.includes("urgent")) return "Urgente";
  if (v.includes("contrato") || v.includes("firma")) return "Contrato";
  if (v.includes("pregunta")) return "Pregunta general";
  return "Otro";
}

function normConfidence(value) {
  const v = normalize(value);
  if (v.includes("alta")) return "Alta";
  if (v.includes("baja")) return "Baja";
  return "Media";
}

async function createInteractionLog({ email, analysis, matchedClient }) {
  const table = process.env.AIRTABLE_INTERACTIONS_TABLE_NAME || "Registro de Interacciones IA";
  const fields = {
    "Fecha": new Date().toISOString().slice(0, 10),
    "Canal": "Email",
    "Cliente detectado": safeText(analysis.clienteDetectado || matchedClient?.cliente || "", 200),
    "Email / Teléfono detectado": safeText(analysis.contactoDetectado || email.from || "", 250),
    "Resumen del mensaje": safeText(analysis.resumen || email.snippet || "", 2000),
    "Intención detectada": normIntent(analysis.intencion),
    "Acción sugerida": normAction(analysis.accion),
    "Confianza IA": normConfidence(analysis.confianza),
    "Estado": "Nuevo",
    "Fuente / ID del mensaje": safeText(`gmail:${email.id}; thread:${email.threadId}; subject:${email.subject}`, 1000),
    "Notas internas": safeText(matchedClient ? `Cliente vinculado en Master Clientes: ${matchedClient.cliente}` : "No se encontró cliente con confianza suficiente. Revisar manualmente.", 1000),
  };
  return await airtablePostWithUnknownFieldFallback(table, fields, `Crear registro en tabla ${table}`);
}

async function searchMasterClients(email, analysis) {
  const table = process.env.AIRTABLE_TABLE_NAME || "Master Clientes";
  const terms = [];
  const emailMatch = String(email.from || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (emailMatch) terms.push(emailMatch[0]);
  if (analysis.contactoDetectado) terms.push(analysis.contactoDetectado);
  if (analysis.clienteDetectado) terms.push(analysis.clienteDetectado);

  const candidates = [];
  for (const term of terms.filter(Boolean).slice(0, 4)) {
    const normalizedTerm = normalize(term);
    const phoneTerm = digits(term);
    const formulaParts = [];
    if (normalizedTerm) {
      const safe = escapeFormulaString(normalizedTerm.split(" ").slice(0, 3).join(" "));
      formulaParts.push(`SEARCH('${safe}', LOWER({Cliente} & ' ' & {Email} & ' ' & {Teléfonos}))`);
    }
    if (phoneTerm.length >= 7) formulaParts.push(`SEARCH('${phoneTerm.slice(-7)}', REGEX_REPLACE({Teléfonos}, '[^0-9]', ''))`);
    if (!formulaParts.length) continue;
    const formula = formulaParts.length === 1 ? formulaParts[0] : `OR(${formulaParts.join(",")})`;
    try {
      const response = await axios.get(apiBase(table), { headers: headers(), params: { filterByFormula: formula, maxRecords: 5 } });
      for (const r of response.data.records || []) candidates.push(r);
    } catch (e) {
      console.error("Airtable search failed:", e.response?.data ? JSON.stringify(e.response.data) : e.message);
    }
  }

  const seen = new Set();
  const unique = candidates.filter(r => { if(seen.has(r.id)) return false; seen.add(r.id); return true; });
  if (!unique.length) return null;
  const first = unique[0];
  return { id: first.id, cliente: first.fields?.["Cliente"] || "", fields: first.fields || {} };
}

async function updateMasterClient(client, analysis) {
  if (!client?.id) return null;
  const table = process.env.AIRTABLE_TABLE_NAME || "Master Clientes";
  const fields = {
    "Última interacción": new Date().toISOString().slice(0, 10),
    "Canal última interacción": "Email",
    "Resumen IA": safeText(analysis.resumen || "Interacción detectada por IA.", 2000),
    "Acción sugerida por IA": normAction(analysis.accion),
    "Estado IA": "Requiere revisión humana",
    "Confianza IA": normConfidence(analysis.confianza),
    "Pago reportado": Boolean(analysis.pagoReportado),
    "Documento recibido": Boolean(analysis.documentoRecibido),
    "Requiere llamada": Boolean(analysis.requiereLlamada),
    "Revisado por humano": false,
  };
  return await airtablePatchWithUnknownFieldFallback(table, client.id, fields, `Actualizar cliente ${client.cliente || client.id} en ${table}`);
}



async function createInteractionLogGeneric({ channel="Email", source, analysis, matchedClient }) {
  const table = process.env.AIRTABLE_INTERACTIONS_TABLE_NAME || "Registro de Interacciones IA";
  const fields = {
    "Fecha": new Date().toISOString().slice(0, 10),
    "Canal": channel,
    "Cliente detectado": safeText(analysis.clienteDetectado || matchedClient?.cliente || "", 200),
    "Email / Teléfono detectado": safeText(analysis.contactoDetectado || source?.from || "", 250),
    "Resumen del mensaje": safeText(analysis.resumen || source?.snippet || source?.text || "", 2000),
    "Intención detectada": normIntent(analysis.intencion),
    "Acción sugerida": normAction(analysis.accion),
    "Confianza IA": normConfidence(analysis.confianza),
    "Estado": "Nuevo",
    "Fuente / ID del mensaje": safeText(`${channel.toLowerCase()}:${source?.id || "manual"}; from:${source?.from || ""}; type:${source?.type || ""}`, 1000),
    "Notas internas": safeText(matchedClient ? `Cliente vinculado en Master Clientes: ${matchedClient.cliente}` : "No se encontró cliente con confianza suficiente. Revisar manualmente.", 1000),
  };
  return await airtablePostWithUnknownFieldFallback(table, fields, `Crear registro en tabla ${table}`);
}

async function searchMasterClientsByContact({ phone, name, email }) {
  const table = process.env.AIRTABLE_TABLE_NAME || "Master Clientes";
  const terms = [phone, email, name].filter(Boolean);
  const candidates = [];
  for (const term of terms.slice(0, 5)) {
    const normalizedTerm = normalize(term);
    const phoneTerm = digits(term);
    const formulaParts = [];
    if (phoneTerm.length >= 7) formulaParts.push(`SEARCH('${phoneTerm.slice(-7)}', REGEX_REPLACE({Teléfonos}, '[^0-9]', ''))`);
    if (normalizedTerm && !/^[0-9 +()\-]+$/.test(String(term))) {
      const safe = escapeFormulaString(normalizedTerm.split(" ").slice(0, 3).join(" "));
      formulaParts.push(`SEARCH('${safe}', LOWER({Cliente} & ' ' & {Teléfonos}))`);
    }
    if (!formulaParts.length) continue;
    const formula = formulaParts.length === 1 ? formulaParts[0] : `OR(${formulaParts.join(",")})`;
    try {
      const response = await axios.get(apiBase(table), { headers: headers(), params: { filterByFormula: formula, maxRecords: 5 } });
      for (const r of response.data.records || []) candidates.push(r);
    } catch (e) {
      console.error("Airtable contact search failed:", e.response?.data ? JSON.stringify(e.response.data) : e.message);
    }
  }
  const seen = new Set();
  const unique = candidates.filter(r => { if(seen.has(r.id)) return false; seen.add(r.id); return true; });
  if (!unique.length) return null;
  const first = unique[0];
  return { id: first.id, cliente: first.fields?.["Cliente"] || "", fields: first.fields || {} };
}

async function updateMasterClientGeneric(client, analysis, channel="Email") {
  if (!client?.id) return null;
  const table = process.env.AIRTABLE_TABLE_NAME || "Master Clientes";
  const fields = {
    "Última interacción": new Date().toISOString().slice(0, 10),
    "Canal última interacción": channel,
    "Resumen IA": safeText(analysis.resumen || "Interacción detectada por IA.", 2000),
    "Acción sugerida por IA": normAction(analysis.accion),
    "Estado IA": "Requiere revisión humana",
    "Confianza IA": normConfidence(analysis.confianza),
    "Pago reportado": Boolean(analysis.pagoReportado),
    "Documento recibido": Boolean(analysis.documentoRecibido),
    "Requiere llamada": Boolean(analysis.requiereLlamada),
    "Revisado por humano": false,
  };
  return await airtablePatchWithUnknownFieldFallback(table, client.id, fields, `Actualizar cliente ${client.cliente || client.id} en ${table}`);
}


function newWhatsAppClientName({ phone, name }) {
  const cleanName = safeText(name || "", 80).trim();
  const last4 = digits(phone).slice(-4);
  if (cleanName && cleanName.toLowerCase() !== "unknown") return `${cleanName} - WhatsApp ${last4 || "nuevo"}`;
  return `Nuevo cliente WhatsApp - ${last4 || digits(phone) || "sin numero"}`;
}

async function createNewWhatsAppClient({ message, analysis }) {
  const table = process.env.AIRTABLE_TABLE_NAME || "Master Clientes";
  const phone = message?.from || analysis?.contactoDetectado || "";
  const name = analysis?.clienteDetectado || message?.profileName || "";
  const fields = {
    "Cliente": newWhatsAppClientName({ phone, name }),
    "Teléfonos": phone,
    "Tipos de caso": "Responder mensaje",
    "Procesos": "Nuevo contacto WhatsApp",
    "Estados": "Nuevo",
    "Última interacción": new Date().toISOString().slice(0, 10),
    "Canal última interacción": "WhatsApp",
    "Resumen IA": safeText(analysis?.resumen || message?.text || "Nuevo mensaje de WhatsApp.", 2000),
    "Acción sugerida por IA": normAction(analysis?.accion || "Responder mensaje"),
    "Estado IA": "Requiere revisión humana",
    "Confianza IA": normConfidence(analysis?.confianza || "Media"),
    "Pago reportado": Boolean(analysis?.pagoReportado),
    "Documento recibido": Boolean(analysis?.documentoRecibido),
    "Requiere llamada": Boolean(analysis?.requiereLlamada),
    "Revisado por humano": false,
    "Origen del cliente": "WhatsApp",
    "Es cliente nuevo": true,
    "Fecha de primer contacto": new Date().toISOString().slice(0, 10),
    "Número detectado por IA": phone,
    "Pendiente de crear caso": true,
  };
  const record = await airtablePostWithUnknownFieldFallback(table, fields, `Crear nuevo cliente WhatsApp en ${table}`);
  return record ? { id: record.id, cliente: record.fields?.["Cliente"] || fields["Cliente"], fields: record.fields || {} } : null;
}

module.exports = { createInteractionLog, searchMasterClients, updateMasterClient, createInteractionLogGeneric, searchMasterClientsByContact, updateMasterClientGeneric, createNewWhatsAppClient };

