import { Router, type RequestHandler } from 'express';

import { AppMetrics } from '../config/metrics';
import { ElevenLabsController } from '../controllers/elevenlabs.controller';
import { asyncHandler } from '../lib/errors';
import { requireJsonContentType } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { checkAvailabilitySchema } from '../schemas/check-availability.schema';
import { createMeetingSchema } from '../schemas/create-meeting.schema';
import { handoffToHumanSchema } from '../schemas/handoff-to-human.schema';
import { saveLeadNoteSchema } from '../schemas/save-lead-note.schema';

function setToolMetadata(
  routeLabel: string,
  toolName: string,
  metrics: AppMetrics,
): RequestHandler {
  return (req, _res, next) => {
    req.routeLabel = routeLabel;
    req.toolName = toolName;
    metrics.elevenlabsToolRequestsTotal.inc({ tool: toolName });
    next();
  };
}

export function createElevenLabsRouter(dependencies: {
  authMiddleware: RequestHandler;
  controller: ElevenLabsController;
  metrics: AppMetrics;
}): Router {
  const router = Router();

  router.post(
    '/api/elevenlabs/check-availability',
    setToolMetadata('/api/elevenlabs/check-availability', 'check_availability', dependencies.metrics),
    dependencies.authMiddleware,
    requireJsonContentType,
    validate(checkAvailabilitySchema, 'check_availability'),
    asyncHandler((req, res) => dependencies.controller.checkAvailability(req, res)),
  );

  router.post(
    '/api/elevenlabs/create-meeting',
    setToolMetadata('/api/elevenlabs/create-meeting', 'create_meeting', dependencies.metrics),
    dependencies.authMiddleware,
    requireJsonContentType,
    validate(createMeetingSchema, 'create_meeting'),
    asyncHandler((req, res) => dependencies.controller.createMeeting(req, res)),
  );

  router.post(
    '/api/elevenlabs/save-lead-note',
    setToolMetadata('/api/elevenlabs/save-lead-note', 'save_lead_note', dependencies.metrics),
    dependencies.authMiddleware,
    requireJsonContentType,
    validate(saveLeadNoteSchema, 'save_lead_note'),
    asyncHandler((req, res) => dependencies.controller.saveLeadNote(req, res)),
  );

  router.post(
    '/api/elevenlabs/handoff-to-human',
    setToolMetadata('/api/elevenlabs/handoff-to-human', 'handoff_to_human', dependencies.metrics),
    dependencies.authMiddleware,
    requireJsonContentType,
    validate(handoffToHumanSchema, 'handoff_to_human'),
    asyncHandler((req, res) => dependencies.controller.handoffToHuman(req, res)),
  );

  return router;
}
