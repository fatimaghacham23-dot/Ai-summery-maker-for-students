class AppError extends Error {
  constructor(message, statusCode, code, details) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "Route not found",
    },
  });
};

const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const code = err.code || "INTERNAL_ERROR";

  if (statusCode >= 500) {
    console.error(err);
  }

  const response = {
    error: {
      code,
      message: err.message || "Unexpected error",
    },
  };

  if (err.details) {
    response.error.details = err.details;
  }

  res.status(statusCode).json(response);
};

module.exports = {
  AppError,
  errorHandler,
  notFoundHandler,
};
