const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const swaggerUi = require("swagger-ui-express");

const { errorHandler, notFoundHandler } = require("./src/middleware/errorHandler");
const healthRouter = require("./src/routes/health");
const summarizeRouter = require("./src/routes/summarize");
const openapiSpec = require("./src/docs/openapi");

const app = express();

/**
 * CORS configuration
 */
const allowedOrigins = ["http://localhost:5500", "http://127.0.0.1:5500"];

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
  })
);

/**
 * Global middleware
 */
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

/**
 * Routes
 */
app.use("/health", healthRouter);
app.use("/api", summarizeRouter);

app.get("/openapi.json", (req, res) => {
  res.json(openapiSpec);
});

app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapiSpec));

/**
 * Error handling
 */
app.use(notFoundHandler);
app.use(errorHandler);

/**
 * Start server
 */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
