import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";

interface ApiErrorOptions {
  status: number;
  code: string;
  message: string;
  action: string;
  retryable?: boolean;
  details?: Record<string, unknown>;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly action: string;
  readonly retryable: boolean;
  readonly details: Record<string, unknown> | undefined;

  constructor(options: ApiErrorOptions) {
    super(options.message);
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code;
    this.action = options.action;
    this.retryable = options.retryable ?? false;
    this.details = options.details;
  }
}

export const notFoundHandler: RequestHandler = (_request, _response, next) => {
  next(
    new ApiError({
      status: 404,
      code: "ROUTE_NOT_FOUND",
      message: "The requested API route does not exist.",
      action: "Check the API path and version."
    })
  );
};

export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  let apiError: ApiError;
  if (error instanceof ApiError) {
    apiError = error;
  } else if (error instanceof ZodError) {
    apiError = new ApiError({
      status: 400,
      code: "INVALID_REQUEST",
      message: "The request contains invalid or missing fields.",
      action: "Correct the fields listed in details and try again.",
      details: { issues: error.issues }
    });
  } else if (httpErrorStatus(error) === 413) {
    apiError = new ApiError({
      status: 413,
      code: "REQUEST_BODY_TOO_LARGE",
      message: "The request body exceeds the service limit for this route.",
      action: "Send only the required fields and retry with a smaller JSON body."
    });
  } else if (httpErrorStatus(error) === 400 && error instanceof SyntaxError) {
    apiError = new ApiError({
      status: 400,
      code: "INVALID_JSON",
      message: "The request body is not valid JSON.",
      action: "Correct the JSON syntax and retry the request."
    });
  } else {
    apiError = new ApiError({
      status: 500,
      code: "INTERNAL_ERROR",
      message: "The service could not complete the request.",
      action: "Retry once. If the problem continues, provide the request ID to an administrator.",
      retryable: true
    });
  }

  const body: {
    error: {
      code: string;
      message: string;
      action: string;
      retryable: boolean;
      requestId: string;
      details?: Record<string, unknown>;
    };
  } = {
    error: {
      code: apiError.code,
      message: apiError.message,
      action: apiError.action,
      retryable: apiError.retryable,
      requestId: request.id
    }
  };
  if (apiError.details) body.error.details = apiError.details;
  response.status(apiError.status).json(body);
};

function httpErrorStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("status" in error)) return undefined;
  return typeof error.status === "number" ? error.status : undefined;
}
