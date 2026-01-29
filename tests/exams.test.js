process.env.SUMMARIZER_PROVIDER = "mock";
process.env.DATABASE_PATH = ":memory:";

const request = require("supertest");
const app = require("../src/app");
const { db } = require("../src/db");

const baseText =
  "Photosynthesis is the process by which plants convert light energy into chemical energy. " +
  "Chlorophyll absorbs light, and carbon dioxide combines with water to produce glucose and oxygen. " +
  "This process supports life by generating oxygen and storing energy in sugars.";

beforeEach(() => {
  db.exec("DELETE FROM attempts; DELETE FROM exams;");
});

describe("Exam Maker API", () => {
  test("generate exam success", async () => {
    const response = await request(app)
      .post("/api/exams/generate")
      .send({
        text: baseText,
        difficulty: "easy",
        questionCount: 6,
        types: { mcq: 3, trueFalse: 1, shortAnswer: 1, fillBlank: 1 },
      });

    expect(response.status).toBe(200);
    expect(response.body.id).toBeDefined();
    expect(response.body.questions).toHaveLength(6);
    expect(response.body.config.difficulty).toBe("easy");
  });

  test("generate exam validation error on types sum", async () => {
    const response = await request(app)
      .post("/api/exams/generate")
      .send({
        text: baseText,
        questionCount: 5,
        types: { mcq: 2, trueFalse: 1, shortAnswer: 1, fillBlank: 0 },
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  test("generate exam validation error on invalid difficulty", async () => {
    const response = await request(app)
      .post("/api/exams/generate")
      .send({
        text: baseText,
        difficulty: "expert",
        questionCount: 5,
        types: { mcq: 2, trueFalse: 1, shortAnswer: 1, fillBlank: 1 },
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  test("get exam by id", async () => {
    const generate = await request(app)
      .post("/api/exams/generate")
      .send({
        text: baseText,
        questionCount: 5,
        types: { mcq: 2, trueFalse: 1, shortAnswer: 1, fillBlank: 1 },
      });

    const examId = generate.body.id;
    const response = await request(app).get(`/api/exams/${examId}`);
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(examId);
  });

  test("submit exam scoring works", async () => {
    const generate = await request(app)
      .post("/api/exams/generate")
      .send({
        text: baseText,
        questionCount: 5,
        types: { mcq: 2, trueFalse: 1, shortAnswer: 1, fillBlank: 1 },
      });

    const exam = generate.body;
    const answers = exam.questions.map((question) => {
      let value = "";
      if (question.type === "mcq") {
        value = question.answerKey;
      } else if (question.type === "trueFalse") {
        value = question.answerKeyBool;
      } else if (question.type === "shortAnswer") {
        value = question.answerKeyText.join(" ");
      } else if (question.type === "fillBlank") {
        value = question.answerKeyBlank;
      }
      return {
        questionId: question.id,
        type: question.type,
        value,
      };
    });

    const response = await request(app)
      .post(`/api/exams/${exam.id}/submit`)
      .send({ examId: exam.id, answers });

    expect(response.status).toBe(200);
    expect(response.body.score.percent).toBe(100);
  });

  test("export json and html", async () => {
    const generate = await request(app)
      .post("/api/exams/generate")
      .send({
        text: baseText,
        questionCount: 5,
        types: { mcq: 2, trueFalse: 1, shortAnswer: 1, fillBlank: 1 },
      });

    const examId = generate.body.id;
    const jsonExport = await request(app).get(`/api/exams/${examId}/export?format=json`);
    expect(jsonExport.status).toBe(200);
    expect(jsonExport.body.id).toBe(examId);

    const htmlExport = await request(app).get(`/api/exams/${examId}/export?format=html`);
    expect(htmlExport.status).toBe(200);
    expect(htmlExport.headers["content-type"]).toContain("text/html");
  });
});
