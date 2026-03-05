/**
 * Centralized error catalog for MemeLab Notify API.
 *
 * Usage:
 *   throw new AppError(400, 'VALIDATION_FAILED', 'Invalid chat ID');
 *   throw AppError.notFound('Streamer');
 *   throw AppError.conflict('Chat already connected');
 */

export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'BAD_GATEWAY'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL_ERROR'
  | 'BOT_ACCESS_DENIED'
  | 'PROVIDER_ERROR'
  | 'LIMIT_EXCEEDED';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }

  /** Serialize to standard JSON envelope */
  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }

  // ─── Factory Methods ─────────────────────────────────

  static badRequest(message: string, details?: Record<string, unknown>) {
    return new AppError(400, 'VALIDATION_FAILED', message, details);
  }

  static unauthorized(message = 'Authentication required') {
    return new AppError(401, 'UNAUTHORIZED', message);
  }

  static forbidden(message = 'Access denied') {
    return new AppError(403, 'FORBIDDEN', message);
  }

  static notFound(resource: string) {
    return new AppError(404, 'NOT_FOUND', `${resource} not found`);
  }

  static conflict(message: string) {
    return new AppError(409, 'CONFLICT', message);
  }

  static rateLimited(message = 'Too many requests') {
    return new AppError(429, 'RATE_LIMITED', message);
  }

  static badGateway(message: string) {
    return new AppError(502, 'BAD_GATEWAY', message);
  }

  static internal(message = 'Internal server error') {
    return new AppError(500, 'INTERNAL_ERROR', message);
  }

  static limitExceeded(message: string) {
    return new AppError(400, 'LIMIT_EXCEEDED', message);
  }

  static providerError(message: string) {
    return new AppError(502, 'PROVIDER_ERROR', message);
  }
}
