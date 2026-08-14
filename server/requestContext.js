import { randomUUID } from 'crypto';
import { normalizeErrorResponse } from './errors.js';

const ACCEPTED_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export const getRequestId = value => {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === 'string' && ACCEPTED_REQUEST_ID.test(candidate)
    ? candidate
    : randomUUID();
};

export const createRequestContextMiddleware = ({
  logger = process.env.NODE_ENV === 'test' ? () => {} : line => console.info(line),
  clock = () => Date.now(),
} = {}) => (req, res, next) => {
  const startedAt = clock();
  req.requestId = getRequestId(req.get('X-Request-Id'));
  res.setHeader('X-Request-Id', req.requestId);

  // Existing routes can continue to return { error }, while this boundary
  // guarantees the machine-readable contract and redacts 5xx details.
  const json = res.json.bind(res);
  res.json = body => {
    if (body && typeof body === 'object' && !Array.isArray(body) && body.error) {
      return json(normalizeErrorResponse(body, res.statusCode, req.requestId));
    }
    return json(body);
  };

  res.on('finish', () => {
    logger(JSON.stringify({
      event: 'http_request',
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Math.max(0, clock() - startedAt),
      tenantId: req.auth?.organizationId || req.user?.organizationId,
      userId: req.auth?.userId || req.user?.userId,
    }));
  });

  next();
};
