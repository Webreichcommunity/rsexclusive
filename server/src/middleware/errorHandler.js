import { ZodError } from 'zod'
import { AppError, validationError } from '../utils/errors.js'

export function errorHandler(error, req, res, _next) {
  const normalized = error instanceof ZodError ? validationError(error.flatten()) : error
  const statusCode = normalized instanceof AppError ? normalized.statusCode : 500

  if (statusCode >= 500) {
    console.error({
      message: normalized.message,
      stack: normalized.stack,
      path: req.originalUrl,
      method: req.method,
    })
  }

  res.status(statusCode).json({
    error: {
      code: normalized.code || 'internal_error',
      message: statusCode >= 500 ? 'Something went wrong. Please try again.' : normalized.message,
      details: statusCode >= 500 ? undefined : normalized.details,
    },
  })
}
