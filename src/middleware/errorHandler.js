function errorHandler(err, req, res, next) {
  console.error('Error:', err.message)
  console.error(err.stack)

  const statusCode = err.statusCode || 500
  const message = statusCode === 500
    ? 'Internal server error'
    : err.message

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  })
}

class AppError extends Error {
  constructor(message, statusCode) {
    super(message)
    this.statusCode = statusCode
  }
}

module.exports = { errorHandler, AppError }
