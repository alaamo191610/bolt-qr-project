export const ERROR_CODES = Object.freeze({
  AUTHENTICATION_REQUIRED: 'AUTHENTICATION_REQUIRED',
  ACCESS_DENIED: 'ACCESS_DENIED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  ORDER_TYPE_DISABLED: 'ORDER_TYPE_DISABLED',
  TABLE_SESSION_REQUIRED: 'TABLE_SESSION_REQUIRED',
  TABLE_SESSION_INVALID: 'TABLE_SESSION_INVALID',
  IDEMPOTENCY_KEY_REQUIRED: 'IDEMPOTENCY_KEY_REQUIRED',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  SERVER_ERROR: 'SERVER_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
});

const statusToCode = status => {
  if (status === 401) return ERROR_CODES.AUTHENTICATION_REQUIRED;
  if (status === 403) return ERROR_CODES.ACCESS_DENIED;
  if (status === 409) return ERROR_CODES.CONFLICT;
  if (status === 429) return ERROR_CODES.RATE_LIMITED;
  if (status >= 400 && status < 500) return ERROR_CODES.VALIDATION_ERROR;
  if (status >= 500) return ERROR_CODES.SERVER_ERROR;
  return ERROR_CODES.UNKNOWN_ERROR;
};

export class ApiError extends Error {
  constructor(message, {
    status = 500,
    code = statusToCode(status),
    retryAfter,
    cause,
  } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

export const errorCodeForStatus = status => statusToCode(Number(status));

const safeMessageForStatus = status => Number(status) >= 500
  ? 'Internal server error'
  : 'Request failed';

export const normalizeErrorResponse = (body, status, requestId) => {
  const normalizedStatus = Number(status) || 500;
  const error = body instanceof ApiError ? body : null;
  const { stack: _stack, details: _details, ...safeBody } = body || {};
  const message = error
    ? (normalizedStatus >= 500 ? safeMessageForStatus(normalizedStatus) : error.message)
    : (normalizedStatus >= 500 ? safeMessageForStatus(normalizedStatus) : body?.error);

  return {
    ...safeBody,
    error: message || safeMessageForStatus(normalizedStatus),
    code: body?.code || error?.code || errorCodeForStatus(normalizedStatus),
    requestId: body?.requestId || requestId,
    ...(body?.retryAfter === undefined && error?.retryAfter !== undefined
      ? { retryAfter: error.retryAfter }
      : {}),
  };
};

export const sendError = (res, req, error) => {
  const status = Number(error?.status) || 500;
  const response = normalizeErrorResponse({
    error: status >= 500 ? safeMessageForStatus(status) : error?.message,
    code: error?.code,
    retryAfter: error?.retryAfter,
  }, status, req?.requestId);

  if (response.retryAfter !== undefined) {
    res.setHeader('Retry-After', String(response.retryAfter));
  }
  return res.status(status).json(response);
};

export const logSafeError = error => ({
  name: error?.name || 'Error',
  code: error?.code,
  status: error?.status,
  message: error?.message,
});
