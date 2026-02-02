const { validateQuestion, DEFAULT_STOPWORDS } = require("../src/utils/groundedExamPipeline");

const buildTokenSet = (text) => {
  const tokens = String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 4);
  return new Set(tokens);
};

const evidence =
  "Photosynthesis converts light energy into chemical energy in plants.";
const sentenceIdSet = new Set(["s1"]);

const baseGrounding = {
  sourceSentenceIds: ["s1"],
  sourceOffsets: [{ start: 0, end: evidence.length }],
  evidenceSnippets: [evidence],
};

const runValidation = ({ question, subjectCategory = "science", strictTypes = false }) => {
  const resolvedQuestion = {
    grounding: question.grounding || baseGrounding,
    ...question,
  };
  return validateQuestion({
    question: resolvedQuestion,
    sentenceIdSet,
    tokenSet: buildTokenSet(`${evidence} ${resolvedQuestion.prompt || ""}`),
    stopwords: DEFAULT_STOPWORDS,
    sentenceIdToSectionId: new Map(),
    sectionTokenSets: new Map(),
    sectionTitleMap: new Map(),
    subjectCategory,
    strictTypes,
  });
};

describe("Grounded exam validation rules", () => {
  test("TF overlap should not automatically fail", () => {
    const prompt =
      "True or False: In plants, photosynthesis converts light energy into chemical energy.";
    const issues = runValidation({
      question: {
        type: "trueFalse",
        prompt,
        answerKey: true,
      },
    });
    expect(issues).toEqual([]);
  });

  test("Banned stems trigger validation failures", () => {
    const prompt = "Which statement best matches how photosynthesis converts light?";
    const issues = runValidation({
      question: {
        type: "mcq",
        prompt,
        answerKey: "A",
        meta: {
          templateFamily: "statement-correct",
        },
      },
    });
    expect(issues).toContain("Prompt contains banned stem.");
  });

  test("Scenario prompt structure is enforced", () => {
    const prompt = "Which option describes photosynthesis in plants?";
    const issues = runValidation({
      question: {
        type: "mcq",
        prompt,
        answerKey: "A",
        meta: {
          templateFamily: "scenario-application",
          templateId: "mcq_scenario_application",
        },
      },
    });
    expect(issues).toContain(
      "Scenario prompt lacks required if/when/system/process structure."
    );
  });

  test("FillBlank reconstruction validates removed spans", () => {
    const prompt = "Fill in the blank: ____ converts light to energy.";
    const issues = runValidation({
      question: {
        type: "fillBlank",
        prompt,
        answerKey: "light",
        meta: {
          templateId: "fb_statement",
          templateFamily: "definition",
          removedSpanRaw: "Photosynthesis",
          removedSpanNormalized: "photosynthesis",
        },
      },
    });
    expect(issues).toContain("FillBlank answerKey does not match removed span normalized.");
  });

  test("Strict fillBlank fallback bypasses context heuristics", () => {
    const fallbackQuestion = {
      type: "fillBlank",
      prompt: "Fill in the blank: ____ converts light energy into chemical energy in plants.",
      answerKey: "Photosynthesis",
      answerKeyBlank: "Photosynthesis",
      meta: {
        templateFamily: "fallback",
        removedSpanRaw: "Photosynthesis",
        removedSpanNormalized: "photosynthesis",
      },
      grounding: baseGrounding,
    };
    const issues = runValidation({
      question: fallbackQuestion,
      subjectCategory: "science",
      strictTypes: true,
    });
    expect(issues).toEqual([]);
  });
});
