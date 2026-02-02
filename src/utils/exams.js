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

const ALLOWED_TF_CLASSIFICATIONS = ["Definition", "Concept", "Fact", "Application"];
const BLOOM_LEVELS = ["L1", "L2", "L3", "L4"];

const normalizeQuestionType = (type) => {
  if (!type) {
    return "";
  }
  const normalized = String(type).toLowerCase().replace(/[^a-z]/g, "");
  if (normalized === "truefalse" || normalized === "truefalsequestion") {
    return "trueFalse";
  }
  if (normalized === "fillblank" || normalized === "fillintheblank") {
    return "fillBlank";
  }
  if (normalized === "shortanswer" || normalized === "shortresponse") {
    return "shortAnswer";
  }
  if (normalized === "mcq" || normalized === "multiplechoice") {
    return "mcq";
  }
  return type;
};

const normalizeBloomLevel = (level) => {
  if (!level) {
    return "";
  }
  const text = String(level).toLowerCase();
  const match = text.match(/l[1-4]/);
  if (match) {
    return match[0].toUpperCase();
  }
  if (text.includes("remember") || text.includes("define")) {
    return "L1";
  }
  if (text.includes("explain") || text.includes("compare") || text.includes("describe")) {
    return "L2";
  }
  if (text.includes("apply") || text.includes("use") || text.includes("calculate")) {
    return "L3";
  }
  if (text.includes("analy") || text.includes("evaluate") || text.includes("diagnose")) {
    return "L4";
  }
  return "";
};

const inferBloomLevel = (prompt) => {
  const text = String(prompt || "").toLowerCase();
  if (
    text.includes("analy") ||
    text.includes("evaluate") ||
    text.includes("diagnose") ||
    text.includes("debug")
  ) {
    return "L4";
  }
  if (
    text.includes("apply") ||
    text.includes("calculate") ||
    text.includes("solve") ||
    text.includes("use the data")
  ) {
    return "L3";
  }
  if (text.includes("compare") || text.includes("contrast") || text.includes("explain")) {
    return "L2";
  }
  return "L1";
};

const inferClassification = (prompt) => {
  const text = String(prompt || "").toLowerCase();
  if (
    text.includes("scenario") ||
    text.includes("case") ||
    text.includes("given") ||
    text.includes("in practice") ||
    text.includes("situation")
  ) {
    return "Application";
  }
  if (
    text.includes("is defined as") ||
    text.includes("definition") ||
    text.includes("refers to") ||
    text.startsWith("define")
  ) {
    return "Definition";
  }
  if (
    text.includes("relationship") ||
    text.includes("because") ||
    text.includes("leads to") ||
    text.includes("results in") ||
    text.includes("affects") ||
    text.includes("depends on") ||
    text.includes("correlat")
  ) {
    return "Concept";
  }
  return "Fact";
};

const normalizeExamOutput = (generated) => {
  const rawQuestions = Array.isArray(generated?.questions) ? generated.questions : [];
  const blueprintRaw = Array.isArray(generated?.blueprint)
    ? generated.blueprint
    : Array.isArray(generated?.topics)
      ? generated.topics
      : [];
  const normalizedQuestions = rawQuestions.map((question, index) => {
    const type = normalizeQuestionType(question.type || question.questionType);
    const prompt =
      question.prompt ||
      question.statement ||
      question.question ||
      `Question ${index + 1}`;
    const explanation = question.explanation || question.rationale || "";
    const bloomLevel = normalizeBloomLevel(question.bloomLevel || question.bloom) ||
      inferBloomLevel(prompt);
    const topic = question.topic || question.topicLabel || "General";
    const base = {
      ...question,
      type,
      prompt,
      explanation,
      bloomLevel,
      topic,
    };
    if (type === "trueFalse") {
      const classification =
        ALLOWED_TF_CLASSIFICATIONS.includes(question.classification)
          ? question.classification
          : inferClassification(prompt);
      return {
        ...base,
        classification,
        answerKeyBool: question.answerKeyBool ?? question.answerKey ?? question.answer ?? false,
      };
    }
    return base;
  });

  const derivedBlueprint = blueprintRaw.length
    ? blueprintRaw
    : Array.from(new Set(normalizedQuestions.map((question) => question.topic)));

  return {
    title: generated?.title || "Generated Exam",
    questions: normalizedQuestions,
    blueprint: derivedBlueprint,
  };
};

const tokenizePrompt = (prompt) =>
  String(prompt || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

const jaccardSimilarity = (aTokens, bTokens) => {
  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);
  if (!aSet.size || !bSet.size) {
    return 0;
  }
  let intersection = 0;
  aSet.forEach((token) => {
    if (bSet.has(token)) {
      intersection += 1;
    }
  });
  const union = new Set([...aSet, ...bSet]).size;
  return union === 0 ? 0 : intersection / union;
};

const validateExamQuality = (exam, config) => {
  const issues = [];
  const total = exam.questions.length;
  if (!total) {
    return { passed: false, issues: ["No questions returned."] };
  }

  const normalizedBlueprint = (exam.blueprint || [])
    .map((topic) => String(topic).trim())
    .filter(Boolean);
  const normalizedQuestionTopics = exam.questions.map((question) =>
    String(question.topic || "").trim().toLowerCase()
  );
  normalizedBlueprint.forEach((topic) => {
    const covered = normalizedQuestionTopics.includes(topic.toLowerCase());
    if (!covered) {
      issues.push(`Missing coverage for topic "${topic}".`);
    }
  });

  const depthCount = exam.questions.filter((question) =>
    ["L2", "L3", "L4"].includes(question.bloomLevel)
  ).length;
  const depthRatio = depthCount / total;
  if (depthRatio < 0.7) {
    issues.push(`Bloom depth ratio too low (${Math.round(depthRatio * 100)}%).`);
  }

  const definitionOnlyCount = exam.questions.filter((question) => {
    const text = String(question.prompt || "").toLowerCase();
    return (
      question.bloomLevel === "L1" ||
      text.includes("define") ||
      text.includes("definition") ||
      text.includes("refers to") ||
      text.includes("is defined as")
    );
  }).length;
  const definitionRatio = definitionOnlyCount / total;
  if (definitionRatio > 0.2) {
    issues.push(
      `Definition-only ratio too high (${Math.round(definitionRatio * 100)}%).`
    );
  }

  const tokens = exam.questions.map((question) => tokenizePrompt(question.prompt));
  const duplicates = [];
  for (let i = 0; i < tokens.length; i += 1) {
    for (let j = i + 1; j < tokens.length; j += 1) {
      if (jaccardSimilarity(tokens[i], tokens[j]) >= 0.9) {
        duplicates.push([i + 1, j + 1]);
      }
    }
  }
  if (duplicates.length) {
    issues.push(`Found near-duplicate questions: ${duplicates.map((pair) => pair.join(" & ")).join(", ")}.`);
  }

  exam.questions.forEach((question, index) => {
    if (!question.topic) {
      issues.push(`Question ${index + 1} missing topic.`);
    }
    if (!BLOOM_LEVELS.includes(question.bloomLevel)) {
      issues.push(`Question ${index + 1} missing Bloom level.`);
    }
    if (question.type === "trueFalse") {
      if (!ALLOWED_TF_CLASSIFICATIONS.includes(question.classification)) {
        issues.push(`Question ${index + 1} missing classification.`);
      }
      const sentences = String(question.explanation || "")
        .split(/[.!?]/)
        .map((chunk) => chunk.trim())
        .filter(Boolean);
      if (sentences.length < 2) {
        issues.push(`Question ${index + 1} needs a longer explanation.`);
      }
    } else {
      if (String(question.explanation || "").length < 20) {
        issues.push(`Question ${index + 1} needs a stronger rationale.`);
      }
    }
  });

  return {
    passed: issues.length === 0,
    issues,
    metrics: {
      depthRatio,
      definitionRatio,
      total,
      questionCount: config?.questionCount,
    },
  };
};

const buildExamConfig = ({ difficulty, questionCount, types, strictTypes }) => {
  const config = {
    difficulty: difficulty || DEFAULT_CONFIG.difficulty,
    questionCount: questionCount || DEFAULT_CONFIG.questionCount,
    types: types ? { ...types } : { ...DEFAULT_CONFIG.types },
    language: "en",
    strictTypes:
      typeof strictTypes === "boolean"
        ? strictTypes
        : process.env.NODE_ENV === "production",
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

const createExamRecord = ({ title, questions, text, config, blueprint }) => {
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
    blueprint,
    questions: normalizedQuestions,
    totalPoints,
  };
  const sourceTextHash = crypto.createHash("sha256").update(text).digest("hex");
  return { exam, sourceTextHash };
};

const normalizeAnswerText = (value) => String(value || "").trim().toLowerCase();

const gradeShortAnswerRubric = (answer, answerKey, points) => {
  const normalized = normalizeAnswerText(answer);
  if (!normalized) {
    return {
      earned: 0,
      feedback: "No answer submitted.",
      matchedRequired: [],
      missingRequired: Array.isArray(answerKey?.requiredKeywords)
        ? answerKey.requiredKeywords
        : [],
      matchedOptional: [],
    };
  }

  const required = Array.isArray(answerKey?.requiredKeywords)
    ? answerKey.requiredKeywords
    : [];
  const optional = Array.isArray(answerKey?.optionalKeywords)
    ? answerKey.optionalKeywords
    : [];

  if (!required.length) {
    return {
      earned: 0,
      feedback: "No keywords configured.",
      matchedRequired: [],
      missingRequired: [],
      matchedOptional: [],
    };
  }

  const matchedRequired = required.filter((keyword) =>
    normalized.includes(String(keyword).toLowerCase())
  );
  const missingRequired = required.filter(
    (keyword) => !matchedRequired.includes(keyword)
  );
  const matchedOptional = optional.filter((keyword) =>
    normalized.includes(String(keyword).toLowerCase())
  );

  const ratio = matchedRequired.length / required.length;
  const earned = Number((points * ratio).toFixed(2));

  return {
    earned,
    feedback: `Matched ${matchedRequired.length} of ${required.length} required keywords.`,
    matchedRequired,
    missingRequired,
    matchedOptional,
  };
};

const getEvidence = (question) => {
  const grounding = question?.grounding;
  if (!grounding) {
    return null;
  }
  return {
    sourceSentenceIds: Array.isArray(grounding.sourceSentenceIds)
      ? grounding.sourceSentenceIds
      : [],
    evidenceSnippets: Array.isArray(grounding.evidenceSnippets)
      ? grounding.evidenceSnippets
      : [],
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
    const evidence = getEvidence(question);
    let rubric = undefined;

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
        const expected =
          typeof question.answerKeyBool === "boolean"
            ? question.answerKeyBool
            : typeof question.answerKey === "boolean"
              ? question.answerKey
              : false;
        correct = value === expected;
        earnedPoints = correct ? question.points : 0;
        feedback = correct ? "Correct answer." : "Incorrect answer.";
      } else if (question.type === "fillBlank") {
        const normalized = normalizeAnswerText(submitted.value);
        const expected =
          question.answerKeyBlank != null
            ? question.answerKeyBlank
            : question.answerKey;
        correct = normalized === normalizeAnswerText(expected);
        earnedPoints = correct ? question.points : 0;
        feedback = correct ? "Correct fill-in." : "Incorrect fill-in.";
      } else if (question.type === "shortAnswer") {
        const answerKey =
          question.answerKey && typeof question.answerKey === "object"
            ? question.answerKey
            : { requiredKeywords: question.answerKeyText || [], optionalKeywords: [] };
        const grading = gradeShortAnswerRubric(
          submitted.value,
          answerKey,
          question.points
        );
        earnedPoints = grading.earned;
        correct = earnedPoints === question.points;
        feedback = grading.feedback;
        rubric = {
          matchedRequired: grading.matchedRequired,
          missingRequired: grading.missingRequired,
          matchedOptional: grading.matchedOptional,
          rubricPoints: Array.isArray(answerKey.rubricPoints) ? answerKey.rubricPoints : [],
        };
      }
    }

    return {
      questionId: question.id,
      questionType: question.type,
      classification: question.type === "trueFalse" ? question.classification : undefined,
      explanation: question.type === "trueFalse" ? question.explanation : undefined,
      correct,
      earnedPoints,
      maxPoints: question.points,
      feedback,
      evidence,
      rubric,
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
      const classification =
        question.type === "trueFalse"
          ? `<p class="question-meta">Classification: ${escapeHtml(
              question.classification
            )}</p>`
          : "";
          return `
        <div class="question">
          <h3>Q${index + 1}. ${escapeHtml(question.prompt)}</h3>
          ${choices}
          ${classification}
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
          .question-meta { color: #475569; margin: 6px 0 0; }
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
  normalizeExamOutput,
  validateExamQuality,
  ALLOWED_TF_CLASSIFICATIONS,
};
