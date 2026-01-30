const { debugBuffer } = require("./debugBuffer");

// Centralized redaction + capture helper for external API calls.
const REDACTED = "[REDACTED]";
const SENSITIVE_KEY_PATTERN = /apiKey|authorization|token|secret|password/i;
const HEADER_SENSITIVE_KEY_PATTERN =
  /authorization|cookie|set-cookie|x-api-key|apiKey|token|secret|password/i;

const redactValue = (key, value) => {
  if (key && SENSITIVE_KEY_PATTERN.test(key)) {
    return REDACTED;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(null, item));
  }

  if (value && typeof value === "object") {
    return Object.entries(value).reduce((acc, [childKey, childValue]) => {
      acc[childKey] = redactValue(childKey, childValue);
      return acc;
    }, {});
  }

  return value;
};

const redactHeaders = (headers) => {
  if (!headers) {
    return null;
  }

  const result = {};

  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      result[key] = HEADER_SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : value;
    });
    return result;
  }

  return Object.entries(headers).reduce((acc, [key, value]) => {
    acc[key] = HEADER_SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : value;
    return acc;
  }, result);
};

const redactRawString = (text) =>
  text.replace(
    /(\"?(apiKey|authorization|token|secret|password)\"?\s*:\s*)(\".*?\"|[^,}\n\r]+)/gi,
    (_match, prefix) => `${prefix}\"${REDACTED}\"`
  );

const redactRequestBody = (body) => {
  if (body == null) {
    return null;
  }

  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body);
      return redactValue(null, parsed);
    } catch (error) {
      return body;
    }
  }

  if (typeof body === "object") {
    return redactValue(null, body);
  }

  return body;
};

const parseResponseBody = (text) => {
  if (text === "") {
    return { parsed: null, pretty: null, raw: text };
  }

  try {
    const parsed = JSON.parse(text);
    const redacted = redactValue(null, parsed);
    return {
      parsed: redacted,
      pretty: JSON.stringify(redacted, null, 2),
      raw: JSON.stringify(redacted),
    };
  } catch (error) {
    return { parsed: null, pretty: null, raw: redactRawString(text) };
  }
};

// Wraps fetch() to store the full request/response data in memory.
const debugFetch = async (operationName, url, options = {}) => {
  const startedAt = Date.now();
  const timestamp = new Date().toISOString();

  const baseRecord = {
    timestamp,
    operationName,
    url,
    method: options.method || "GET",
    requestHeaders: redactHeaders(options.headers),
    requestBody: redactRequestBody(options.body),
    status: null,
    responseHeaders: null,
    responseBodyRaw: null,
    responseBodyParsed: null,
    responseBodyPretty: null,
    latencyMs: null,
    error: null,
  };

  try {
    const response = await fetch(url, options);
    const responseClone = response.clone();
    const responseText = await responseClone.text();
    const { parsed, pretty, raw } = parseResponseBody(responseText);

    const record = {
      ...baseRecord,
      status: response.status,
      responseHeaders: redactHeaders(response.headers),
      responseBodyRaw: raw,
      responseBodyParsed: parsed,
      responseBodyPretty: pretty,
      latencyMs: Date.now() - startedAt,
    };

    debugBuffer.add(record);

    return response;
  } catch (error) {
    const record = {
      ...baseRecord,
      latencyMs: Date.now() - startedAt,
      error: {
        message: error?.message,
        stack: error?.stack,
        name: error?.name,
      },
    };

    debugBuffer.add(record);
    throw error;
  }
};

module.exports = {
  debugFetch,
  redactHeaders,
  redactRequestBody,
};