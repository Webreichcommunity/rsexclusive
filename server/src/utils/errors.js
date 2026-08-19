export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'internal_error', details = undefined) {
    super(message)
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }
}

export function notFound(message = 'Resource not found') {
  return new AppError(message, 404, 'not_found')
}

export function unauthorized(message = 'Authentication required') {
  return new AppError(message, 401, 'unauthorized')
}

export function forbidden(message = 'You do not have access to this resource') {
  return new AppError(message, 403, 'forbidden')
}

export function badRequest(message, code = 'bad_request', details) {
  return new AppError(message, 400, code, details)
}

export function conflict(message, code = 'conflict', details) {
  return new AppError(message, 409, code, details)
}

export function validationError(details) {
  return new AppError('Invalid request payload', 400, 'validation_error', details)
}
