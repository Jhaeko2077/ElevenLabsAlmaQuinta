import type { RequestHandler } from 'express';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    ok: false,
    tool: req.toolName ?? 'unknown',
    request_id: req.requestId,
    error: {
      type: 'not_found',
      message: 'Route not found',
    },
  });
};
