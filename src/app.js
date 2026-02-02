require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const swaggerUi = require("swagger-ui-express");

const { errorHandler, notFoundHandler } = require("./middleware/errorHandler");
const healthRouter = require("./routes/health");
const summarizeRouter = require("./routes/summarize");
const examsRouter = require("./routes/exams");
const knowledgeRouter = require("./routes/knowledge");
const openapiSpec = require("./docs/openapi");

const app = express();

const allowedOrigins = [
  "http://localhost:5000",
  "http://127.0.0.1:5000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:5501",
  "http://127.0.0.1:5501"
];

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

app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

app.get("/health", healthRouter);
app.use("/api", summarizeRouter);
app.use("/api", examsRouter);
app.use("/api", knowledgeRouter);

app.get("/openapi.json", (req, res) => {
  res.json(openapiSpec);
});

app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapiSpec));

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
