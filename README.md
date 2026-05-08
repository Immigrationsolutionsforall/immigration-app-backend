# Secretaria Operativa AI Backend

Backend para el reporte diario operativo de Immigration Solutions for All.

## Qué hace

- Lee las vistas de Airtable.
- Genera reporte completo para email.
- Genera reporte corto y ejecutivo para WhatsApp.
- Envía el reporte lunes a viernes a las 8:00 AM.
- Permite probar el reporte manualmente.

## Endpoints principales

```text
GET /health
GET /report/preview
GET /report/preview-full
GET /report/preview-whatsapp
POST /tasks/send-daily-report
GET /oauth/google
GET /oauth2callback
GET /webhook/whatsapp
POST /webhook/whatsapp
```

## Reporte mejorado

- Email: reporte completo, organizado por prioridades y secciones.
- WhatsApp: resumen corto con Top 5, pagos críticos, llamadas críticas y cortes cercanas.
- Cada sección muestra registros limitados para evitar reportes largos y desordenados.

## Variables nuevas opcionales

```text
REPORT_FULL_LIMIT=10
REPORT_SHORT_LIMIT=5
REPORT_NOTE_LIMIT=110
```

## Variables importantes

Usa `.env.example` como guía. No subas `.env` a GitHub.

## Cron

```text
REPORT_CRON=0 8 * * 1-5
TIMEZONE=America/New_York
```

## Prueba manual

```bash
curl -X POST https://secretaria-operativa-ai-backend.onrender.com/tasks/send-daily-report
```

## Próxima fase del agente IA

La siguiente fase es agregar análisis de Gmail y WhatsApp Webhook para crear sugerencias y actualizaciones en Airtable. Por seguridad, los cambios sensibles deben quedar como “sugeridos” hasta que una persona los revise.


## Fase 2 — Agente IA para Gmail

Esta versión agrega lectura de correos recientes de Gmail, análisis con IA y actualización controlada de Airtable.

### Nuevos endpoints

```text
GET /agent/gmail/preview?days=3&maxResults=5
POST /agent/gmail/process
POST /tasks/process-gmail-daily
```

### Cómo probar sin modificar Airtable

```bash
curl "https://TU-URL.onrender.com/agent/gmail/preview?days=3&maxResults=5"
```

Esto analiza correos recientes, pero no escribe en Airtable.

### Cómo procesar y actualizar Airtable

```bash
curl -X POST "https://TU-URL.onrender.com/agent/gmail/process?days=3&maxResults=5"
```

El agente hace dos cosas:

1. Crea un registro en `Registro de Interacciones IA`.
2. Si encuentra cliente probable, actualiza columnas IA en `Master Clientes` y marca `Estado IA = Requiere revisión humana`.

### Variables nuevas

```text
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o-mini
AIRTABLE_INTERACTIONS_TABLE_NAME=Registro de Interacciones IA
AGENT_MAX_EMAILS=10
AGENT_GMAIL_ENABLED=false
AGENT_GMAIL_CRON=15 7 * * 1-5
```

### Modo profesional recomendado

Mantener `AGENT_GMAIL_ENABLED=false` al inicio. Primero probar manualmente con preview y process. Cuando todo esté verificado, cambiar a `true` para procesar todos los días antes del reporte de 8:00 AM.


## v4 - Agente IA para WhatsApp

Nuevas funciones:

- Webhook real de WhatsApp en `/webhook/whatsapp`.
- Procesamiento IA de mensajes entrantes de WhatsApp.
- Registro automático en `Registro de Interacciones IA`.
- Actualización controlada de columnas IA en `Master Clientes`.
- Endpoint manual de prueba: `POST /agent/whatsapp/test`.

Variable nueva:

```env
AGENT_WHATSAPP_ENABLED=false
```

Primero deja esta variable en `false` mientras verificas el webhook en Meta. Luego cámbiala a `true` cuando quieras que los mensajes entrantes actualicen Airtable.

### Probar manualmente sin webhook

```bash
curl -X POST "https://TU-SERVICIO.onrender.com/agent/whatsapp/test?dryRun=true" \
  -H "Content-Type: application/json" \
  -d '{"from":"13464827728","profileName":"Prueba Cliente","text":"Hola, ya hice el pago y envié el comprobante."}'
```

Para escribir en Airtable:

```bash
curl -X POST "https://TU-SERVICIO.onrender.com/agent/whatsapp/test?dryRun=false" \
  -H "Content-Type: application/json" \
  -d '{"from":"13464827728","profileName":"Prueba Cliente","text":"Hola, ya hice el pago y envié el comprobante."}'
```

### Webhook en Meta

Callback URL:

```text
https://TU-SERVICIO.onrender.com/webhook/whatsapp
```

Verify token: el mismo valor de `WHATSAPP_VERIFY_TOKEN` en Render.

Suscribe el webhook al campo `messages`.


## v4.1 — WhatsApp nuevos clientes automático controlado

Esta versión agrega creación automática controlada de nuevos contactos de WhatsApp cuando el número entrante no existe en `Master Clientes`.

### Variable nueva en Render

```env
AGENT_WHATSAPP_CREATE_NEW_CLIENTS=false
```

Para activar creación automática de leads/clientes nuevos desde WhatsApp, cambiar a:

```env
AGENT_WHATSAPP_CREATE_NEW_CLIENTS=true
```

### Columnas recomendadas en Master Clientes para nivel profesional

Estas columnas son recomendadas para filtrar nuevos leads. Si alguna no existe, el backend la ignora automáticamente y sigue funcionando.

- `Origen del cliente` — Single select: WhatsApp, Email, Manual, Referido, TikTok, Facebook
- `Es cliente nuevo` — Checkbox
- `Fecha de primer contacto` — Date
- `Número detectado por IA` — Single line text
- `Pendiente de crear caso` — Checkbox

### Vista recomendada

Crear una vista en `Master Clientes` llamada:

`IA - CLIENTES NUEVOS WHATSAPP`

Filtros sugeridos:

- `Origen del cliente` is `WhatsApp`
- `Es cliente nuevo` is checked
- `Estado IA` is `Requiere revisión humana`

### Flujo

1. Entra un WhatsApp.
2. Webhook lo recibe.
3. La IA analiza intención y acción.
4. Busca cliente por teléfono.
5. Si lo encuentra: actualiza columnas IA.
6. Si no lo encuentra y `AGENT_WHATSAPP_CREATE_NEW_CLIENTS=true`: crea nuevo registro en `Master Clientes`.
7. Siempre crea historial en `Registro de Interacciones IA`.
8. Todo queda marcado para revisión humana.
