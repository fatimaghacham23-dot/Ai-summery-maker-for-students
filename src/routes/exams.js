const express = require("express");
const rateLimit = require("express-rate-limit");
const { z } = require("zod");

const { AppError } = require("../middleware/errorHandler");
const { getProvider } = require("../providers");
const { db } = require("../db");
const {
  buildExamConfig,
  createExamRecord,
  gradeSubmission,
  renderExamHtml,
  normalizeExamOutput,
  validateExamQuality,
} = require("../utils/exams");

const router = express.Router();

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Too many requests, please try again later.",
    },
  },
});

const generateSchema = z.object({
  text: z.string().min(50).max(20000),
  title: z.string().min(1).max(200).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  questionCount: z.number().int().min(5).max(30).optional(),
  types: z
    .object({
      mcq: z.number().int().min(0),
      trueFalse: z.number().int().min(0),
      shortAnswer: z.number().int().min(0),
      fillBlank: z.number().int().min(0),
    })
    .optional(),
});

const submissionSchema = z.object({
  examId: z.string().uuid(),
  answers: z.array(
    z.object({
      questionId: z.string().uuid(),
      type: z.enum(["mcq", "trueFalse", "shortAnswer", "fillBlank"]),
      value: z.union([z.string(), z.boolean(), z.number()]),
    })
  ),
});

const exportSchema = z.object({
  format: z.enum(["json", "html"]).default("json"),
  withAnswers: z.preprocess(
    (value) => {
      if (value === undefined) {
        return false;
      }
      return value === "true";
    },
    z.boolean()
  ),
});

const handleValidation = (schema, data) => {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.flatten();
    throw new AppError("Validation failed.", 400, "VALIDATION_ERROR", details);
  }
  return result.data;
};

router.post("/exams/generate", limiter, async (req, res, next) => {
  try {
    const payload = handleValidation(generateSchema, req.body || {});
    const config = buildExamConfig(payload);
    const provider = getProvider();
    const maxAttempts = 3;
    let attempt = 0;
    let normalized = null;
    let lastIssues = [];
    let generated = null; // ✅ FIX: declare outside loop so we can use it after

    while (attempt < maxAttempts && !normalized) {
      generated = await provider.generateExam({
        text: payload.text,
        title: payload.title,
        config,
      });

      const examPayload = normalizeExamOutput(generated);
      const quality = validateExamQuality(examPayload, config);

      if (quality.passed) {
        normalized = examPayload;
        break;
      }

      lastIssues = quality.issues;
      attempt += 1;
    }

    if (!normalized) {
      throw new AppError(
        "Exam generation failed quality checks.",
        502,
        "PROVIDER_ERROR",
        { issues: lastIssues }
      );
    }

    const { exam, sourceTextHash } = createExamRecord({
      title: generated?.title,
      questions: generated?.questions,
      text: payload.text,
      config,
      blueprint: normalized.blueprint,
    });

    const insert = db.prepare(
      `INSERT INTO exams (id, title, sourceTextHash, configJson, examJson, createdAt)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    insert.run(
      exam.id,
      exam.title,
      sourceTextHash,
      JSON.stringify(exam.config),
      JSON.stringify(exam),
      exam.createdAt
    );

    res.json(exam);
  } catch (error) {
    next(error);
  }
});

router.get("/exams", limiter, (req, res, next) => {
  try {
    const rows = db
      .prepare(
        "SELECT id, title, configJson, createdAt FROM exams ORDER BY createdAt DESC"
      )
      .all();
    const list = rows.map((row) => {
      const config = JSON.parse(row.configJson);
      return {
        id: row.id,
        title: row.title,
        createdAt: row.createdAt,
        difficulty: config.difficulty,
        questionCount: config.questionCount,
      };
    });
    res.json(list);
  } catch (error) {
    next(error);
  }
});

router.get("/exams/:id", limiter, (req, res, next) => {
  try {
    const row = db
      .prepare("SELECT examJson FROM exams WHERE id = ?")
      .get(req.params.id);
    if (!row) {
      throw new AppError("Exam not found.", 404, "NOT_FOUND");
    }
    res.json(JSON.parse(row.examJson));
  } catch (error) {
    next(error);
  }
});

router.post("/exams/:id/submit", limiter, (req, res, next) => {
  try {
    const payload = handleValidation(submissionSchema, req.body || {});
    if (payload.examId !== req.params.id) {
      throw new AppError("Exam ID mismatch.", 400, "VALIDATION_ERROR");
    }
    const examRow = db
      .prepare("SELECT examJson FROM exams WHERE id = ?")
      .get(req.params.id);
    if (!examRow) {
      throw new AppError("Exam not found.", 404, "NOT_FOUND");
    }
    const exam = JSON.parse(examRow.examJson);
    const grading = gradeSubmission(exam, payload.answers);

    const attemptInsert = db.prepare(
      `INSERT INTO attempts (id, examId, answersJson, scoreJson, createdAt)
       VALUES (?, ?, ?, ?, ?)`
    );
    attemptInsert.run(
      grading.attemptId,
      exam.id,
      JSON.stringify(payload.answers),
      JSON.stringify({ score: grading.score, results: grading.results }),
      grading.createdAt
    );

    res.json({
      attemptId: grading.attemptId,
      examId: exam.id,
      score: grading.score,
      results: grading.results,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/exams/:id/attempts", limiter, (req, res, next) => {
  try {
    const rows = db
      .prepare(
        "SELECT id, scoreJson, createdAt FROM attempts WHERE examId = ? ORDER BY createdAt DESC"
      )
      .all(req.params.id);
    const list = rows.map((row) => {
      const scorePayload = JSON.parse(row.scoreJson);
      return {
        attemptId: row.id,
        createdAt: row.createdAt,
        scorePercent: scorePayload.score?.percent ?? 0,
      };
    });
    res.json(list);
  } catch (error) {
    next(error);
  }
});

router.get("/attempts/:attemptId", limiter, (req, res, next) => {
  try {
    const row = db
      .prepare(
        "SELECT id, examId, answersJson, scoreJson, createdAt FROM attempts WHERE id = ?"
      )
      .get(req.params.attemptId);
    if (!row) {
      throw new AppError("Attempt not found.", 404, "NOT_FOUND");
    }
    const scorePayload = JSON.parse(row.scoreJson);
    res.json({
      attemptId: row.id,
      examId: row.examId,
      createdAt: row.createdAt,
      answers: JSON.parse(row.answersJson),
      score: scorePayload.score,
      results: scorePayload.results,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/exams/:id/export", limiter, (req, res, next) => {
  try {
    const query = handleValidation(exportSchema, req.query || {});
    const row = db
      .prepare("SELECT examJson FROM exams WHERE id = ?")
      .get(req.params.id);
    if (!row) {
      throw new AppError("Exam not found.", 404, "NOT_FOUND");
    }
    const exam = JSON.parse(row.examJson);
    if (query.format === "json") {
      return res.json(exam);
    }

    const html = renderExamHtml(exam, query.withAnswers);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  } catch (error) {
    next(error);
  }
});

module.exports = router;