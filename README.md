# Alma Quinta ElevenLabs Backend

Backend HTTP en Node.js 20 + TypeScript para tools de ElevenLabs integradas con Google Calendar y persistencia local simple.

Este servicio esta pensado para un agente de ElevenLabs que conversa por WhatsApp en texto y llama tools externas via HTTP. No usa SDK de ElevenLabs: expone endpoints REST estables, autenticados por `X-Agent-API-Key`, tolerantes a payloads incompletos y listos para futuros assignments.

## Que incluye

- `POST /api/elevenlabs/check-availability`
- `POST /api/elevenlabs/create-meeting`
- `POST /api/elevenlabs/save-lead-note`
- `POST /api/elevenlabs/handoff-to-human`
- `GET /`
- `GET /health/live`
- `GET /health/ready`
- `GET /metrics`
- Google Calendar via service account
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
├── package.json
├── tsconfig.json
├── .gitignore
├── .env.example
├── README.md
├── Dockerfile
├── src
│   ├── app.ts
│   ├── server.ts
│   ├── config
│   │   ├── env.ts
│   │   ├── logger.ts
│   │   └── metrics.ts
│   ├── middleware
│   │   ├── auth.ts
│   │   ├── error-handler.ts
│   │   ├── not-found.ts
│   │   ├── request-id.ts
│   │   └── validate.ts
│   ├── routes
│   │   ├── health.ts
│   │   ├── metrics.ts
│   │   └── elevenlabs.ts
│   ├── controllers
│   │   └── elevenlabs.controller.ts
│   ├── services
│   │   ├── availability.service.ts
│   │   ├── calendar.service.ts
│   │   ├── handoff.service.ts
│   │   └── lead.service.ts
│   ├── repositories
│   │   ├── lead.repository.ts
│   │   ├── handoff.repository.ts
│   │   └── idempotency.repository.ts
│   ├── schemas
│   │   ├── check-availability.schema.ts
│   │   ├── create-meeting.schema.ts
│   │   ├── save-lead-note.schema.ts
│   │   └── handoff-to-human.schema.ts
│   ├── lib
│   │   ├── google-auth.ts
│   │   ├── time.ts
│   │   ├── normalize.ts
│   │   ├── redaction.ts
│   │   └── errors.ts
│   └── types
│       └── index.ts
├── data
│   ├── leads.json
│   ├── handoffs.json
│   └── idempotency.json
└── tests
    ├── health.spec.ts
    ├── check-availability.spec.ts
    ├── create-meeting.spec.ts
    ├── save-lead-note.spec.ts
    ├── handoff-to-human.spec.ts
    └── test-utils.ts
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
| `GOOGLE_PROJECT_ID` | Project ID del proyecto GCP. | Sale del JSON de la service account. |
| `GOOGLE_CLIENT_EMAIL` | Email de la service account. | Sale del JSON de la service account. |
| `GOOGLE_PRIVATE_KEY` | Private key de la service account. | Sale del JSON de la service account. |
| `GOOGLE_CALENDAR_ID` | Calendar ID del calendario objetivo. | Sale de la configuracion del calendario en Google Calendar. |
| `HANDOFF_PHONE` | Numero humano real del negocio. | Lo define el negocio. |
| `BOOKING_REFERENCE` | Link o referencia opcional de agenda. | Lo defines tu. |
| `DATA_DIR` | Carpeta local para persistencia JSON. | Lo defines tu. |
| `ENABLE_METRICS` | Activa `GET /metrics`. | Lo defines tu. |
| `RATE_LIMIT_WINDOW_MS` | Ventana del limitador por IP. | Lo defines tu. |
| `RATE_LIMIT_MAX_REQUESTS` | Maximo de requests por IP. | Lo defines tu. |

## Donde sacar cada dato importante

### `AGENT_API_KEY`

- Debe ser el mismo valor que el header secreto que configuras en ElevenLabs.
- Lo generas tu manualmente como string aleatorio largo.
- Recomendacion: 32 bytes o mas.
- En ElevenLabs el secreto ideal es `secret__backend_api_key`.

### `BUSINESS_TIMEZONE`

- Debe coincidir con la variable `business_timezone` del agente.
- En Alma Quinta el valor por defecto esperado es `America/Lima`.

### `GOOGLE_PROJECT_ID`

- Sale del JSON de la service account en Google Cloud.

### `GOOGLE_CLIENT_EMAIL`

- Sale del JSON de la service account.
- Ese mismo email es el que debes usar para compartir el calendario objetivo en Google Calendar.

### `GOOGLE_PRIVATE_KEY`

- Sale del JSON de la service account.
- En `.env` debes pegarla con saltos de linea escapados como `\n`.
- Ejemplo:

```env
GOOGLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nABC123...\n-----END PRIVATE KEY-----\n
```

### `GOOGLE_CALENDAR_ID`

- Sale de la configuracion del calendario en Google Calendar.
- Puede ser un email o un `calendar id`.
- En esta arquitectura el calendario debe estar compartido con la service account.

### `HANDOFF_PHONE`

- Es el numero humano real del negocio al que quieres escalar conversaciones.

### `BOOKING_REFERENCE`

- Es un link o referencia opcional que quieres guardar en la descripcion del evento.

### `DATA_DIR`

- Es la carpeta local donde el backend guarda:
  - `leads.json`
  - `handoffs.json`
  - `idempotency.json`

## Configuracion de Google Calendar

### Flujo usado

- Esta v1 usa service account.
- No implementa OAuth interactivo.
- El calendario objetivo debe compartirse manualmente con el email de la service account.
- El backend usa scopes minimos razonables para lectura y creacion de eventos.

### Pasos

1. Crear o elegir un proyecto en Google Cloud.
2. Habilitar Google Calendar API.
3. Crear una service account.
4. Descargar el JSON de credenciales.
5. Copiar `project_id`, `client_email` y `private_key` al `.env`.
6. Compartir el calendario objetivo con `GOOGLE_CLIENT_EMAIL`.
7. Copiar el `GOOGLE_CALENDAR_ID` correcto.

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

Ejemplo:

```bash
curl -X POST http://localhost:3000/api/elevenlabs/check-availability \
  -H "Content-Type: application/json" \
  -H "X-Agent-API-Key: YOUR_SECRET" \
  -d '{
    "lead_name": "Maria Perez",
    "preferred_date": "2026-05-10",
    "preferred_time_range": "manana",
    "specific_service": "Visita guiada",
    "conversation_summary": "Quiere saber si hay espacio para una reunion informativa.",
    "timezone": "America/Lima"
  }'
```

Respuesta resumida:

```json
{
  "ok": true,
  "tool": "check_availability",
  "availability": {
    "available": true,
    "suggested_slots": [
      {
        "start_iso": "2026-05-10T09:30:00-05:00",
        "end_iso": "2026-05-10T10:00:00-05:00",
        "label": "2026-05-10 09:30"
      }
    ]
  },
  "state": {
    "requested_meeting": true,
    "preferred_date": "2026-05-10",
    "preferred_time_range": "09:00-12:00",
    "lead_status": "reunion_en_proceso"
  }
}
```

### `POST /api/elevenlabs/create-meeting`

Reglas implementadas:

- Requiere `meeting_datetime_iso`.
- Crea evento real con `events.insert`.
- Usa ID deterministico para ayudar a evitar duplicados.
- Usa store local de idempotencia.
- Agrega attendees si viene `lead_email`.
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

Respuesta resumida:

```json
{
  "ok": true,
  "tool": "create_meeting",
  "booking": {
    "meeting_booked": true,
    "calendar_event_id": "google-event-123",
    "calendar_event_link": "https://calendar.google.com/...",
    "meeting_datetime_iso": "2026-05-15T10:00:00-05:00",
    "timezone": "America/Lima"
  },
  "state": {
    "lead_status": "reunion_agendada",
    "preferred_date": "2026-05-15",
    "preferred_time_range": "10:00-10:30",
    "requested_meeting": true
  }
}
```

### `POST /api/elevenlabs/save-lead-note`

Reglas implementadas:

- Persiste localmente en `data/leads.json`.
- No bloquea por datos opcionales faltantes.
- Normaliza `requested_quote` y `requested_meeting`.
- Fallbacks:
  - `lead_status = calificando`
  - `lead_language = es`

Ejemplo:

```bash
curl -X POST http://localhost:3000/api/elevenlabs/save-lead-note \
  -H "Content-Type: application/json" \
  -H "X-Agent-API-Key: YOUR_SECRET" \
  -d '{
    "lead_name": "Carlos Torres",
    "lead_phone": "+51987654321",
    "lead_email": "carlos@example.com",
    "lead_interest_category": "Membresias",
    "specific_service": "Membresia premium",
    "requested_quote": "si",
    "requested_meeting": false,
    "conversation_summary": "Solicita cotizacion.",
    "channel_name": "whatsapp"
  }'
```

Respuesta resumida:

```json
{
  "ok": true,
  "tool": "save_lead_note",
  "lead": {
    "lead_name": "Carlos Torres",
    "lead_email": "carlos@example.com",
    "requested_quote": true,
    "requested_meeting": false,
    "lead_status": "calificando"
  },
  "state": {
    "lead_status": "calificando"
  }
}
```

### `POST /api/elevenlabs/handoff-to-human`

Reglas implementadas:

- Persiste localmente en `data/handoffs.json`.
- `lead_status` final siempre queda `escalado`.
- Si no llega `escalation_reason`, usa `solicitud_explicita_del_usuario`.
- Si no llega `handoff_phone`, usa `HANDOFF_PHONE`.

Ejemplo:

```bash
curl -X POST http://localhost:3000/api/elevenlabs/handoff-to-human \
  -H "Content-Type: application/json" \
  -H "X-Agent-API-Key: YOUR_SECRET" \
  -d '{
    "lead_name": "Ana Ruiz",
    "lead_phone": "+51955444333",
    "conversation_summary": "Quiere hablar con una persona del equipo."
  }'
```

Respuesta resumida:

```json
{
  "ok": true,
  "tool": "handoff_to_human",
  "handoff": {
    "success": true,
    "escalation_reason": "solicitud_explicita_del_usuario",
    "handoff_phone": "+51999888777"
  },
  "state": {
    "lead_status": "escalado"
  }
}
```

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

Protecciones de logging:

- No se loggea la private key.
- No se loggea la API key completa.
- Email y telefono se enmascaran en logs de negocio.

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

Detalles:

- Se crean automaticamente si no existen.
- La escritura es serializada por repositorio.
- La persistencia usa archivo temporal + rename.
- No hay base de datos externa en esta v1.

## Decisiones de implementacion

- `check_availability` usa FreeBusy API real y slots de 30 minutos.
- Si una franja concreta no tiene huecos y no era la franja completa del negocio, se amplía al horario comercial del mismo dia.
- `create_meeting` usa un event ID deterministico basado en lead + fecha para reducir duplicados.
- Ademas se guarda una respuesta en `idempotency.json` para tolerar reintentos.
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

1. Arranca el backend.
2. Lanza cualquiera de los `curl` anteriores.
3. Revisa `GET /metrics`.
4. Revisa el contenido de `data/leads.json` y `data/handoffs.json`.

