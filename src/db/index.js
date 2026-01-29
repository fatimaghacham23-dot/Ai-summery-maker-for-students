const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const resolveDatabasePath = () => {
  if (process.env.DATABASE_PATH) {
    return process.env.DATABASE_PATH;
  }
  return path.join(__dirname, "../../data/app.db");
};

const ensureDatabaseDirectory = (dbPath) => {
  if (dbPath === ":memory:") {
    return;
  }
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const dbPath = resolveDatabasePath();
ensureDatabaseDirectory(dbPath);

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL;");

db.exec(`
  CREATE TABLE IF NOT EXISTS exams (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    sourceTextHash TEXT NOT NULL,
    configJson TEXT NOT NULL,
    examJson TEXT NOT NULL,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS attempts (
    id TEXT PRIMARY KEY,
    examId TEXT NOT NULL,
    answersJson TEXT NOT NULL,
    scoreJson TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    FOREIGN KEY (examId) REFERENCES exams(id)
  );
`);

module.exports = {
  db,
};
