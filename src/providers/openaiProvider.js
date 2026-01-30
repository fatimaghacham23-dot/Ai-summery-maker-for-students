const { AppError } = require("../middleware/errorHandler");
const { debugFetch } = require("../debug/debugFetch");
const getPrompt = ({ text, length, format }) => {
  const lengthInstructions = {
    short: "2-3 sentences",
    medium: "4-6 sentences",
    detailed: "7-10 sentences",
    unlimited: "As long as needed, with no length limit",
  };

  const formatInstruction =
    format === "bullets"
      ? "Return bullet points starting with '- '."
      : "Return a single paragraph.";

  return [
    "You are a helpful assistant that summarizes study notes for students.",
    `Summary length: ${lengthInstructions[length]}.`,
    formatInstruction,
    "Keep the summary concise and clear.",
    "Text:",
    text,
  ].join("\n");
};

const summarize = async ({ text, length, format }) => {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new AppError(
      "OPENAI_API_KEY is missing. Set it in your environment to use the openai provider.",
      400,
      "CONFIG_ERROR"
    );
  }

  const response = await debugFetch("summary_generate", "https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: getPrompt({ text, length, format }),
        },
      ],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new AppError(
      `OpenAI request failed: ${response.status} ${errorBody}`,
      502,
      "PROVIDER_ERROR"
    );
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new AppError("OpenAI returned an empty summary.", 502, "PROVIDER_ERROR");
  }

  return content;
};

module.exports = {
  summarize,
  generateExam: async ({ text, title, config }) => {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new AppError(
        "OPENAI_API_KEY is missing. Set it in your environment to use the openai provider.",
        400,
        "CONFIG_ERROR"
      );
    }

    const prompt = [
      "You are an assistant that builds practice exams from study notes.",
      "Return ONLY valid JSON with keys: title, blueprint, questions.",
      "Blueprint should be an array of 4-8 topic labels extracted from the entire notes.",
      "Generate questions topic-by-topic for balanced coverage of the blueprint.",
      "Question quality requirements:",
      "- Questions must be conceptual, analytical, and applied (not just definitions).",
      "- Use Bloom-style depth: mostly Explain/Compare (L2), Apply (L3), Analyze/Reason (L4).",
      "- Limit pure definition/term questions to at most 15-20% of total.",
      "- Cover ALL subjects/topics mentioned in the notes, not just the first paragraphs.",
      "- Avoid repetition: do not ask the same fact in different wording.",
          "Schema requirements:",
      "- Every question must include: type, topic, bloomLevel (L1-L4), prompt, explanation, points.",
      "- Non-true/false questions must include a rationale in explanation.",
      "- MCQ must include choices (4 options) and answerKey (A-D).",
      "- Short answer must include answerKeyText array.",
      "- Fill blank must include answerKeyBlank string.",
      "True/False requirements (mandatory schema):",
      "- type must be trueFalse.",
      '- Include "classification": one of Definition | Concept | Fact | Application.',
      "- Include answerKeyBool (boolean).",
      "- Include explanation with at least 2 sentences explaining why true/false.",
      "Few-shot examples (format only, not from the notes):",
      JSON.stringify(
        {
          title: "Example Exam",
          blueprint: ["Topic A", "Topic B"],
          questions: [
            {
              type: "mcq",
              topic: "Topic A",
              bloomLevel: "L3",
              prompt:
                "A student applies principle X to scenario Y. Which step best prevents the failure mode?",
              choices: ["Option A", "Option B", "Option C", "Option D"],
              answerKey: "B",
              explanation:
                "The scenario requires applying principle X to avoid the failure mode. Option B aligns with the correct mitigation.",
              points: 1,
            },
            {
              type: "shortAnswer",
              topic: "Topic B",
              bloomLevel: "L2",
              prompt: "Compare approach A vs B for balancing trade-offs in this system.",
              answerKeyText: ["trade-off", "efficiency", "risk"],
              explanation:
                "A strong response contrasts the approaches and references efficiency/risk trade-offs.",
              points: 2,
            },
            {
              type: "trueFalse",
              topic: "Topic A",
              bloomLevel: "L2",
              prompt: "True or False: In scenario Z, applying X always increases output.",
              classification: "Application",
              answerKeyBool: false,
              explanation:
                "The claim ignores the constraints in scenario Z that limit output. It would only be true if those constraints were removed.",
              points: 1,
            },
          ],
        },
        null,
        2
      ),
      `Difficulty: ${config.difficulty}`,
      `Question counts: ${JSON.stringify(config.types)}`,
      "Language: en",
      `Title (optional): ${title || "Auto-generate a concise title"}`,
      "Study text:",
      text,
    ].join("\n");

    const response = await debugFetch("exam_generate", "https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new AppError(
        `OpenAI request failed: ${response.status} ${errorBody}`,
        502,
        "PROVIDER_ERROR"
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();

    if (!content) {
      throw new AppError("OpenAI returned empty exam content.", 502, "PROVIDER_ERROR");
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      throw new AppError("OpenAI returned invalid JSON for exam.", 502, "PROVIDER_ERROR");
    }

    if (!parsed?.questions || !Array.isArray(parsed.questions)) {
      throw new AppError("OpenAI exam response missing questions.", 502, "PROVIDER_ERROR");
    }

    return {
      title: parsed.title || title || "Generated Exam",
      questions: parsed.questions,
      blueprint: parsed.blueprint,
    };
  },
};
