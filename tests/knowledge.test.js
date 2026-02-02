process.env.DATABASE_PATH = ":memory:";

const { db } = require("../src/db");
const { retrieveRelevantChunks } = require("../src/knowledge/retrieve");

beforeEach(() => {
  db.exec("DELETE FROM knowledge_chunks;");
});

describe("Knowledge retrieval", () => {
  test("retrieveRelevantChunks returns chunks for a query", () => {
    db.prepare(
      `INSERT INTO knowledge_chunks (id, subject, source, license, title, text)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      "k1",
      "science",
      "OpenStax",
      "CC-BY-4.0",
      "Biology",
      "Photosynthesis converts light energy into chemical energy in plants."
    );

    const results = retrieveRelevantChunks("photosynthesis energy", ["science"], 3);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].source).toBe("OpenStax");
  });
});
