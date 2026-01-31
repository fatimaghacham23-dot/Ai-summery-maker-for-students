const express = require("express");
const crypto = require("crypto");

const { debugBuffer } = require("./debugBuffer");

const isDebugRoutesEnabled = () =>
  process.env.NODE_ENV !== "production" ||
  process.env.ENABLE_DEBUG_ROUTES === "true";

// --- helpers ---
const escapeHtml = (value) => {
  const s = String(value ?? "");
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

const safeEqual = (a, b) => {
  // constant-time compare when lengths match
  const aBuf = Buffer.from(String(a ?? ""), "utf8");
  const bBuf = Buffer.from(String(b ?? ""), "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
};

const getRequestSessionId = (req) => (req && req.debugSessionId ? String(req.debugSessionId) : null);

// Require DEBUG_TOKEN via x-debug-token for every debug route.
// In non-production, if DEBUG_TOKEN is not set, allow requests (convenient dev default).
const requireDebugToken = (req, res, next) => {
  const expectedToken = process.env.DEBUG_TOKEN;
  const providedToken = (req.header("x-debug-token") || "").trim();

  if (!expectedToken) {
    if (process.env.NODE_ENV !== "production") return next();
    return res.status(403).json({ error: "DEBUG_TOKEN is not configured." });
  }

  if (!safeEqual(providedToken, expectedToken)) {
    return res.status(403).json({ error: "Invalid debug token." });
  }

  return next();
};

const renderDebugPage = (calls) => {
  const rows = calls
    .map(
      (entry) => `
        <tr>
          <td>${escapeHtml(entry.id)}</td>
          <td>${escapeHtml(entry.timestamp)}</td>
          <td>${escapeHtml(entry.operationName)}</td>
          <td>${escapeHtml(entry.status ?? "error")}</td>
          <td>${escapeHtml(entry.latencyMs ?? "-")} ms</td>
          <td><button data-id="${escapeHtml(entry.id)}">View</button></td>
        </tr>
      `
    )
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>API Debug Calls</title>
    <style>
      body { font-family: sans-serif; padding: 20px; }
      table { border-collapse: collapse; width: 100%; margin-top: 16px; }
      th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
      th { background: #f5f5f5; }
      pre { background: #111; color: #f8f8f2; padding: 12px; overflow: auto; }
      .toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
      input { padding: 6px; }
      button { padding: 6px 10px; cursor: pointer; }
    </style>
  </head>
  <body>
    <h1>API Debug Calls</h1>
    <p>Supply the debug token to load call details. This page is for internal development only.</p>

    <div class="toolbar">
      <label>
        Debug token:
        <input id="token" type="password" placeholder="x-debug-token" autocomplete="off" />
      </label>
      <button id="load" type="button">Reload calls</button>
      <button id="clear" type="button">Clear buffer</button>
    </div>

    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Timestamp</th>
          <th>Operation</th>
          <th>Status</th>
          <th>Latency</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody id="calls">
        ${rows || `<tr><td colspan="6">No calls yet.</td></tr>`}
      </tbody>
    </table>

    <h2>Call details</h2>
    <pre id="details">Select a call to view details.</pre>

    <script>
      const tokenInput = document.getElementById('token');
      const callsBody = document.getElementById('calls');
      const details = document.getElementById('details');

      const fetchWithToken = (url, options = {}) => {
        const token = tokenInput.value;
        return fetch(url, {
          ...options,
          headers: {
            ...(options.headers || {}),
            'x-debug-token': token,
          },
        });
      };

      const loadCalls = async () => {
        details.textContent = '';
        const response = await fetchWithToken('/__debug/api-calls');
        if (!response.ok) {
          details.textContent = await response.text();
          return;
        }
        const data = await response.json();

        callsBody.innerHTML =
          data.map((entry) => \`
            <tr>
              <td>\${entry.id}</td>
              <td>\${entry.timestamp}</td>
              <td>\${entry.operationName}</td>
              <td>\${entry.status ?? 'error'}</td>
              <td>\${entry.latencyMs ?? '-'} ms</td>
              <td><button data-id="\${entry.id}">View</button></td>
            </tr>
          \`).join('') || '<tr><td colspan="6">No calls yet.</td></tr>';
      };

      document.getElementById('load').addEventListener('click', loadCalls);

      document.getElementById('clear').addEventListener('click', async () => {
        const response = await fetchWithToken('/__debug/api-calls', { method: 'DELETE' });
        details.textContent = response.ok ? 'Cleared.' : await response.text();
        await loadCalls();
      });

      callsBody.addEventListener('click', async (event) => {
        const btn = event.target;
        if (!btn || btn.tagName !== 'BUTTON') return;

        const id = btn.getAttribute('data-id');
        const response = await fetchWithToken(\`/__debug/api-calls/\${encodeURIComponent(id)}\`);

        details.textContent = response.ok
          ? JSON.stringify(await response.json(), null, 2)
          : await response.text();
      });

      // Auto-load on page open
      loadCalls();
    </script>
  </body>
</html>`;
};

const debugRouter = express.Router();

// Protect everything under this router
debugRouter.use(requireDebugToken);

const listCallsSummary = (sessionId) =>
  debugBuffer
    .list()
    .filter((entry) => !sessionId || entry.debugSessionId === sessionId)
    .map(({ id, timestamp, operationName, status, latencyMs }) => ({
      id,
      timestamp,
      operationName,
      status,
      latencyMs,
    }));

debugRouter.get("/", (req, res) => {
  const sessionId = getRequestSessionId(req);
  res.type("html").send(renderDebugPage(listCallsSummary(sessionId)));
});

debugRouter.get("/api-calls", (req, res) => {
  const sessionId = getRequestSessionId(req);
  res.json(listCallsSummary(sessionId));
});

debugRouter.get("/api-calls/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "Invalid call id." });
  }

  const sessionId = getRequestSessionId(req);
  const record = debugBuffer.getById(id);
  if (!record || (sessionId && record.debugSessionId !== sessionId)) {
    return res.status(404).json({ error: "Call not found." });
  }

  return res.json(record);
});

debugRouter.delete("/api-calls", (req, res) => {
  const sessionId = getRequestSessionId(req);
  const count = sessionId
    ? debugBuffer.clearWhere((entry) => entry.debugSessionId === sessionId)
    : debugBuffer.clear();
  res.json({ cleared: count });
});

module.exports = {
  debugRouter,
  isDebugRoutesEnabled,
};
