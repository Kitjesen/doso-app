export class BridgeError extends Error {
  constructor(code, message, httpStatus) {
    super(message);
    this.name = 'BridgeError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export const ERRORS = Object.freeze({
  invalidRequest: Object.freeze({ code: 'INVALID_REQUEST', message: 'The request is not valid.', httpStatus: 400 }),
  invalidQuery: Object.freeze({ code: 'INVALID_QUERY', message: 'Query parameters are not supported.', httpStatus: 400 }),
  invalidRequestId: Object.freeze({ code: 'INVALID_REQUEST_ID', message: 'x-request-id must be a UUID.', httpStatus: 400 }),
  unauthorized: Object.freeze({ code: 'UNAUTHORIZED', message: 'Valid bearer authentication is required.', httpStatus: 401 }),
  forbiddenOrigin: Object.freeze({ code: 'FORBIDDEN_ORIGIN', message: 'The request origin is not allowed.', httpStatus: 403 }),
  forbiddenPreflight: Object.freeze({ code: 'FORBIDDEN_PREFLIGHT', message: 'The CORS preflight request is not allowed.', httpStatus: 403 }),
  methodNotAllowed: Object.freeze({ code: 'METHOD_NOT_ALLOWED', message: 'The HTTP method is not allowed.', httpStatus: 405 }),
  notFound: Object.freeze({ code: 'NOT_FOUND', message: 'The requested resource was not found.', httpStatus: 404 }),
  busy: Object.freeze({ code: 'BUSY', message: 'The diagnostics gateway is busy.', httpStatus: 429 }),
  upstreamTimeout: Object.freeze({ code: 'UPSTREAM_TIMEOUT', message: 'Brainstem did not respond before the read deadline.', httpStatus: 504 }),
  upstreamUnavailable: Object.freeze({ code: 'UPSTREAM_UNAVAILABLE', message: 'Brainstem status is unavailable.', httpStatus: 503 }),
  invalidUpstreamResponse: Object.freeze({ code: 'INVALID_UPSTREAM_RESPONSE', message: 'Brainstem returned an invalid status response.', httpStatus: 502 }),
  responseTooLarge: Object.freeze({ code: 'RESPONSE_TOO_LARGE', message: 'The diagnostics response exceeded its safety limit.', httpStatus: 500 }),
  internal: Object.freeze({ code: 'INTERNAL_ERROR', message: 'The diagnostics request could not be completed.', httpStatus: 500 }),
});

export function bridgeError(definition) {
  return new BridgeError(definition.code, definition.message, definition.httpStatus);
}
