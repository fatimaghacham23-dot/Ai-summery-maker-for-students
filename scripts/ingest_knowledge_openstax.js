const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { db } = require("../src/db");

const DATASET_DIR = path.join(__dirname, "..", "datasets");
const SOURCE_NAME = "OpenStax";
const LICENSE = "CC-BY-4.0";
const MIN_CHUNK = 800;
const MAX_CHUNK = 1200;
const OVERLAP = 150;

const SUBJECTS = [
  "math",
  "science",
  "english",
  "geography",
  "history",
  "cs",
  "other",
];

const SUBJECT_HINTS = [
  { subject: "math", patterns: ["algebra", "calculus", "precalculus", "geometry", "trigonometry", "statistics"] },
  { subject: "science", patterns: ["biology", "chemistry", "physics", "astronomy", "microbiology", "anatomy"] },
  { subject: "english", patterns: ["english", "literature", "writing", "grammar"] },
  { subject: "geography", patterns: ["geography", "earth science", "earth"] },
  { subject: "history", patterns: ["history", "government", "economics", "sociology", "psychology"] },
  { subject: "cs", patterns: ["computer", "programming", "coding", "informatics", "ict"] },
];

const normalize = (value) => String(value || "").toLowerCase();

const detectSubjectFromText = (text) => {
  const haystack = normalize(text);
  for (const hint of SUBJECT_HINTS) {
    if (hint.patterns.some((pattern) => haystack.includes(pattern))) {
      return hint.subject;
    }
  }
  return "other";
};

const detectSubject = ({ title, fileName, text }) => {
  const fromTitle = detectSubjectFromText(title);
  if (fromTitle !== "other") {
    return fromTitle;
  }
  const fromFile = detectSubjectFromText(fileName);
  if (fromFile !== "other") {
    return fromFile;
  }
  return detectSubjectFromText(text);
};

const getTextField = (record) =>
  record?.text ||
  record?.content ||
  record?.body ||
  record?.passage ||
  record?.chapter ||
  record?.paragraph ||
  "";

const getTitleField = (record) =>
  record?.title ||
  record?.book ||
  record?.chapter_title ||
  record?.chapterTitle ||
  record?.section ||
  record?.section_title ||
  record?.sectionTitle ||
  "";

const chunkText = (text) => {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return [];
  }

  const chunks = [];
  let cursor = 0;
  while (cursor < cleaned.length) {
    const targetEnd = Math.min(cleaned.length, cursor + MAX_CHUNK);
    let end = targetEnd;
    if (targetEnd < cleaned.length) {
      const slice = cleaned.slice(cursor, targetEnd);
      const lastBreak = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("; "), slice.lastIndexOf(", "));
      if (lastBreak > MIN_CHUNK * 0.6) {
        end = cursor + lastBreak + 1;
      }
    }
    const chunk = cleaned.slice(cursor, end).trim();
    if (chunk.length >= MIN_CHUNK * 0.6) {
      chunks.push(chunk);
    }
    cursor = Math.max(end - OVERLAP, cursor + MIN_CHUNK);
  }
  return chunks;
};

const listDatasetFiles = (dir) => {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  entries.forEach((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listDatasetFiles(fullPath));
      return;
    }
    if (/\.(jsonl|json|txt)$/i.test(entry.name)) {
      files.push(fullPath);
    }
  });
  return files;
};

const hashId = (value) =>
  crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 20);

const ingestFile = (filePath, insertStmt) => {
  const fileName = path.basename(filePath);
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = filePath.toLowerCase().endsWith(".jsonl") ? raw.split(/\r?\n/) : [raw];
  let inserted = 0;

  lines.forEach((line) => {
    if (!line || !line.trim()) {
      return;
    }
    let record;
    if (filePath.toLowerCase().endsWith(".json") || filePath.toLowerCase().endsWith(".jsonl")) {
      try {
        record = JSON.parse(line);
      } catch (err) {
        return;
      }
    } else {
      record = { text: line };
    }

    const text = getTextField(record);
    if (!text || text.length < 50) {
      return;
    }
    const title = getTitleField(record) || fileName.replace(/\.[^/.]+$/, "");
    const subject = detectSubject({ title, fileName, text });

    const chunks = chunkText(text);
    chunks.forEach((chunk, index) => {
      const id = hashId(`${SOURCE_NAME}|${title}|${subject}|${fileName}|${index}|${chunk.slice(0, 50)}`);
      insertStmt.run(id, subject, SOURCE_NAME, LICENSE, title, chunk);
      inserted += 1;
    });
  });

  return inserted;
};

const main = () => {
  const files = listDatasetFiles(DATASET_DIR);
  if (!files.length) {
    console.error(`No dataset files found in ${DATASET_DIR}.`);
    console.error("Place OpenStax dataset files under /datasets before running.");
    process.exit(1);
  }

  const clearExisting = process.env.CLEAR_KNOWLEDGE === "true";
  if (clearExisting) {
    db.exec("DELETE FROM knowledge_chunks;");
  }

  const insertStmt = db.prepare(
    `INSERT OR IGNORE INTO knowledge_chunks (id, subject, source, license, title, text)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  db.exec("BEGIN");
  let total = 0;
  files.forEach((file) => {
    const count = ingestFile(file, insertStmt);
    total += count;
    console.log(`Ingested ${count} chunks from ${path.basename(file)}`);
  });
  db.exec("COMMIT");

  console.log(`Done. Inserted ${total} knowledge chunks.`);
};

main();
