const crypto = require("crypto");

const API_VERSION = 2;
const PIPELINE_VERSION = "grounded-1.0";

const POINTS_BY_TYPE = {
  mcq: 1,
  trueFalse: 1,
  shortAnswer: 2,
  fillBlank: 1,
};

const DEFAULT_STOPWORDS = new Set([
  "a",
  "about",
  "above",
  "after",
  "again",
  "against",
  "all",
  "am",
  "an",
  "and",
  "any",
  "are",
  "as",
  "at",
  "be",
  "because",
  "been",
  "before",
  "being",
  "below",
  "between",
  "both",
  "but",
  "by",
  "can",
  "could",
  "did",
  "do",
  "does",
  "doing",
  "down",
  "during",
  "each",
  "few",
  "for",
  "from",
  "further",
  "had",
  "has",
  "have",
  "having",
  "he",
  "her",
  "here",
  "hers",
  "herself",
  "him",
  "himself",
  "his",
  "how",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "itself",
  "just",
  "me",
  "more",
  "most",
  "my",
  "myself",
  "no",
  "nor",
  "not",
  "now",
  "of",
  "off",
  "on",
  "once",
  "only",
  "or",
  "other",
  "our",
  "ours",
  "ourselves",
  "out",
  "over",
  "own",
  "same",
  "she",
  "should",
  "so",
  "some",
  "such",
  "than",
  "that",
  "the",
  "their",
  "theirs",
  "them",
  "themselves",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "to",
  "too",
  "under",
  "until",
  "up",
  "very",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "who",
  "whom",
  "why",
  "will",
  "with",
  "you",
  "your",
  "yours",
  "yourself",
  "yourselves",
  "study",
  "notes",
  "note",
  "text",
  "topic",
  "topics",
  "concept",
  "concepts",
  "important",
  "importance",
  "provide",
  "provided",
  "provides",
  "including",
  "include",
  "includes",
  "example",
  "examples",
]);

const normalizeWhitespace = (text) => String(text || "").replace(/\s+/g, " ").trim();

const hashId = (value) =>
  crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 12);

const hashToUuid = (value) => {
  const hash = crypto.createHash("sha256").update(String(value)).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(
    16,
    20
  )}-${hash.slice(20, 32)}`;
};

const toSentenceId = (index) => `s${index + 1}`;

const splitIntoSentences = (text) => {
  const input = String(text || "");
  const sentences = [];

  let cursor = 0;
  const parts = input
    .replace(/\r\n/g, "\n")
    .split(/(?<=[.!?])\s+|\n{2,}/g)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  parts.forEach((part, index) => {
    const start = input.indexOf(part, cursor);
    const end = start === -1 ? cursor + part.length : start + part.length;
    cursor = end;

    sentences.push({
      id: toSentenceId(index),
      index,
      start: Math.max(0, start),
      end: Math.max(0, end),
      text: part,
    });
  });

  return sentences;
};

const splitIntoSections = (text, sentences) => {
  const raw = String(text || "").replace(/\r\n/g, "\n");
  const paragraphs = raw
    .split(/\n{2,}/g)
    .map((p) => p.trim())
    .filter(Boolean);

  if (!paragraphs.length) {
    return [
      {
        id: "sec1",
        title: "Section 1",
        paragraphIndexes: [0],
        sentenceIds: sentences.map((s) => s.id),
      },
    ];
  }

  const sections = [];
  let sentenceCursor = 0;

  paragraphs.forEach((paragraph, idx) => {
    const titleCandidate = paragraph.split("\n")[0].trim();
    const title =
      titleCandidate.length <= 60 &&
      (titleCandidate.endsWith(":") || /^[A-Z0-9\s-]{6,}$/.test(titleCandidate))
        ? titleCandidate.replace(/:$/, "")
        : `Section ${idx + 1}`;

    const sentenceIds = [];
    while (sentenceCursor < sentences.length) {
      const sentence = sentences[sentenceCursor];
      if (paragraph.includes(sentence.text)) {
        sentenceIds.push(sentence.id);
        sentenceCursor += 1;
      } else {
        break;
      }
    }

    sections.push({
      id: `sec${idx + 1}`,
      title,
      paragraphIndexes: [idx],
      sentenceIds: sentenceIds.length ? sentenceIds : sentences.map((s) => s.id),
    });
  });

  return sections;
};

const tokenize = (text) =>
  String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);

const isStopword = (token, stopwords) => stopwords.has(String(token || "").toLowerCase());

const buildTokenSet = (text, stopwords) => {
  const set = new Set();
  tokenize(text).forEach((t) => {
    if (!isStopword(t, stopwords) && t.length >= 3) {
      set.add(t);
    }
  });
  return set;
};

const extractCandidates = (tokens, stopwords, maxGram = 3) => {
  const candidates = [];
  for (let i = 0; i < tokens.length; i += 1) {
    for (let n = 1; n <= maxGram; n += 1) {
      const slice = tokens.slice(i, i + n);
      if (slice.length !== n) {
        continue;
      }
      if (slice.some((t) => isStopword(t, stopwords) || t.length < 3)) {
        continue;
      }
      if (slice.every((t) => /^\d+$/.test(t))) {
        continue;
      }
      const phrase = slice.join(" ");
      candidates.push(phrase);
    }
  }
  return candidates;
};

const inferConceptType = (name, sentenceText) => {
  const s = String(sentenceText || "").toLowerCase();
  const n = String(name || "").toLowerCase();
  if (s.includes("for example") || s.includes("such as") || s.includes("e.g.")) {
    return "example";
  }
  if (s.includes("step") || s.includes("process") || s.includes("procedure") || s.includes("method")) {
    return "process";
  }
  if (s.includes(`${n} is`) || s.includes(`${n} are`) || s.includes("refers to") || s.includes("defined as")) {
    return "definition";
  }
  return "concept";
};

const extractConcepts = ({ text, sentences, stopwords = DEFAULT_STOPWORDS, limit = 24 }) => {
  const tokens = tokenize(text);
  const candidatePhrases = extractCandidates(tokens, stopwords, 3);
  const freq = new Map();

  candidatePhrases.forEach((phrase) => {
    freq.set(phrase, (freq.get(phrase) || 0) + 1);
  });

  const scored = [...freq.entries()]
    .map(([phrase, count]) => {
      const lengthBoost = phrase.split(" ").length >= 2 ? 1.25 : 1;
      return { phrase, count, score: count * lengthBoost };
    })
    .sort((a, b) => b.score - a.score);

  const concepts = [];
  const used = new Set();

  for (const item of scored) {
    if (concepts.length >= limit) {
      break;
    }
    const name = normalizeWhitespace(item.phrase);
    if (!name) {
      continue;
    }
    if (used.has(name)) {
      continue;
    }
    if (name.split(" ").every((t) => isStopword(t, stopwords))) {
      continue;
    }

    const sentenceIds = [];
    const evidence = [];
    sentences.forEach((sentence) => {
      const hay = sentence.text.toLowerCase();
      if (hay.includes(name.toLowerCase())) {
        sentenceIds.push(sentence.id);
        if (evidence.length < 2) {
          evidence.push(sentence.text);
        }
      }
    });

    if (!sentenceIds.length) {
      continue;
    }

    const type = inferConceptType(name, evidence[0]);

    concepts.push({
      id: `c_${hashId(name)}`,
      name,
      type,
      sentenceIds,
    });
    used.add(name);
  }

  if (!concepts.length) {
    const fallback = tokens.filter((t) => !isStopword(t, stopwords) && t.length >= 4).slice(0, 8);
    fallback.forEach((word) => {
      concepts.push({
        id: `c_${hashId(word)}`,
        name: word,
        type: "concept",
        sentenceIds: sentences.length ? [sentences[0].id] : [],
      });
    });
  }

  return concepts;
};

const buildBlueprint = ({ text, seed, stopwords = DEFAULT_STOPWORDS, conceptLimit = 24 }) => {
  const extractStartedAt = Date.now();
  const sentences = splitIntoSentences(text);
  const sections = splitIntoSections(text, sentences);
  const concepts = extractConcepts({ text, sentences, stopwords, limit: conceptLimit });

  return {
    apiVersion: API_VERSION,
    pipelineVersion: PIPELINE_VERSION,
    seed: seed == null ? null : String(seed),
    sourceText: {
      sentences,
    },
    blueprint: {
      concepts,
      sections,
    },
    timingsMs: {
      extract: Date.now() - extractStartedAt,
    },
  };
};

const mulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const rngFromString = (value) => mulberry32(Number.parseInt(hashId(value), 16));

const shuffleDeterministic = (arr, rng) => {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const pickEvidenceForConcept = (concept, sentenceMap) => {
  const ids = Array.isArray(concept?.sentenceIds) ? concept.sentenceIds : [];
  const resolved = ids.map((id) => sentenceMap.get(id)).filter(Boolean);
  if (!resolved.length) {
    return null;
  }
  const first = resolved[0];
  return {
    sourceSentenceIds: [first.id],
    sourceOffsets: [{ start: first.start, end: first.end }],
    evidenceSnippets: [first.text],
  };
};

const choiceLabels = ["A", "B", "C", "D"];

const buildMcq = ({ concept, concepts, sentenceMap, difficulty, seedSalt }) => {
  const grounding = pickEvidenceForConcept(concept, sentenceMap);
  if (!grounding) {
    return null;
  }

  const correct = grounding.evidenceSnippets[0];
  const distractors = [];

  for (const other of concepts) {
    if (other.id === concept.id) {
      continue;
    }
    const otherGrounding = pickEvidenceForConcept(other, sentenceMap);
    if (!otherGrounding) {
      continue;
    }
    const option = otherGrounding.evidenceSnippets[0];
    if (option && option !== correct && !distractors.includes(option)) {
      distractors.push(option);
    }
    if (distractors.length >= 3) {
      break;
    }
  }

  while (distractors.length < 3) {
    distractors.push("Not enough distinct evidence in the provided text to form a distractor.");
  }

  const choices = [correct, ...distractors].slice(0, 4);
  const rng = rngFromString(`${seedSalt || ""}|${concept.id}|mcq`);
  const shuffled = shuffleDeterministic(
    choices.map((choice, index) => ({ choice, isCorrect: index === 0 })),
    rng
  );
  const answerIndex = shuffled.findIndex((item) => item.isCorrect);
  const answerKey = choiceLabels[Math.max(0, answerIndex)];

  return {
    id: hashToUuid(`${seedSalt || concept.id}|mcq|${concept.id}`),
    type: "mcq",
    topic: concept.name,
    topicConceptId: concept.id,
    bloomLevel: difficulty === "easy" ? "L2" : "L3",
    prompt: `According to the provided text, which statement best matches "${concept.name}"?`,
    choices: shuffled.map((item) => item.choice),
    answerKey,
    explanation: correct,
    grounding,
    points: POINTS_BY_TYPE.mcq,
    meta: { difficulty, tags: [concept.type], regeneratedFrom: seedSalt || null },
  };
};

const buildFillBlank = ({ concept, sentenceMap, difficulty, seedSalt }) => {
  const grounding = pickEvidenceForConcept(concept, sentenceMap);
  if (!grounding) {
    return null;
  }
  const sentence = grounding.evidenceSnippets[0];
  const blanked = sentence.replace(new RegExp(concept.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), "____");
  const prompt = blanked === sentence
    ? `Fill in the blank: ____ relates to ${concept.name}.`
    : `Fill in the blank: ${blanked}`;

  return {
    id: hashToUuid(`${seedSalt || concept.id}|fillBlank|${concept.id}`),
    type: "fillBlank",
    topic: concept.name,
    topicConceptId: concept.id,
    bloomLevel: difficulty === "easy" ? "L1" : "L2",
    prompt,
    answerKey: concept.name,
    answerKeyBlank: concept.name,
    explanation: sentence,
    grounding,
    points: POINTS_BY_TYPE.fillBlank,
    meta: { difficulty, tags: [concept.type], regeneratedFrom: seedSalt || null },
  };
};

const buildTrueFalse = ({ concept, concepts, sentenceMap, difficulty, seedSalt, index }) => {
  const grounding = pickEvidenceForConcept(concept, sentenceMap);
  if (!grounding) {
    return null;
  }

  const truthy = index % 2 === 0;
  const sentence = grounding.evidenceSnippets[0];
  const other = concepts.find((c) => c.id !== concept.id) || concept;

  const statement = truthy
    ? sentence
    : sentence.replace(new RegExp(concept.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), other.name);

  return {
    id: hashToUuid(`${seedSalt || concept.id}|trueFalse|${concept.id}|${index}`),
    type: "trueFalse",
    topic: concept.name,
    topicConceptId: concept.id,
    bloomLevel: "L2",
    prompt: `True or False: ${statement}`,
    answerKey: truthy,
    answerKeyBool: truthy,
    classification:
      concept.type === "definition"
        ? "Definition"
        : concept.type === "process"
          ? "Application"
          : "Concept",
    explanation: truthy ? sentence : `The text states: ${sentence}`,
    grounding,
    points: POINTS_BY_TYPE.trueFalse,
    meta: { difficulty, tags: [concept.type], regeneratedFrom: seedSalt || null },
  };
};

const keywordize = (text, stopwords) => {
  const tokens = tokenize(text).filter((t) => !isStopword(t, stopwords) && t.length >= 4);
  return [...new Set(tokens)].slice(0, 8);
};

const buildShortAnswer = ({ concept, sentenceMap, difficulty, seedSalt, stopwords }) => {
  const grounding = pickEvidenceForConcept(concept, sentenceMap);
  if (!grounding) {
    return null;
  }

  const sentence = grounding.evidenceSnippets[0];
  const requiredKeywords = keywordize(sentence, stopwords);
  const optionalKeywords = keywordize(concept.name, stopwords);

  return {
    id: hashToUuid(`${seedSalt || concept.id}|shortAnswer|${concept.id}`),
    type: "shortAnswer",
    topic: concept.name,
    topicConceptId: concept.id,
    bloomLevel: difficulty === "hard" ? "L3" : "L2",
    prompt: `In your own words, explain "${concept.name}" based on the provided text.`,
    answerKey: {
      rubricPoints: [
        { id: "r1", label: "Uses key terms from the text", points: 1 },
        { id: "r2", label: "Accurately describes the concept/process", points: 1 },
      ],
      requiredKeywords,
      optionalKeywords,
    },
    answerKeyText: requiredKeywords,
    explanation: sentence,
    grounding,
    points: POINTS_BY_TYPE.shortAnswer,
    meta: { difficulty, tags: [concept.type], regeneratedFrom: seedSalt || null },
  };
};

const validateQuestion = ({ question, sentenceIdSet, tokenSet, stopwords }) => {
  const issues = [];
  if (!question || !question.type) {
    issues.push("Missing type.");
    return issues;
  }

  const grounding = question.grounding;
  if (!grounding || !Array.isArray(grounding.sourceSentenceIds) || !grounding.sourceSentenceIds.length) {
    issues.push("Missing grounding sourceSentenceIds.");
  } else {
    grounding.sourceSentenceIds.forEach((id) => {
      if (!sentenceIdSet.has(id)) {
        issues.push(`Invalid sourceSentenceId ${id}.`);
      }
    });
  }

  const promptTokens = tokenize(question.prompt).filter((t) => !isStopword(t, stopwords) && t.length >= 4);
  const unseen = promptTokens.filter((t) => !tokenSet.has(t));
  if (unseen.length > 6) {
    issues.push("Prompt contains too many out-of-text terms.");
  }

  if (question.type === "mcq") {
    if (!Array.isArray(question.choices) || question.choices.length !== 4) {
      issues.push("MCQ must have 4 choices.");
    } else {
      const unique = new Set(question.choices);
      if (unique.size !== question.choices.length) {
        issues.push("MCQ choices must be unique.");
      }
    }
    if (!choiceLabels.includes(question.answerKey)) {
      issues.push("MCQ answerKey must be A-D.");
    }
  }

  if (question.type === "trueFalse") {
    if (typeof question.answerKey !== "boolean") {
      issues.push("TrueFalse answerKey must be boolean.");
    }
  }

  if (question.type === "fillBlank") {
    if (!question.answerKey || String(question.answerKey).trim().length < 2) {
      issues.push("FillBlank answerKey required.");
    }
  }

  if (question.type === "shortAnswer") {
    const ak = question.answerKey;
    if (!ak || !Array.isArray(ak.rubricPoints) || !Array.isArray(ak.requiredKeywords)) {
      issues.push("ShortAnswer answerKey must include rubricPoints and requiredKeywords.");
    }
  }

  return issues;
};

const generateGroundedExam = ({ text, title, config, seed }) => {
  const startedAt = Date.now();
  const blueprintBundle = buildBlueprint({ text, seed });
  const sentences = blueprintBundle.sourceText.sentences;
  const sentenceMap = new Map(sentences.map((s) => [s.id, s]));
  const sentenceIdSet = new Set(sentences.map((s) => s.id));
  const tokenSet = buildTokenSet(text, DEFAULT_STOPWORDS);

  const seedValue = seed == null ? "" : String(seed);
  const rng = rngFromString(seedValue || text);
  const concepts = shuffleDeterministic(blueprintBundle.blueprint.concepts, rng);
  const difficulty = config?.difficulty || "medium";

  const examId = hashToUuid(`${seedValue || text}|${normalizeWhitespace(title || "")}|${JSON.stringify(config)}`);

  const questionPlan = [];
  Object.entries(config.types).forEach(([type, count]) => {
    for (let i = 0; i < count; i += 1) {
      questionPlan.push(type);
    }
  });

  const generationStartedAt = Date.now();
  const questions = [];
  const flagged = [];

  for (let i = 0; i < questionPlan.length; i += 1) {
    const type = questionPlan[i];
    const concept = concepts[i % concepts.length];
    let q = null;

    if (type === "mcq") {
      q = buildMcq({ concept, concepts, sentenceMap, difficulty });
    } else if (type === "trueFalse") {
      q = buildTrueFalse({ concept, concepts, sentenceMap, difficulty, index: i });
    } else if (type === "shortAnswer") {
      q = buildShortAnswer({ concept, sentenceMap, difficulty, stopwords: DEFAULT_STOPWORDS });
    } else if (type === "fillBlank") {
      q = buildFillBlank({ concept, sentenceMap, difficulty });
    }

    if (!q) {
      continue;
    }

    const issues = validateQuestion({ question: q, sentenceIdSet, tokenSet, stopwords: DEFAULT_STOPWORDS });
    if (issues.length) {
      flagged.push({ questionId: q.id, issues });
    }

    questions.push(q);
  }

  const validateStartedAt = Date.now();

  if (flagged.length) {
    for (let i = 0; i < questions.length; i += 1) {
      const q = questions[i];
      const issues = validateQuestion({ question: q, sentenceIdSet, tokenSet, stopwords: DEFAULT_STOPWORDS });
      if (!issues.length) {
        continue;
      }

      const replacementConcept = concepts[(i + 3) % concepts.length];
      let replacement = null;
      if (q.type === "mcq") {
        replacement = buildMcq({ concept: replacementConcept, concepts, sentenceMap, difficulty, seedSalt: q.id });
      } else if (q.type === "trueFalse") {
        replacement = buildTrueFalse({
          concept: replacementConcept,
          concepts,
          sentenceMap,
          difficulty,
          seedSalt: q.id,
          index: i,
        });
      } else if (q.type === "shortAnswer") {
        replacement = buildShortAnswer({
          concept: replacementConcept,
          sentenceMap,
          difficulty,
          seedSalt: q.id,
          stopwords: DEFAULT_STOPWORDS,
        });
      } else if (q.type === "fillBlank") {
        replacement = buildFillBlank({ concept: replacementConcept, sentenceMap, difficulty, seedSalt: q.id });
      }

      if (replacement) {
        const replacementIssues = validateQuestion({
          question: replacement,
          sentenceIdSet,
          tokenSet,
          stopwords: DEFAULT_STOPWORDS,
        });
        if (!replacementIssues.length) {
          questions[i] = replacement;
        }
      }
    }
  }

  const totalPoints = questions.reduce((sum, q) => sum + (q.points || 0), 0);

  const exam = {
    id: examId,
    apiVersion: API_VERSION,
    pipelineVersion: PIPELINE_VERSION,
    createdAt: new Date().toISOString(),
    title: title || "Generated Exam",
    config,
    blueprint: blueprintBundle.blueprint,
    sourceText: blueprintBundle.sourceText,
    questions,
    totalPoints,
    quality: {
      groundedQuestionsCount: questions.filter((q) => q.grounding?.sourceSentenceIds?.length).length,
      flaggedQuestionsCount: flagged.length,
      flagged,
    },
    meta: {
      seed: blueprintBundle.seed,
      timingsMs: {
        extract: blueprintBundle.timingsMs.extract,
        generate: Date.now() - generationStartedAt,
        validate: Date.now() - validateStartedAt,
        total: Date.now() - startedAt,
      },
    },
  };

  return exam;
};

module.exports = {
  API_VERSION,
  PIPELINE_VERSION,
  DEFAULT_STOPWORDS,
  splitIntoSentences,
  buildBlueprint,
  generateGroundedExam,
  validateQuestion,
};
