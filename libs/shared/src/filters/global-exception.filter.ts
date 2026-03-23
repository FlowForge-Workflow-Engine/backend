import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { Request, Response } from "express";
import { QueryFailedError } from "typeorm";

interface ErrorResponse {
  statusCode: number;
  errorCode: string;
  message: string;
  timestamp: string;
  path: string;
}

interface CsrfLikeError extends Error {
  code?: string;
}

/**
 * Global exception filter that catches all unhandled exceptions and returns a
 * standardised { statusCode, errorCode, message, timestamp, path } response shape.
 * Stack traces are never exposed in production responses.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  /**
   * @param exception - The thrown exception (HttpException or unknown error)
   * @param host - ArgumentsHost to access the HTTP context
   */
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode: number;
    let errorCode: string;
    let message: string;

    if (this.isInvalidCsrfTokenError(exception)) {
      // csurf throws a non-Nest error, so map it explicitly to the correct HTTP semantics.
      statusCode = HttpStatus.FORBIDDEN;
      errorCode = "INVALID_CSRF_TOKEN";
      message = "Invalid CSRF token";

      this.logger.warn(`Invalid CSRF token on ${request.method} ${request.url}`);
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === "string") {
        errorCode = exceptionResponse;
        message = exceptionResponse;
      } else if (typeof exceptionResponse === "object" && exceptionResponse !== null) {
        const body = exceptionResponse as Record<string, unknown>;
        errorCode = (body["errorCode"] as string) ?? (body["message"] as string) ?? exception.message;
        message = Array.isArray(body["message"])
          ? (body["message"] as string[]).join("; ")
          : ((body["message"] as string) ?? exception.message);
      } else {
        errorCode = exception.message;
        message = exception.message;
      }
    } else if (exception instanceof QueryFailedError) {
      // Database errors (TypeORM)
      const dbError = exception as any;
      const dbCode = dbError.code; // Database driver error code (e.g., '23505')

      // Default to 400 Bad Request or 409 Conflict for query failures
      statusCode = HttpStatus.BAD_REQUEST;
      errorCode = "DATABASE_QUERY_ERROR";
      message = "A database error occurred";

      // Specific mapping (Example for PostgreSQL unique violation)
      if (dbCode === "23505") {
        statusCode = HttpStatus.CONFLICT;
        errorCode = "DUPLICATE_ENTRY";
        message = "The record already exists.";
      }

      this.logger.error(
        `QueryFailedError [${dbCode}]: ${exception.message} on ${request.method} ${request.url}`
      );
    } else {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      errorCode = "INTERNAL_SERVER_ERROR";
      message = "An unexpected error occurred";

      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception)
      );
    }

    const errorResponse: ErrorResponse = {
      statusCode,
      errorCode,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(statusCode).json(errorResponse);
  }

  /**
   * Detects the Express/csurf error shape so invalid tokens return 403 instead of being treated as 500s.
   *
   * @param exception - Unknown thrown value from Nest or Express middleware
   * @returns True when the error represents an invalid CSRF token
   */
  private isInvalidCsrfTokenError(exception: unknown): exception is CsrfLikeError {
    if (!(exception instanceof Error)) {
      return false;
    }

    const csrfError = exception as CsrfLikeError;
    return csrfError.code === "EBADCSRFTOKEN" || csrfError.message === "invalid csrf token";
  }
}
