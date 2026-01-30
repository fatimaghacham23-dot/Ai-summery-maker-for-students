const crypto = require("crypto");
const { createSummaryText, formatSummary } = require("../utils/summary");
const { POINTS_BY_TYPE } = require("../utils/exams");

const normalizeWords = (text) => {
  const words = text
    .toLowerCase()
    .match(/[a-z]{3,}/g);
  if (!words) {
    return ["concept", "study", "topic", "focus", "detail"];
  }
  const unique = [...new Set(words)];
  return unique.length >= 5 ? unique : unique.concat(["concept", "study", "topic"]);
};

const hashToUuid = (seed) => {
  const hash = crypto.createHash("sha256").update(seed).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(
    16,
    20
  )}-${hash.slice(20, 32)}`;
};

const generateExam = async ({ text, title, config }) => {
  const keywords = normalizeWords(text);
  const seed = `${text}-${JSON.stringify(config)}-${title || ""}`;
  const titleText = title || `Exam on ${keywords[0][0].toUpperCase()}${keywords[0].slice(1)}`;

  const questions = [];
  const typeOrder = ["mcq", "trueFalse", "shortAnswer", "fillBlank"];
  let index = 0;
  const blueprint = keywords.slice(0, Math.min(4, keywords.length, config.questionCount));
  typeOrder.forEach((type) => {
    const count = config.types[type];
    for (let i = 0; i < count; i += 1) {
      const id = hashToUuid(`${seed}-${type}-${index}`);
      const keyword = keywords[(index + i) % keywords.length];
      const topic = blueprint[index % blueprint.length] || keyword;
      if (type === "mcq") {
        const choices = Array.from({ length: 4 }, (_, choiceIndex) => {
          const word = keywords[(index + choiceIndex) % keywords.length];
          return `${word} concept`;
        });
        const answerKey = ["A", "B", "C", "D"][index % 4];
        questions.push({
          id,
          type,
          topic,
          bloomLevel: "L3",
          prompt: `Which option best applies "${keyword}" to the study scenario?`,
          choices,
          answerKey,
          explanation: `The study notes emphasize applying "${keyword}" to real situations. The correct option aligns with that application.`,
          points: POINTS_BY_TYPE.mcq,
        });
      } else if (type === "trueFalse") {
        const answerKeyBool = index % 2 === 0;
        questions.push({
          id,
          type,
          topic,
          bloomLevel: "L2",
          prompt: `True or False: "${keyword}" drives a core relationship described in the notes.`,
          classification: "Concept",
          answerKeyBool,
          explanation: `This statement is ${answerKeyBool ? "true" : "false"} based on the notes. The relationship described shows how "${keyword}" connects to other ideas.`,
          points: POINTS_BY_TYPE.trueFalse,
        });
      } else if (type === "shortAnswer") {
        const related = keywords.slice(index % keywords.length, index % keywords.length + 3);
        questions.push({
          id,
          type,
          topic,
          bloomLevel: "L2",
          prompt: `Briefly compare how "${keyword}" influences two processes in the notes.`,
          answerKeyText: related,
          explanation: `A strong response compares processes using keywords like ${related.join(", ")}.`,
          points: POINTS_BY_TYPE.shortAnswer,
        });
      } else if (type === "fillBlank") {
        questions.push({
          id,
          type,
          topic,
          bloomLevel: "L2",
          prompt: `Fill in the blank: The key process of ____ is central to "${keyword}".`,
          answerKeyBlank: keyword,
          explanation: `The missing term is "${keyword}", which anchors the related process described.`,
          points: POINTS_BY_TYPE.fillBlank,
        });
      }
      index += 1;
    }
  });

  return {
    title: titleText,
    blueprint,
    questions,
  };
};
const summarize = async ({ text, length, format }) => {
  const summaryText = createSummaryText({ text, length });
  return formatSummary({ summaryText, format });
};

module.exports = {
  summarize,
  generateExam,
};
