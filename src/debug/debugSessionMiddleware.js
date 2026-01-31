const crypto = require("crypto");

const { runWithDebugContext } = require("./debugContext");

const COOKIE_NAME = "debug_session";

const parseCookieHeader = (headerValue) => {
  const result = {};
  if (!headerValue) {
    return result;
  }

  headerValue.split(";").forEach((pair) => {
    const index = pair.indexOf("=");
    if (index === -1) {
      return;
    }

    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (!key) {
      return;
    }

    try {
      result[key] = decodeURIComponent(value);
    } catch {
      result[key] = value;
    }
  });

  return result;
};

const appendSetCookie = (res, cookieValue) => {
  const existing = res.getHeader("Set-Cookie");
  if (!existing) {
    res.setHeader("Set-Cookie", cookieValue);
    return;
  }

  if (Array.isArray(existing)) {
    res.setHeader("Set-Cookie", [...existing, cookieValue]);
    return;
  }

  res.setHeader("Set-Cookie", [existing, cookieValue]);
};

const ensureDebugSessionId = (req, res) => {
  const cookies = parseCookieHeader(req.headers.cookie);
  let sessionId = (cookies[COOKIE_NAME] || "").trim();

  if (!sessionId) {
    sessionId = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : crypto.randomBytes(16).toString("hex");

    const parts = [`${COOKIE_NAME}=${encodeURIComponent(sessionId)}`, "Path=/", "SameSite=Lax"];
    if (process.env.NODE_ENV === "production") {
      parts.push("Secure");
    }
    appendSetCookie(res, parts.join("; "));
  }

  req.debugSessionId = sessionId;
  return sessionId;
};

const debugSessionMiddleware = (req, res, next) => {
  const sessionId = ensureDebugSessionId(req, res);
  runWithDebugContext({ debugSessionId: sessionId }, () => next());
};

module.exports = {
  COOKIE_NAME,
  parseCookieHeader,
  debugSessionMiddleware,
};
