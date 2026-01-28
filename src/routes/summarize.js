const express = require("express");
const rateLimit = require("express-rate-limit");

const { AppError } = require("../middleware/errorHandler");
const { getProvider } = require("../providers");

const router = express.Router();

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Too many requests, please try again later.",
    },
  },
});

const allowedLengths = ["short", "medium", "detailed", "unlimited"];
const allowedFormats = ["paragraph", "bullets"];

const validateRequest = (req, res, next) => {
  const { text, length, format } = req.body || {};

  if (!text || typeof text !== "string") {
    return next(new AppError("Text is required.", 400, "VALIDATION_ERROR"));
  }

  const trimmedText = text.trim();
  if (trimmedText.length < 20) {
    return next(
      new AppError("Text must be at least 20 characters.", 400, "VALIDATION_ERROR")
    );
  }

  if (trimmedText.length > 12000) {
    return next(
      new AppError(
        "Text must be no more than 12000 characters.",
        400,
        "VALIDATION_ERROR"
      )
    );
  }

  if (!allowedLengths.includes(length)) {
    return next(
      new AppError(
        "Length must be one of: short, medium, detailed, unlimited.",
        400,
        "VALIDATION_ERROR"
      )
    );
  }

  if (!allowedFormats.includes(format)) {
    return next(
      new AppError(
        "Format must be one of: paragraph, bullets.",
        400,
        "VALIDATION_ERROR"
      )
    );
  }

  req.body.text = trimmedText;
  return next();
};

router.post("/summarize", limiter, validateRequest, async (req, res, next) => {
  try {
    const provider = getProvider();
    const { text, length, format } = req.body;
    const summary = await provider.summarize({ text, length, format });

    res.json({
      summary,
      length,
      format,
      meta: {
        characters: text.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
