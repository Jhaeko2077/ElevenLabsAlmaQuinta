# Alma Quinta ElevenLabs Backend

Backend HTTP en Node.js 20 + TypeScript para tools de ElevenLabs integradas con Google Calendar, persistencia local simple y soporte dual de autenticacion Google:

- `GOOGLE_AUTH_MODE=service_account`
- `GOOGLE_AUTH_MODE=oauth_user`

La migracion a OAuth de usuario queda lista para probar invitados reales sin perder el flujo actual que ya crea eventos con service account.

## Que incluye

- `POST /api/elevenlabs/check-availability`
- `POST /api/elevenlabs/create-meeting`
- `POST /api/elevenlabs/save-lead-note`
- `POST /api/elevenlabs/handoff-to-human`
- `POST /api/elevenlabs/qualify-website-project`
- `GET /auth/google/start`
- `GET /auth/google/callback`
- `GET /`
- `GET /health/live`
- `GET /health/ready`
- `GET /metrics`
- Google Calendar por service account y OAuth 2.0 de usuario
- Persistencia local segura en JSON
- Logging estructurado con Pino
- Metricas Prometheus con `prom-client`
- Tests con Vitest + Supertest

## Stack

- Node.js 20
- TypeScript
- Express
- Zod
- Pino
- prom-client
- googleapis
- dotenv
- Vitest
- Supertest
- tsx
- npm

## Estructura

```text
.
â”œâ”€â”€ package.json
â”œâ”€â”€ tsconfig.json
â”œâ”€â”€ .gitignore
â”œâ”€â”€ .env.example
â”œâ”€â”€ README.md
â”œâ”€â”€ Dockerfile
â”œâ”€â”€ src
â”‚   â”œâ”€â”€ app.ts
â”‚   â”œâ”€â”€ server.ts
â”‚   â”œâ”€â”€ config
â”‚   â”‚   â”œâ”€â”€ env.ts
â”‚   â”‚   â”œâ”€â”€ logger.ts
â”‚   â”‚   â””â”€â”€ metrics.ts
â”‚   â”œâ”€â”€ middleware
â”‚   â”‚   â”œâ”€â”€ auth.ts
â”‚   â”‚   â”œâ”€â”€ error-handler.ts
â”‚   â”‚   â”œâ”€â”€ not-found.ts
â”‚   â”‚   â”œâ”€â”€ request-id.ts
â”‚   â”‚   â””â”€â”€ validate.ts
â”‚   â”œâ”€â”€ routes
â”‚   â”‚   â”œâ”€â”€ auth.ts
â”‚   â”‚   â”œâ”€â”€ health.ts
â”‚   â”‚   â”œâ”€â”€ metrics.ts
â”‚   â”‚   â””â”€â”€ elevenlabs.ts
â”‚   â”œâ”€â”€ controllers
â”‚   â”‚   â””â”€â”€ elevenlabs.controller.ts
â”‚   â”œâ”€â”€ services
â”‚   â”‚   â”œâ”€â”€ availability.service.ts
â”‚   â”‚   â”œâ”€â”€ calendar.service.ts
â”‚   â”‚   â”œâ”€â”€ google-oauth.service.ts
â”‚   â”‚   â”œâ”€â”€ handoff.service.ts
â”‚   â”‚   â””â”€â”€ lead.service.ts
â”‚   â”œâ”€â”€ repositories
â”‚   â”‚   â”œâ”€â”€ google-oauth-token.repository.ts
â”‚   â”‚   â”œâ”€â”€ lead.repository.ts
â”‚   â”‚   â”œâ”€â”€ handoff.repository.ts
â”‚   â”‚   â””â”€â”€ idempotency.repository.ts
â”‚   â”œâ”€â”€ schemas
â”‚   â”‚   â”œâ”€â”€ check-availability.schema.ts
â”‚   â”‚   â”œâ”€â”€ create-meeting.schema.ts
â”‚   â”‚   â”œâ”€â”€ save-lead-note.schema.ts
â”‚   â”‚   â””â”€â”€ handoff-to-human.schema.ts
â”‚   â”œâ”€â”€ lib
â”‚   â”‚   â”œâ”€â”€ google-auth.ts
â”‚   â”‚   â”œâ”€â”€ time.ts
â”‚   â”‚   â”œâ”€â”€ normalize.ts
â”‚   â”‚   â”œâ”€â”€ redaction.ts
â”‚   â”‚   â””â”€â”€ errors.ts
â”‚   â””â”€â”€ types
â”‚       â””â”€â”€ index.ts
â”œâ”€â”€ data
â”‚   â”œâ”€â”€ leads.json
â”‚   â”œâ”€â”€ handoffs.json
â”‚   â””â”€â”€ idempotency.json
â””â”€â”€ tests
    â”œâ”€â”€ check-availability.spec.ts
    â”œâ”€â”€ create-meeting.spec.ts
    â”œâ”€â”€ google-oauth.spec.ts
    â”œâ”€â”€ handoff-to-human.spec.ts
    â”œâ”€â”€ health.spec.ts
    â”œâ”€â”€ save-lead-note.spec.ts
    â””â”€â”€ test-utils.ts
```

## Desarrollo local

### 1. Instalar dependencias

```bash
npm install
```

### 2. Crear `.env`

```bash
cp .env.example .env
```

En Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

### 3. Arrancar en desarrollo

```bash
npm run dev
```

### 4. Compilar y arrancar modo normal

```bash
npm run build
npm start
```

### 5. Ejecutar tests

```bash
npm test
```

## Exponer localhost con ngrok

1. Arranca el backend en `http://localhost:3000`.
2. Ejecuta:

```bash
ngrok http 3000
```

3. Copia la URL publica `https://...ngrok-free.app`.
4. En ElevenLabs configura cada tool apuntando a esa base URL:
   - `POST https://TU-URL/api/elevenlabs/check-availability`
   - `POST https://TU-URL/api/elevenlabs/create-meeting`
   - `POST https://TU-URL/api/elevenlabs/save-lead-note`
   - `POST https://TU-URL/api/elevenlabs/handoff-to-human`
   - `POST https://TU-URL/api/elevenlabs/qualify-website-project`
5. En el header secreto de ElevenLabs usa `X-Agent-API-Key`.
6. El valor del secreto debe ser exactamente el mismo `AGENT_API_KEY` del backend.

## Variables de entorno

La referencia completa esta en `.env.example`.

| Variable | Para que sirve | De donde sale |
| --- | --- | --- |
| `NODE_ENV` | Modo de ejecucion. | Lo defines tu. |
| `PORT` | Puerto HTTP del backend. | Lo defines tu. |
| `APP_VERSION` | Version expuesta en `GET /`. | Lo defines tu. |
| `LOG_LEVEL` | Nivel de logs Pino. | Lo defines tu. |
| `CORS_ORIGIN` | Origenes permitidos por CORS. | Lo defines tu. |
| `AGENT_API_KEY` | Secreto compartido con ElevenLabs. | Lo generas tu manualmente. |
| `BUSINESS_TIMEZONE` | Timezone principal del negocio. | Debe coincidir con `business_timezone` del agente. |
| `BUSINESS_HOURS_START` | Inicio de horario comercial. | Lo defines tu. |
| `BUSINESS_HOURS_END` | Fin de horario comercial. | Lo defines tu. |
| `DEFAULT_MEETING_DURATION_MINUTES` | Duracion por defecto de la reunion. | Lo defines tu. |
| `GOOGLE_AUTH_MODE` | Selecciona `service_account` u `oauth_user`. | Lo defines tu. |
| `GOOGLE_PROJECT_ID` | Project ID del proyecto GCP. | Sale del JSON de la service account. |
| `GOOGLE_CLIENT_EMAIL` | Email de la service account. | Sale del JSON de la service account. |
| `GOOGLE_PRIVATE_KEY` | Private key de la service account. | Sale del JSON de la service account. |
| `GOOGLE_OAUTH_CLIENT_ID` | OAuth Client ID de tipo Web application. | Sale de Google Cloud OAuth client. |
| `GOOGLE_OAUTH_CLIENT_SECRET` | OAuth Client Secret de tipo Web application. | Sale de Google Cloud OAuth client. |
| `GOOGLE_OAUTH_REDIRECT_URI` | Redirect URI del OAuth client. | Debe coincidir con Google Cloud. |
| `GOOGLE_CALENDAR_ID` | Calendar ID del calendario objetivo. | Sale de Google Calendar. En OAuth puedes usar `primary`. |
| `HANDOFF_PHONE` | Numero humano real del negocio. | Lo define el negocio. |
| `BOOKING_REFERENCE` | Link o referencia opcional de agenda. | Lo defines tu. |
| `DATA_DIR` | Carpeta local para persistencia JSON. | Lo defines tu. |
| `ENABLE_METRICS` | Activa `GET /metrics`. | Lo defines tu. |
| `RATE_LIMIT_WINDOW_MS` | Ventana del limitador por IP. | Lo defines tu. |
| `RATE_LIMIT_MAX_REQUESTS` | Maximo de requests por IP. | Lo defines tu. |
| `ENABLE_SLACK_NOTIFICATIONS` | Activa envios a Slack solo cuando vale `true`. | Lo defines tu. |
| `SLACK_WEBHOOK_URL` | Incoming Webhook URL de Slack. | Sale de Slack Incoming Webhooks. |
| `SLACK_CHANNEL` | Canal esperado, por defecto `#elevenlabs`. | Lo defines tu o queda fijado por el webhook. |
| `SLACK_NOTIFY_MIN_TEMPERATURE` | Temperatura minima para notificar: `cold`, `warm` o `hot`. | Lo defines tu. |
| `SLACK_NOTIFY_ON_SCHEDULE_MEETING` | Notifica si `next_step=schedule_meeting`. | Lo defines tu. |
| `SLACK_APP_NAME` | Nombre informativo para payload/logs. | Lo defines tu. |
| `SLACK_NOTIFICATIONS_TIMEOUT_MS` | Timeout del POST al webhook. | Lo defines tu. |

## Donde sacar cada dato importante

### `AGENT_API_KEY`

- Debe ser el mismo valor que el header secreto que configuras en ElevenLabs.
- Lo generas tu manualmente como string aleatorio largo.
- Recomendacion: 32 bytes o mas.
- En ElevenLabs el secreto ideal es `secret__backend_api_key`.

### `BUSINESS_TIMEZONE`

- Debe coincidir con la variable `business_timezone` del agente.
- En Alma Quinta el valor por defecto esperado es `America/Lima`.

### `GOOGLE_AUTH_MODE`

- `service_account` preserva el flujo actual.
- `oauth_user` habilita el flujo de consentimiento y el uso correcto de attendees.

### `GOOGLE_PROJECT_ID`, `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`

- Salen del JSON de la service account en Google Cloud.
- `GOOGLE_CLIENT_EMAIL` es tambien el email con el que debes compartir el calendario cuando usas `service_account`.
- En `.env`, `GOOGLE_PRIVATE_KEY` debe ir con saltos de linea escapados como `\n`.

### `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`

- Salen de una credencial OAuth tipo `Web application` en Google Cloud.
- `GOOGLE_OAUTH_REDIRECT_URI` debe coincidir exactamente con la configurada en Google Cloud.
- Para desarrollo puedes usar `http://localhost:3000/auth/google/callback`.

### `GOOGLE_CALENDAR_ID`

- Sale de la configuracion del calendario en Google Calendar.
- Con `service_account` suele ser un email o calendar id compartido con la service account.
- Con `oauth_user` puedes usar `primary` para operar sobre el calendario principal del usuario autorizado.

### `HANDOFF_PHONE`

- Es el numero humano real del negocio al que quieres escalar conversaciones.

### `BOOKING_REFERENCE`

- Es un link o referencia opcional que quieres guardar en la descripcion del evento.

### `DATA_DIR`

- Es la carpeta local donde el backend guarda:
  - `leads.json`
  - `handoffs.json`
  - `idempotency.json`
  - `google-oauth-token.json`

## Configuracion de Google Calendar

### Modo A: backward compatible

Usa:

```env
GOOGLE_AUTH_MODE=service_account
```

Comportamiento:

- El backend sigue creando eventos como hoy.
- No se pierde el flujo actual.
- Sigue siendo reversible con un cambio de env var.
- Si no envias `lead_email`, el flujo de `create_meeting` sigue operando igual.

Pasos:

1. Crear o elegir un proyecto en Google Cloud.
2. Habilitar Google Calendar API.
3. Crear una service account.
4. Descargar el JSON de credenciales.
5. Copiar `project_id`, `client_email` y `private_key` al `.env`.
6. Compartir el calendario objetivo con `GOOGLE_CLIENT_EMAIL`.
7. Copiar el `GOOGLE_CALENDAR_ID` correcto.

### Modo B: OAuth 2.0 de usuario

Usa:

```env
GOOGLE_AUTH_MODE=oauth_user
GOOGLE_OAUTH_CLIENT_ID=your-oauth-client-id.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=your-oauth-client-secret
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/auth/google/callback
GOOGLE_CALENDAR_ID=primary
```

Comportamiento:

- El backend usa la cuenta real dueÃ±a del calendario.
- Ya puede mantener `attendees` cuando existe `lead_email`.
- `events.insert` usa `sendUpdates: 'all'`.
- El refresh token se guarda localmente en `DATA_DIR/google-oauth-token.json`.

Pasos:

1. En Google Cloud crea un OAuth Client tipo `Web application`.
2. Agrega exactamente la redirect URI que vas a usar.
3. Completa el `.env` con las variables OAuth.
4. Arranca el backend.
5. Abre `http://localhost:3000/auth/google/start`.
6. Autoriza con la cuenta dueÃ±a del calendario.
7. Google redirigira a `/auth/google/callback`.
8. El backend respondera `Google Calendar connected successfully`.
9. Luego ya puedes probar `create_meeting` con `lead_email`.

## Relacion con las variables del agente de ElevenLabs

Esta API no asume que ElevenLabs mande todo perfecto. Los payloads se normalizan y las respuestas son estables para que luego puedas mapear assignments mejor.

| Variable | Rol recomendado | Como se usa aqui | Secreto |
| --- | --- | --- | --- |
| `agent_display_name` | Contexto del prompt | No es necesaria para el backend. | No |
| `company_name` | Contexto del prompt | No es necesaria para el backend. | No |
| `preferred_language` | Contexto del prompt | Puede orientar conversacion, pero no es requerida por la API. | No |
| `brand_tone` | Contexto del prompt | No es necesaria para el backend. | No |
| `business_hours` | Contexto del prompt | Debe coincidir con `BUSINESS_HOURS_START/END`. | No |
| `business_timezone` | Contexto del prompt + tool | Debe alinearse con `BUSINESS_TIMEZONE`. | No |
| `handoff_phone` | Prompt + fallback de tool | Puede venir en body, pero el fallback real sale de `HANDOFF_PHONE`. | No |
| `booking_reference` | Contexto del prompt | Se mapea al env `BOOKING_REFERENCE`. | No |
| `channel_name` | Body opcional | Se persiste en `save_lead_note`. | No |
| `lead_name` | Body del LLM | Se normaliza y persiste. | No |
| `lead_phone` | Body del LLM | Se normaliza y persiste. | No |
| `lead_email` | Body del LLM | Se normaliza y puede usarse como attendee. | No |
| `lead_language` | Body del LLM | Se normaliza; fallback `es`. | No |
| `lead_interest_category` | Body del LLM | Se persiste. | No |
| `specific_service` | Body del LLM | Se usa para notas y descripcion del evento. | No |
| `requested_quote` | Body del LLM | Se normaliza a boolean. | No |
| `requested_meeting` | Body del LLM o tool state | Se normaliza a boolean o se devuelve desde tools. | No |
| `preferred_date` | Body del LLM o tool state | Se usa para disponibilidad y se devuelve normalizada. | No |
| `preferred_time_range` | Body del LLM o tool state | Se usa para disponibilidad y se devuelve normalizada. | No |
| `conversation_summary` | Body del LLM | Se sanitiza y persiste. | No |
| `lead_status` | Tool state | Se normaliza y se devuelve actualizado por tools. | No |
| `escalation_reason` | Body del LLM | Se usa en handoff; fallback predefinido. | No |
| `meeting_booked` | Tool output | Debe venir desde `create_meeting`. | No |
| `calendar_event_id` | Tool output | Debe venir desde `create_meeting`. | No |
| `calendar_event_link` | Tool output | Debe venir desde `create_meeting`. | No |

### Resumen practico

- Variables solo de contexto del prompt:
  - `agent_display_name`
  - `company_name`
  - `preferred_language`
  - `brand_tone`
- Variables que el LLM puede mandar en body:
  - Casi todas las de lead, agenda y resumen conversacional.
- Variables que idealmente deben devolverse desde tools:
  - `lead_status`
  - `requested_meeting`
  - `preferred_date`
  - `preferred_time_range`
  - `meeting_booked`
  - `calendar_event_id`
  - `calendar_event_link`
- Variables que no deben usarse como secretos:
  - Todas las variables conversacionales.
- Unico secreto necesario en ElevenLabs para este backend:
  - `secret__backend_api_key`

## Convencion de respuestas JSON

Todos los endpoints siguen esta base:

```json
{
  "ok": true,
  "tool": "check_availability",
  "request_id": "uuid",
  "availability": {},
  "state": {}
}
```

Si falla:

```json
{
  "ok": false,
  "tool": "create_meeting",
  "request_id": "uuid",
  "error": {
    "type": "google_calendar_error",
    "message": "Google Calendar events insert failed"
  }
}
```

## Endpoints

### `POST /api/elevenlabs/check-availability`

Reglas implementadas:

- Requiere header `X-Agent-API-Key`.
- `preferred_date` es obligatorio.
- Si `preferred_time_range` falta, usa business hours.
- Usa Google Calendar FreeBusy API.
- Genera slots de 30 minutos.
- Sugiere maximo 5 slots.
- `state.requested_meeting = true`
- `state.lead_status = reunion_en_proceso`

### `POST /api/elevenlabs/create-meeting`

Reglas implementadas:

- Requiere `meeting_datetime_iso`.
- Crea evento real con `events.insert`.
- Usa ID deterministico para ayudar a evitar duplicados.
- Usa store local de idempotencia.
- Agrega attendees si viene `lead_email`.
- Usa `sendUpdates: 'all'`.
- `state.lead_status = reunion_agendada`

Ejemplo:

```bash
curl -X POST http://localhost:3000/api/elevenlabs/create-meeting \
  -H "Content-Type: application/json" \
  -H "X-Agent-API-Key: YOUR_SECRET" \
  -d '{
    "lead_name": "Lucia Gomez",
    "lead_phone": "+51999888777",
    "lead_email": "lucia@example.com",
    "meeting_datetime_iso": "2026-05-15T10:00:00-05:00",
    "specific_service": "Membresia Alma Quinta",
    "conversation_summary": "Quiere una reunion de presentacion.",
    "timezone": "America/Lima"
  }'
```

### `POST /api/elevenlabs/save-lead-note`

Reglas implementadas:

- Persiste localmente en `data/leads.json`.
- No bloquea por datos opcionales faltantes.
- Normaliza `requested_quote` y `requested_meeting`.
- Fallbacks:
  - `lead_status = calificando`
  - `lead_language = es`

### `POST /api/elevenlabs/handoff-to-human`

Reglas implementadas:

- Persiste localmente en `data/handoffs.json`.
- `lead_status` final siempre queda `escalado`.
- Si no llega `escalation_reason`, usa `solicitud_explicita_del_usuario`.
- Si no llega `handoff_phone`, usa `HANDOFF_PHONE`.


### `POST /api/elevenlabs/qualify-website-project`

Reglas implementadas:

- Requiere header `X-Agent-API-Key`.
- Valida `Content-Type: application/json`.
- Califica y persiste un proyecto web sin crear reuniones, sin consultar disponibilidad y sin hacer handoff.
- Reutiliza lead por `lead_id`, `conversation_id`, `external_conversation_id`, `phone` o `email`.
- Mapea `phone` a `lead_phone`, `email` a `lead_email`, `project_summary` a `conversation_summary` y `recommended_service` a `specific_service`.
- Persiste `lead_interest_category = web_project`, `requested_quote = true` y `requested_meeting = true` solo cuando `next_step = schedule_meeting`.
- Respeta la politica monotona de `lead_status`; usa `cotizacion_solicitada` sin degradar estados mas avanzados.
- Devuelve `state` con variables listas para assignments de ElevenLabs.
- Envia Slack opcionalmente a `#elevenlabs` si el lead es `warm`, `hot` o si `next_step = schedule_meeting` y `SLACK_NOTIFY_ON_SCHEDULE_MEETING=true`.
- Si Slack falla, la tool responde `ok: true` si la calificacion fue guardada correctamente, y reporta `notifications.slack.status = failed`.

Variables Slack:

```env
ENABLE_SLACK_NOTIFICATIONS=true
SLACK_WEBHOOK_URL=
SLACK_CHANNEL=#elevenlabs
SLACK_NOTIFY_MIN_TEMPERATURE=warm
SLACK_NOTIFY_ON_SCHEDULE_MEETING=true
SLACK_APP_NAME=Alma Quinta Leads
SLACK_NOTIFICATIONS_TIMEOUT_MS=5000
```

Ejemplo:

```bash
curl -X POST http://localhost:3000/api/elevenlabs/qualify-website-project \
  -H "Content-Type: application/json" \
  -H "X-Agent-API-Key: YOUR_SECRET" \
  -d '{
    "lead_name": "Carlos Ramos",
    "company_name": "Clinica Sonrisa",
    "email": "carlos@example.com",
    "phone": "+51999888777",
    "project_type": "landing_page",
    "business_goal": "captar clientes interesados en servicios dentales",
    "current_website": "no tiene web",
    "required_features": "formulario de contacto, boton de WhatsApp",
    "domain_hosting_status": "no tiene dominio ni hosting",
    "available_materials": "tiene logo, no tiene textos",
    "desired_timeline": "en 30 dias",
    "approximate_budget": "no proporcionado",
    "urgency_level": "medium",
    "lead_temperature": "warm",
    "recommended_service": "landing_page",
    "project_summary": "Cliente necesita una landing page para captar leads de una clinica dental. Tiene logo, pero necesita apoyo con textos, dominio y estructura.",
    "next_step": "schedule_meeting",
    "timezone": "America/Lima",
    "conversation_id": "conv_test_001",
    "external_conversation_id": "wa_test_001"
  }'
```
### `GET /auth/google/start`

- Solo aplica cuando `GOOGLE_AUTH_MODE=oauth_user`.
- Redirige al consentimiento de Google.
- Usa:
  - `access_type=offline`
  - `include_granted_scopes=true`
  - `prompt=consent`
  - scope `https://www.googleapis.com/auth/calendar.events`

### `GET /auth/google/callback`

- Recibe el `code`.
- Lo canjea por tokens.
- Guarda el `refresh_token`.
- Responde `Google Calendar connected successfully`.

## Metricas

Expuestas en:

```bash
curl http://localhost:3000/metrics
```

Metricas implementadas:

| Metrica | Significado | Como leerla |
| --- | --- | --- |
| `http_requests_total{method,route,status_code}` | Total de requests por ruta. | Sirve para ver trafico y errores por endpoint. |
| `http_request_duration_ms{method,route}` | Histograma de latencia HTTP. | Mira percentiles y buckets altos. |
| `elevenlabs_tool_requests_total{tool}` | Requests entrantes por tool. | Volumen real de uso del agente. |
| `elevenlabs_tool_success_total{tool}` | Respuestas exitosas por tool. | Tasa de exito por herramienta. |
| `elevenlabs_tool_failure_total{tool,error_type}` | Fallos por tool y tipo de error. | Detecta auth, validacion o fallos Google. |
| `auth_failures_total` | Fallos de API key. | Senal de configuracion incorrecta o abuso. |
| `validation_failures_total{tool}` | Fallos por payload invalido. | Te dice si el LLM esta mandando campos pobres. |
| `google_calendar_api_calls_total{operation,status}` | Llamadas a Google Calendar. | Distingue `freebusy_query`, `events_insert`, `events_get`. |
| `google_calendar_api_duration_ms{operation}` | Histograma de latencia Google. | Sirve para monitorear lentitud upstream. |
| `google_calendar_freebusy_conflicts_total` | Ventanas ocupadas detectadas por FreeBusy. | Mide cuanta ocupacion devuelve Calendar. |
| `meetings_created_total` | Reuniones creadas con exito. | KPI de agendamiento. |
| `meetings_create_failures_total` | Fallos al crear reuniones. | Alertas sobre problemas con Google Calendar. |
| `lead_notes_saved_total` | Notas de lead guardadas. | Volumen de persistencia local. |
| `handoffs_created_total` | Handoffs creados. | Cuantas conversaciones escalan a humano. |
| `idempotency_hits_total` | Respuestas servidas desde idempotencia. | Detecta reintentos o duplicados evitados. |

## Logging

Cada request registra:

- `request_id`
- `route`
- `method`
- `tool_name` si aplica
- `duration_ms`
- `status_code`
- `auth_result`
- `error_type` cuando existe

Eventos de negocio:

- `availability_checked`
- `meeting_created`
- `lead_note_saved`
- `handoff_created`
- `google_calendar_error`
- `validation_error`
- `auth_failure`
- `google_oauth_start`
- `google_oauth_callback_success`
- `google_oauth_callback_failed`
- `google_oauth_not_connected`

Protecciones de logging:

- No se loggea la private key.
- No se loggea la API key completa.
- Email y telefono se enmascaran en logs de negocio.
- El refresh token OAuth no se imprime en logs.

## Seguridad minima implementada

- `helmet`
- `cors` configurable por `CORS_ORIGIN`
- rate limiting simple por IP
- autenticacion via `X-Agent-API-Key`
- limite de body JSON de `100kb`
- validacion de `Content-Type: application/json` en POST
- manejo centralizado de errores
- sin stack traces en produccion

## Persistencia local

Archivos:

- `data/leads.json`
- `data/handoffs.json`
- `data/idempotency.json`
- `data/google-oauth-token.json`

Detalles:

- Se crean automaticamente si no existen.
- La escritura es serializada por repositorio.
- La persistencia usa archivo temporal + rename.
- No hay base de datos externa en esta v1.

## Decisiones de implementacion

- `check_availability` usa FreeBusy API real y slots de 30 minutos.
- Si una franja concreta no tiene huecos y no era la franja completa del negocio, se amplia al horario comercial del mismo dia.
- `create_meeting` usa un event ID deterministico basado en lead + fecha para reducir duplicados.
- Ademas se guarda una respuesta en `idempotency.json` para tolerar reintentos.
- Google Calendar soporta dos estrategias de auth configurables por `GOOGLE_AUTH_MODE`.
- El refresh token OAuth se persiste en `DATA_DIR/google-oauth-token.json`.
- Cuando `GOOGLE_AUTH_MODE=oauth_user`, el backend exige conexion previa y muestra un error accionable si falta el refresh token.
- `events.insert` usa `sendUpdates: 'all'` para invitaciones reales a attendees.
- `GOOGLE_PRIVATE_KEY` se normaliza reemplazando `\n` por saltos reales.
- Los schemas Zod son tolerantes con valores string/number enviados por el LLM.

## Health checks

- `GET /`
  - Devuelve `service`, `version`, `environment`, `uptime`.
- `GET /health/live`
  - Indica que el proceso esta vivo.
- `GET /health/ready`
  - Verifica configuracion cargada.
  - Verifica acceso al directorio de datos.
  - Verifica que el cliente de Google pueda inicializarse.
  - En `oauth_user`, falla de forma accionable si todavia no existe refresh token.

## Docker

Build:

```bash
docker build -t alma-quinta-elevenlabs-backend .
```

Run:

```bash
docker run --rm -p 3000:3000 --env-file .env alma-quinta-elevenlabs-backend
```

## Probar manualmente

### Flujo A: rollback / compatibilidad

1. En `.env` usa:

```env
GOOGLE_AUTH_MODE=service_account
```

2. Arranca el backend.
3. Llama `POST /api/elevenlabs/create-meeting`.
4. El backend sigue creando eventos como hoy.

### Flujo B: OAuth listo para attendees reales

1. En `.env` usa:

```env
GOOGLE_AUTH_MODE=oauth_user
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/auth/google/callback
GOOGLE_CALENDAR_ID=primary
```

2. Arranca el backend.
3. Abre en navegador:

```text
http://localhost:3000/auth/google/start
```

4. Autoriza con la cuenta duena del calendario.
5. Completa el callback.
6. Verifica que exista `data/google-oauth-token.json`.
7. Llama `POST /api/elevenlabs/create-meeting` enviando `lead_email`.
8. Google Calendar ya podra crear el evento con attendees reales.

## Estado monotono del lead

El backend aplica una politica monotona para `lead_status` en cualquier persistencia del lead:

- Orden explicito: `nuevo` < `calificando` < `cotizacion_solicitada` < `reunion_en_proceso` < `reunion_agendada` < `escalado` < `cerrado`
- La regla central vive en `src/lib/lead-status.ts`
- `save_lead_note` solo usa `calificando` como default cuando el lead aun no tiene estado previo
- Si llega un estado mas atrasado que el ya persistido, se conserva el mas avanzado
- `create_meeting` persiste `reunion_agendada` sin perder estados aun mas avanzados
- `handoff_to_human` promueve el lead a `escalado`

## Identidad compartida entre tools

Las tools aceptan de forma opcional y compatible:

- `lead_id`
- `conversation_id`
- `external_conversation_id`

Comportamiento:

- `save_lead_note` crea o reutiliza el `lead_id` y lo devuelve en `state`
- `create_meeting` reutiliza el lead previo cuando puede resolverlo por `lead_id`, `conversation_id`, `external_conversation_id`, `lead_phone` o `lead_email`
- `handoff_to_human` reutiliza la misma identidad y la devuelve en `state` y `handoff`
- `check_availability` acepta y devuelve estos identificadores para mantener correlacion en ElevenLabs
- La persistencia de leads guarda la ultima `conversation_id` y `external_conversation_id` conocidas del lead

## Enriquecimiento de handoff

`handoff_to_human` intenta completar `lead_email` cuando no llega en el request:

1. Usa `lead_email` del request si existe.
2. Si falta, busca un lead previo en este orden: `lead_id`, `conversation_id`, `external_conversation_id`, `lead_phone`, `lead_email`.
3. Si encuentra un lead confiable, reutiliza su `lead_email`.
4. Si no encuentra coincidencia confiable, mantiene `lead_email = null` y deja trazabilidad en logs.

## Idempotencia de create_meeting

`create_meeting` ahora usa una estrategia de dos capas:

1. Store persistente en `data/idempotency.json`
   - Estados: `in_progress`, `succeeded`, `failed_retryable`, `failed_final`
   - Si una key ya termino en `succeeded`, se reutiliza exactamente la respuesta previa
   - Si una key esta `in_progress` dentro del TTL, no se dispara otro `events.insert`
2. Event ID deterministico en Google Calendar
   - Se deriva de la key de idempotencia efectiva
   - Si hubo un fallo intermedio despues del insert pero antes de persistir el exito local, un retry cae en `409` y el backend recupera el evento con `events.get`

Detalles practicos:

- `create_meeting` acepta `idempotency_key` opcional
- Si no llega, el backend genera un fingerprint estable con `lead_id` o contacto, `meeting_datetime_iso`, `specific_service` y `timezone`
- La respuesta agrega `idempotency: { reused, key }` sin romper el contrato previo
- El evento de Google Calendar guarda `extendedProperties.private` con `idempotency_key`, `lead_id`, `conversation_id` y `external_conversation_id`

