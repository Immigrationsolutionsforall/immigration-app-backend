const { listRecordsFromView } = require("./airtable");

const TZ = process.env.TIMEZONE || "America/New_York";
const FULL_LIMIT = Number(process.env.REPORT_FULL_LIMIT || 10);
const SHORT_LIMIT = Number(process.env.REPORT_SHORT_LIMIT || 5);
const NOTE_LIMIT = Number(process.env.REPORT_NOTE_LIMIT || 110);

function todayLabel() {
  return new Intl.DateTimeFormat("es-US", {
    dateStyle: "full",
    timeZone: TZ,
  }).format(new Date());
}

function cleanText(value = "") {
  return String(value || "")
    .replace(/\s*\|\|\s*/g, "; ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value = "", max = NOTE_LIMIT) {
  const text = cleanText(value);
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
}

function dateShort(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    timeZone: TZ,
  }).format(d);
}

function views() {
  return {
    urgentes: process.env.AIRTABLE_VIEW_URGENTES || "URGENTES HOY",
    pagos: process.env.AIRTABLE_VIEW_PAGOS || "PAGOS PENDIENTES",
    llamar: process.env.AIRTABLE_VIEW_LLAMAR || "POR LLAMAR",
    fechas: process.env.AIRTABLE_VIEW_FECHAS || "CON FECHA DE CORTE CERCA",
    progreso: process.env.AIRTABLE_VIEW_PROGRESO || "EN PROCESO",
    revisar: process.env.AIRTABLE_VIEW_REVISAR || "POR REVISAR",
    sinAsignar: process.env.AIRTABLE_VIEW_SIN_ASIGNAR || "SIN ASIGNAR",
  };
}

async function getReportData() {
  const v = views();
  const fetchMax = Math.max(50, FULL_LIMIT * 3);
  const [urgentes, pagos, llamar, fechas, progreso, revisar, sinAsignar] = await Promise.all([
    listRecordsFromView(v.urgentes, fetchMax),
    listRecordsFromView(v.pagos, fetchMax),
    listRecordsFromView(v.llamar, fetchMax),
    listRecordsFromView(v.fechas, fetchMax),
    listRecordsFromView(v.progreso, fetchMax),
    listRecordsFromView(v.revisar, fetchMax),
    listRecordsFromView(v.sinAsignar, fetchMax),
  ]);
  return { urgentes, pagos, llamar, fechas, progreso, revisar, sinAsignar };
}

function compactLine(record, mode = "general") {
  const parts = [cleanText(record.cliente) || "Sin nombre"];
  if (mode === "pago" && record.flagsPago) parts.push(`Pago: ${truncate(record.flagsPago, 45)}`);
  if (mode === "fecha" && record.fechaCorte) parts.push(`Fecha: ${dateShort(record.fechaCorte)}`);
  if (mode === "llamar" && record.telefonos) parts.push(`Tel: ${truncate(record.telefonos, 35)}`);
  if (record.asignadoA) parts.push(`Resp: ${truncate(record.asignadoA, 35)}`);
  const note = truncate(record.resumenNotas, NOTE_LIMIT);
  if (note) parts.push(`Nota: ${note}`);
  return `- ${parts.join(" — ")}`;
}

function executiveLine(record, mode = "general") {
  const parts = [cleanText(record.cliente) || "Sin nombre"];
  if (record.telefonos && (mode === "llamar" || mode === "pago")) parts.push(`Tel: ${truncate(record.telefonos, 35)}`);
  if (record.tiposDeCaso) parts.push(`Caso: ${truncate(record.tiposDeCaso, 55)}`);
  if (record.procesos && mode !== "llamar") parts.push(`Proceso: ${truncate(record.procesos, 55)}`);
  if (record.asignadoA) parts.push(`Resp: ${truncate(record.asignadoA, 35)}`);
  if (mode === "pago" && record.flagsPago) parts.push(`Pago: ${truncate(record.flagsPago, 45)}`);
  if (mode === "fecha" && record.fechaCorte) parts.push(`Fecha: ${dateShort(record.fechaCorte)}`);
  const note = truncate(record.resumenNotas, NOTE_LIMIT);
  if (note) parts.push(`Nota: ${note}`);
  return `- ${parts.join(" — ")}`;
}

function section(title, records, { mode = "general", limit = FULL_LIMIT, full = true } = {}) {
  const slice = (records || []).slice(0, limit);
  if (!slice.length) return `\n${title}\n- Sin registros.\n`;
  const formatter = full ? executiveLine : compactLine;
  const extra = records.length > limit ? `\n- Ver ${records.length - limit} más en Airtable.` : "";
  return `\n${title}\n${slice.map((r) => formatter(r, mode)).join("\n")}${extra}\n`;
}

function uniqueByClient(records) {
  const seen = new Set();
  const out = [];
  for (const r of records) {
    const key = cleanText(r.cliente).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

function topPriorities(data, limit = 5) {
  return uniqueByClient([
    ...data.urgentes,
    ...data.fechas,
    ...data.pagos,
    ...data.llamar,
  ]).slice(0, limit);
}

function suggestedMessagesShort() {
  return `\nMENSAJES SUGERIDOS\n- Pago: "Hola [Nombre], le escribimos para recordarle que tiene un pago pendiente. Por favor confirme cuándo podrá realizarlo."\n- Llamada: "Hola [Nombre], necesitamos comunicarnos con usted para darle seguimiento a su proceso. ¿A qué hora podemos llamarle hoy?"\n- Documentos: "Hola [Nombre], para continuar necesitamos que nos envíe los documentos pendientes indicados en su caso."\n- Firma: "Hola [Nombre], su documento está listo para firma. Por favor complete la firma para poder continuar."\n`;
}

function header(data, channel = "Email + WhatsApp") {
  return `REPORTE OPERATIVO\nFecha: ${todayLabel()}\nHora programada: 8:00 AM\nCanales: ${channel}\n\nRESUMEN DEL DÍA\n- Urgentes: ${data.urgentes.length}\n- Pagos pendientes: ${data.pagos.length}\n- Clientes por llamar: ${data.llamar.length}\n- Fechas de corte cercanas: ${data.fechas.length}\n- En proceso: ${data.progreso.length}\n- Por revisar: ${data.revisar.length}\n- Sin asignar: ${data.sinAsignar.length}\n`;
}

function buildFullReportFromData(data) {
  const top = topPriorities(data, 5);
  return [
    header(data, "Email"),
    section("TOP 5 PRIORIDADES DE HOY", top, { limit: 5, full: true }),
    section("PAGOS PENDIENTES", data.pagos, { mode: "pago", limit: FULL_LIMIT, full: true }),
    section("CLIENTES POR LLAMAR", data.llamar, { mode: "llamar", limit: FULL_LIMIT, full: true }),
    section("FECHAS DE CORTE CERCANAS", data.fechas, { mode: "fecha", limit: FULL_LIMIT, full: true }),
    section("CASOS EN PROCESO", data.progreso, { limit: FULL_LIMIT, full: true }),
    section("CASOS POR REVISAR", data.revisar, { limit: FULL_LIMIT, full: true }),
    section("CASOS SIN ASIGNAR", data.sinAsignar, { limit: FULL_LIMIT, full: true }),
    suggestedMessagesShort(),
    "\nACCIÓN RECOMENDADA\nPriorizar cortes cercanas, pagos pendientes, firmas/documentos y llamadas críticas. El detalle completo debe revisarse en Airtable.\n",
  ].join("\n");
}

function buildWhatsAppReportFromData(data) {
  const top = topPriorities(data, 5);
  return [
    `REPORTE OPERATIVO — ${todayLabel()}\n`,
    `RESUMEN\nUrgentes: ${data.urgentes.length} | Pagos: ${data.pagos.length} | Llamadas: ${data.llamar.length} | Cortes cercanas: ${data.fechas.length}\n`,
    section("TOP 5 PRIORIDADES", top, { limit: 5, full: false }),
    section("PAGOS CRÍTICOS", data.pagos, { mode: "pago", limit: SHORT_LIMIT, full: false }),
    section("LLAMADAS CRÍTICAS", data.llamar, { mode: "llamar", limit: SHORT_LIMIT, full: false }),
    section("CORTES CERCANAS", data.fechas, { mode: "fecha", limit: SHORT_LIMIT, full: false }),
    "\nVer detalle completo en el email y en Airtable.\n",
  ].join("\n");
}

async function buildDailyReport() {
  return buildFullReportFromData(await getReportData());
}

async function buildWhatsAppDailyReport() {
  return buildWhatsAppReportFromData(await getReportData());
}

async function buildBothReports() {
  const data = await getReportData();
  return {
    emailReport: buildFullReportFromData(data),
    whatsappReport: buildWhatsAppReportFromData(data),
    data,
  };
}

module.exports = {
  buildDailyReport,
  buildWhatsAppDailyReport,
  buildBothReports,
};
