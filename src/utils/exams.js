const crypto = require("crypto");
const { AppError } = require("../middleware/errorHandler");

const DEFAULT_CONFIG = {
  difficulty: "medium",
  questionCount: 10,
  types: {
    mcq: 4,
    trueFalse: 2,
    shortAnswer: 2,
    fillBlank: 2,
  },
  language: "en",
};

const POINTS_BY_TYPE = {
  mcq: 1,
  trueFalse: 1,
  shortAnswer: 2,
  fillBlank: 1,
};

const buildExamConfig = ({ difficulty, questionCount, types }) => {
  const config = {
    difficulty: difficulty || DEFAULT_CONFIG.difficulty,
    questionCount: questionCount || DEFAULT_CONFIG.questionCount,
    types: types ? { ...types } : { ...DEFAULT_CONFIG.types },
    language: "en",
  };

  if (!questionCount && types) {
    const total = Object.values(config.types).reduce((sum, value) => sum + value, 0);
    config.questionCount = total;
  }

  if (questionCount && !types) {
    const weights = { mcq: 0.4, trueFalse: 0.2, shortAnswer: 0.2, fillBlank: 0.2 };
    const baseCounts = {};
    let allocated = 0;
    Object.keys(weights).forEach((key) => {
      const count = Math.floor(questionCount * weights[key]);
      baseCounts[key] = count;
      allocated += count;
    });
    let remaining = questionCount - allocated;
    const keys = Object.keys(weights);
    let idx = 0;
    while (remaining > 0) {
      baseCounts[keys[idx % keys.length]] += 1;
      remaining -= 1;
      idx += 1;
    }
    config.types = baseCounts;
  }

  const totalTypes = Object.values(config.types).reduce((sum, value) => sum + value, 0);
  if (totalTypes !== config.questionCount) {
    throw new AppError(
      "Question types must sum to questionCount.",
      400,
      "VALIDATION_ERROR",
      {
        expected: config.questionCount,
        received: totalTypes,
      }
    );
  }

  if (config.questionCount < 5 || config.questionCount > 30) {
    throw new AppError(
      "questionCount must be between 5 and 30.",
      400,
      "VALIDATION_ERROR"
    );
  }

  return config;
};

const createExamRecord = ({ title, questions, text, config }) => {
  if (!questions || questions.length === 0) {
    throw new AppError("Provider returned no questions.", 502, "PROVIDER_ERROR");
  }

  const examId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const normalizedQuestions = questions.map((question) => {
    const questionId = question.id || crypto.randomUUID();
    const points = Number.isFinite(question.points)
      ? question.points
      : POINTS_BY_TYPE[question.type] || 1;
    return {
      ...question,
      id: questionId,
      points,
    };
  });
  const totalPoints = normalizedQuestions.reduce(
    (sum, question) => sum + question.points,
    0
  );
  const exam = {
    id: examId,
    title: title || "Untitled Exam",
    createdAt,
    config,
    questions: normalizedQuestions,
    totalPoints,
  };
  const sourceTextHash = crypto.createHash("sha256").update(text).digest("hex");
  return { exam, sourceTextHash };
};

const normalizeAnswerText = (value) => String(value || "").trim().toLowerCase();

const gradeShortAnswer = (answer, keywords, points) => {
  // Short answer scoring: full points when answer includes >= 60% of keywords.
  if (!keywords || keywords.length === 0) {
    return { earned: 0, feedback: "No keywords configured." };
  }
  const normalized = normalizeAnswerText(answer);
  if (!normalized) {
    return { earned: 0, feedback: "No answer submitted." };
  }
  const matched = keywords.filter((keyword) =>
    normalized.includes(keyword.toLowerCase())
  ).length;
  const ratio = matched / keywords.length;
  if (ratio >= 0.6) {
    return {
      earned: points,
      feedback: `Matched ${matched} of ${keywords.length} keywords.`,
    };
  }
  const earned = Number((points * ratio).toFixed(2));
  return {
    earned,
    feedback: `Matched ${matched} of ${keywords.length} keywords.`,
  };
};

const gradeSubmission = (exam, answers) => {
  const attemptId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const answerMap = new Map();
  answers.forEach((answer) => {
    answerMap.set(answer.questionId, answer);
  });

  const results = exam.questions.map((question) => {
    const submitted = answerMap.get(question.id);
    let correct = false;
    let earnedPoints = 0;
    let feedback = "No answer submitted.";

    if (submitted) {
      if (question.type === "mcq") {
        correct = String(submitted.value).toUpperCase() === question.answerKey;
        earnedPoints = correct ? question.points : 0;
        feedback = correct ? "Correct choice." : "Incorrect choice.";
      } else if (question.type === "trueFalse") {
        const value =
          typeof submitted.value === "boolean"
            ? submitted.value
            : String(submitted.value).toLowerCase() === "true";
        correct = value === question.answerKeyBool;
        earnedPoints = correct ? question.points : 0;
        feedback = correct ? "Correct answer." : "Incorrect answer.";
      } else if (question.type === "fillBlank") {
        const normalized = normalizeAnswerText(submitted.value);
        correct = normalized === normalizeAnswerText(question.answerKeyBlank);
        earnedPoints = correct ? question.points : 0;
        feedback = correct ? "Correct fill-in." : "Incorrect fill-in.";
      } else if (question.type === "shortAnswer") {
        const grading = gradeShortAnswer(
          submitted.value,
          question.answerKeyText,
          question.points
        );
        earnedPoints = grading.earned;
        correct = earnedPoints === question.points;
        feedback = grading.feedback;
      }
    }

    return {
      questionId: question.id,
      correct,
      earnedPoints,
      maxPoints: question.points,
      feedback,
    };
  });

  const earned = results.reduce((sum, result) => sum + result.earnedPoints, 0);
  const total = results.reduce((sum, result) => sum + result.maxPoints, 0);
  const percent = total === 0 ? 0 : Number(((earned / total) * 100).toFixed(2));

  return {
    attemptId,
    createdAt,
    score: {
      earned,
      total,
      percent,
    },
    results,
  };
};

const renderExamHtml = (exam, withAnswers = false) => {
  const escapeHtml = (value) =>
    String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");

  const renderAnswer = (question) => {
    if (!withAnswers) {
      return "";
    }
    if (question.type === "mcq") {
      return `<p class="answer">Answer: ${question.answerKey}</p>`;
    }
    if (question.type === "trueFalse") {
      return `<p class="answer">Answer: ${question.answerKeyBool ? "True" : "False"}</p>`;
    }
    if (question.type === "shortAnswer") {
      return `<p class="answer">Keywords: ${question.answerKeyText.join(", ")}</p>`;
    }
    if (question.type === "fillBlank") {
      return `<p class="answer">Answer: ${escapeHtml(question.answerKeyBlank)}</p>`;
    }
    return "";
  };

  const questionHtml = exam.questions
    .map((question, index) => {
      const choices =
        question.type === "mcq"
          ? `<ol class="choices">
              ${question.choices
                .map(
                  (choice, idx) =>
                    `<li><strong>${String.fromCharCode(65 + idx)}.</strong> ${escapeHtml(
                      choice
                    )}</li>`
                )
                .join("")}
            </ol>`
          : "";
      return `
        <div class="question">
          <h3>Q${index + 1}. ${escapeHtml(question.prompt)}</h3>
          ${choices}
          <p class="explanation">${escapeHtml(question.explanation)}</p>
          ${renderAnswer(question)}
        </div>
      `;
    })
    .join("");

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>${escapeHtml(exam.title)}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 32px; color: #0f172a; }
          h1 { margin-bottom: 4px; }
          .meta { color: #64748b; margin-bottom: 24px; }
          .question { margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #e5e7eb; }
          .choices { padding-left: 20px; }
          .explanation { color: #475569; }
          .answer { font-weight: bold; color: #2563eb; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(exam.title)}</h1>
        <div class="meta">Generated ${escapeHtml(exam.createdAt)}</div>
        ${questionHtml}
      </body>
    </html>
  `;
};

module.exports = {
  buildExamConfig,
  createExamRecord,
  gradeSubmission,
  renderExamHtml,
  POINTS_BY_TYPE,
};
