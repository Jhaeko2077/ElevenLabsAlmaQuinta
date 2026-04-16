import { Counter, Histogram, Registry } from 'prom-client';

import type { AppEnv } from '../types';

export class AppMetrics {
  public readonly register: Registry;
  public readonly httpRequestsTotal: Counter<'method' | 'route' | 'status_code'>;
  public readonly httpRequestDurationMs: Histogram<'method' | 'route'>;
  public readonly elevenlabsToolRequestsTotal: Counter<'tool'>;
  public readonly elevenlabsToolSuccessTotal: Counter<'tool'>;
  public readonly elevenlabsToolFailureTotal: Counter<'tool' | 'error_type'>;
  public readonly authFailuresTotal: Counter<string>;
  public readonly validationFailuresTotal: Counter<'tool'>;
  public readonly googleCalendarApiCallsTotal: Counter<'operation' | 'status'>;
  public readonly googleCalendarApiDurationMs: Histogram<'operation'>;
  public readonly googleCalendarFreebusyConflictsTotal: Counter<string>;
  public readonly meetingsCreatedTotal: Counter<string>;
  public readonly meetingsCreateFailuresTotal: Counter<string>;
  public readonly leadNotesSavedTotal: Counter<string>;
  public readonly handoffsCreatedTotal: Counter<string>;
  public readonly idempotencyHitsTotal: Counter<string>;

  public constructor(env: AppEnv) {
    this.register = new Registry();
    this.register.setDefaultLabels({
      service: 'alma-quinta-elevenlabs-backend',
      environment: env.NODE_ENV,
    });

    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total de requests HTTP procesados por método, ruta y código de estado.',
      labelNames: ['method', 'route', 'status_code'] as const,
      registers: [this.register],
    });

    this.httpRequestDurationMs = new Histogram({
      name: 'http_request_duration_ms',
      help: 'Duración de requests HTTP en milisegundos por método y ruta.',
      labelNames: ['method', 'route'] as const,
      buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
      registers: [this.register],
    });

    this.elevenlabsToolRequestsTotal = new Counter({
      name: 'elevenlabs_tool_requests_total',
      help: 'Cantidad total de requests recibidos por tool de ElevenLabs.',
      labelNames: ['tool'] as const,
      registers: [this.register],
    });

    this.elevenlabsToolSuccessTotal = new Counter({
      name: 'elevenlabs_tool_success_total',
      help: 'Cantidad total de respuestas exitosas por tool de ElevenLabs.',
      labelNames: ['tool'] as const,
      registers: [this.register],
    });

    this.elevenlabsToolFailureTotal = new Counter({
      name: 'elevenlabs_tool_failure_total',
      help: 'Cantidad total de fallos por tool y tipo de error.',
      labelNames: ['tool', 'error_type'] as const,
      registers: [this.register],
    });

    this.authFailuresTotal = new Counter({
      name: 'auth_failures_total',
      help: 'Cantidad total de fallos de autenticación por API key.',
      registers: [this.register],
    });

    this.validationFailuresTotal = new Counter({
      name: 'validation_failures_total',
      help: 'Cantidad total de errores de validación por tool.',
      labelNames: ['tool'] as const,
      registers: [this.register],
    });

    this.googleCalendarApiCallsTotal = new Counter({
      name: 'google_calendar_api_calls_total',
      help: 'Cantidad total de llamadas a Google Calendar por operación y estado.',
      labelNames: ['operation', 'status'] as const,
      registers: [this.register],
    });

    this.googleCalendarApiDurationMs = new Histogram({
      name: 'google_calendar_api_duration_ms',
      help: 'Duración de llamadas a Google Calendar en milisegundos por operación.',
      labelNames: ['operation'] as const,
      buckets: [25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
      registers: [this.register],
    });

    this.googleCalendarFreebusyConflictsTotal = new Counter({
      name: 'google_calendar_freebusy_conflicts_total',
      help: 'Cantidad total de ventanas ocupadas reportadas por FreeBusy.',
      registers: [this.register],
    });

    this.meetingsCreatedTotal = new Counter({
      name: 'meetings_created_total',
      help: 'Cantidad total de reuniones creadas exitosamente.',
      registers: [this.register],
    });

    this.meetingsCreateFailuresTotal = new Counter({
      name: 'meetings_create_failures_total',
      help: 'Cantidad total de fallos al crear reuniones.',
      registers: [this.register],
    });

    this.leadNotesSavedTotal = new Counter({
      name: 'lead_notes_saved_total',
      help: 'Cantidad total de notas de lead guardadas.',
      registers: [this.register],
    });

    this.handoffsCreatedTotal = new Counter({
      name: 'handoffs_created_total',
      help: 'Cantidad total de handoffs creados.',
      registers: [this.register],
    });

    this.idempotencyHitsTotal = new Counter({
      name: 'idempotency_hits_total',
      help: 'Cantidad total de respuestas devueltas desde el store de idempotencia.',
      registers: [this.register],
    });
  }

  public recordHttpRequest(input: {
    method: string;
    route: string;
    statusCode: number;
    durationMs: number;
  }): void {
    this.httpRequestsTotal.inc({
      method: input.method,
      route: input.route,
      status_code: String(input.statusCode),
    });

    this.httpRequestDurationMs.observe(
      {
        method: input.method,
        route: input.route,
      },
      input.durationMs,
    );
  }

  public recordToolFailure(tool: string, errorType: string): void {
    this.elevenlabsToolFailureTotal.inc({
      tool,
      error_type: errorType,
    });
  }

  public recordGoogleApiCall(operation: string, status: 'success' | 'failure', durationMs: number): void {
    this.googleCalendarApiCallsTotal.inc({
      operation,
      status,
    });

    this.googleCalendarApiDurationMs.observe(
      {
        operation,
      },
      durationMs,
    );
  }
}

export function createMetrics(env: AppEnv): AppMetrics {
  return new AppMetrics(env);
}
