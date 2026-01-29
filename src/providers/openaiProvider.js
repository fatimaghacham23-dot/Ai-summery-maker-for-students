const { AppError } = require("../middleware/errorHandler");

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

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
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
      "Return a JSON object with keys: title, questions.",
      "Each question must include: type, prompt, choices (mcq only), answerKey, answerKeyBool, answerKeyText, answerKeyBlank, explanation, points.",
      `Difficulty: ${config.difficulty}`,
      `Question counts: ${JSON.stringify(config.types)}`,
      "Language: en",
      `Title (optional): ${title || "Auto-generate a concise title"}`,
      "Study text:",
      text,
    ].join("\n");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
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
    };
  },
};
