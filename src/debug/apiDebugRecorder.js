const { debugBuffer } = require("./debugBuffer");
const { redactHeaders, redactRequestBody } = require("./debugFetch");
const { getDebugContext } = require("./debugContext");

const deriveOperationName = (req) => {
  const path = String(req.path || "");
  if (path === "/summarize") return "summary_generate";
  if (path === "/exams/generate") return "exam_generate";
  return `api_${String(req.method || "GET").toLowerCase()}_${path.replace(/\W+/g, "_")}`;
};

const toResponsePayload = (value) => {
  if (value == null) {
    return { parsed: null, pretty: null, raw: null };
  }

  if (Buffer.isBuffer(value)) {
    return { parsed: null, pretty: null, raw: value.toString("utf8") };
  }

  if (typeof value === "string") {
    return { parsed: null, pretty: null, raw: value };
  }

  if (typeof value === "object") {
    try {
      return {
        parsed: value,
        pretty: JSON.stringify(value, null, 2),
        raw: JSON.stringify(value),
      };
    } catch {
      return { parsed: null, pretty: null, raw: String(value) };
    }
  }

  return { parsed: null, pretty: null, raw: String(value) };
};

const apiDebugRecorder = (req, res, next) => {
  const startedAt = Date.now();
  const timestamp = new Date().toISOString();

  const ctx = getDebugContext();
  const debugSessionId = ctx?.debugSessionId || req.debugSessionId || null;

  let capturedBody;

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    capturedBody = body;
    return originalJson(body);
  };

  const originalSend = res.send.bind(res);
  res.send = (body) => {
    capturedBody = body;
    return originalSend(body);
  };

  res.on("finish", () => {
    const latencyMs = Date.now() - startedAt;

    const recordBase = {
      timestamp,
      operationName: deriveOperationName(req),
      url: req.originalUrl,
      method: req.method,
      requestHeaders: redactHeaders(req.headers),
      requestBody: redactRequestBody(req.body),
      status: res.statusCode,
      responseHeaders: redactHeaders(res.getHeaders()),
      latencyMs,
      debugSessionId,
      source: "api",
      error: null,
    };

    const responsePayload = toResponsePayload(capturedBody);

    debugBuffer.add({
      ...recordBase,
      responseBodyParsed: responsePayload.parsed,
      responseBodyPretty: responsePayload.pretty,
      responseBodyRaw: responsePayload.raw,
    });
  });

  next();
};

module.exports = {
  apiDebugRecorder,
};
