const axios = require("axios");

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

function safeJsonParse(text) {
  const cleaned = String(text || "").replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
  return JSON.parse(cleaned);
}

function fallbackAnalysis(email) {
  const text = `${email.subject}\n${email.body}\n${email.snippet}`.toLowerCase();
  const payment = /pagu|payment|paid|comprobante|receipt|zelle|cash app|deposit|dep[oó]sito|segundo pago|2do pago/.test(text);
  const docs = /adjunt|attach|document|pasaporte|certificado|nacimiento|matrimonio|record|evidencia|foto|licencia|proof/.test(text);
  const call = /llamar|ll[áa]mame|call me|phone|tel[eé]fono|hablar/.test(text);
  const urgent = /urgent|urgente|corte|court|deadline|fecha|hoy|mañana/.test(text);
  return {
    clienteDetectado: "",
    contactoDetectado: email.from || "",
    resumen: (email.snippet || email.subject || "Correo recibido").slice(0, 280),
    intencion: urgent ? "Urgente" : payment ? "Pago reportado" : docs ? "Documento enviado" : call ? "Solicita llamada" : "Pregunta general",
    accion: urgent ? "Revisar caso" : payment ? "Cobrar" : docs ? "Revisar caso" : call ? "Llamar" : "Responder mensaje",
    confianza: "Media",
    pagoReportado: payment,
    documentoRecibido: docs,
    requiereLlamada: call || urgent,
  };
}

async function analyzeEmail(email) {
  const apiKey = requireEnv("OPENAI_API_KEY");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const system = `Eres una secretaria operativa IA para una oficina de servicios migratorios. Analiza correos de clientes y devuelve SOLO JSON válido. No inventes hechos. Si no estás seguro, usa confianza Baja o Media. Las actualizaciones delicadas siempre deben quedar para revisión humana.`;
  const user = `Analiza este correo y devuelve JSON con estas claves exactas:
{
  "clienteDetectado": "nombre si aparece o vacío",
  "contactoDetectado": "email o teléfono detectado",
  "resumen": "resumen corto en español, máximo 280 caracteres",
  "intencion": "Pago reportado | Documento enviado | Solicita llamada | Pregunta general | Queja | Urgente | Contrato | Otro",
  "accion": "Llamar | Cobrar | Pedir documentos | Revisar caso | Enviar contrato | Responder mensaje | Sin acción",
  "confianza": "Alta | Media | Baja",
  "pagoReportado": true/false,
  "documentoRecibido": true/false,
  "requiereLlamada": true/false
}

Correo:
From: ${email.from}
To: ${email.to}
Subject: ${email.subject}
Date: ${email.date}
Snippet: ${email.snippet}
Body: ${email.body}`;

  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      },
      { headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" } }
    );
    const content = response.data.choices?.[0]?.message?.content || "{}";
    return safeJsonParse(content);
  } catch (error) {
    console.error("AI analysis failed, using fallback:", error.response?.data || error.message);
    return fallbackAnalysis(email);
  }
}



function fallbackWhatsAppAnalysis(message) {
  const text = `${message.profileName || ""}\n${message.from || ""}\n${message.text || ""}`.toLowerCase();
  const payment = /pagu|payment|paid|comprobante|receipt|zelle|cash app|deposit|dep[oó]sito|segundo pago|2do pago|transfer/.test(text);
  const docs = /adjunt|attach|document|pasaporte|certificado|nacimiento|matrimonio|record|evidencia|foto|licencia|proof|mand[eé]|envi[eé]/.test(text);
  const call = /llamar|ll[áa]mame|call me|phone|tel[eé]fono|hablar|comunicar/.test(text);
  const urgent = /urgent|urgente|corte|court|deadline|fecha|hoy|ma[ñn]ana|emergencia/.test(text);
  const contract = /contrato|firma|firmar|docusign|sign/.test(text);
  return {
    clienteDetectado: message.profileName || "",
    contactoDetectado: message.from || "",
    resumen: (message.text || "Mensaje de WhatsApp recibido").slice(0, 280),
    intencion: urgent ? "Urgente" : payment ? "Pago reportado" : docs ? "Documento enviado" : call ? "Solicita llamada" : contract ? "Contrato" : "Pregunta general",
    accion: urgent ? "Revisar caso" : payment ? "Cobrar" : docs ? "Revisar caso" : call ? "Llamar" : contract ? "Enviar contrato" : "Responder mensaje",
    confianza: "Media",
    pagoReportado: payment,
    documentoRecibido: docs,
    requiereLlamada: call || urgent,
  };
}

async function analyzeWhatsAppMessage(message) {
  const apiKey = requireEnv("OPENAI_API_KEY");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const system = `Eres una secretaria operativa IA para una oficina de servicios migratorios. Analiza mensajes de WhatsApp de clientes y devuelve SOLO JSON válido. No inventes hechos. Si no estás seguro, usa confianza Baja o Media. Las actualizaciones delicadas siempre deben quedar para revisión humana.`;
  const user = `Analiza este mensaje de WhatsApp y devuelve JSON con estas claves exactas:
{
  "clienteDetectado": "nombre si aparece o vacío",
  "contactoDetectado": "teléfono detectado",
  "resumen": "resumen corto en español, máximo 280 caracteres",
  "intencion": "Pago reportado | Documento enviado | Solicita llamada | Pregunta general | Queja | Urgente | Contrato | Otro",
  "accion": "Llamar | Cobrar | Pedir documentos | Revisar caso | Enviar contrato | Responder mensaje | Sin acción",
  "confianza": "Alta | Media | Baja",
  "pagoReportado": true/false,
  "documentoRecibido": true/false,
  "requiereLlamada": true/false
}

Mensaje:
From phone: ${message.from}
Profile name: ${message.profileName || ""}
Message type: ${message.type || "text"}
Date: ${message.timestamp || ""}
Text: ${message.text || ""}`;

  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      },
      { headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" } }
    );
    const content = response.data.choices?.[0]?.message?.content || "{}";
    return safeJsonParse(content);
  } catch (error) {
    console.error("WhatsApp AI analysis failed, using fallback:", error.response?.data || error.message);
    return fallbackWhatsAppAnalysis(message);
  }
}

module.exports = { analyzeEmail, analyzeWhatsAppMessage };

