const tokenInput = document.getElementById("debugTokenInput");
const saveTokenBtn = document.getElementById("saveDebugTokenBtn");
const debugError = document.getElementById("debugError");
const debugList = document.getElementById("debugList");
const debugEmpty = document.getElementById("debugEmpty");
const debugJson = document.getElementById("debugJson");
const debugOutput = document.getElementById("debugOutput");
const copyJsonBtn = document.getElementById("copyJsonBtn");
const operationFilter = document.getElementById("operationFilter");
const statusFilter = document.getElementById("statusFilter");
const idSearch = document.getElementById("idSearch");
const pauseBtn = document.getElementById("pauseBtn");
const clearBtn = document.getElementById("clearBtn");
const debugPage = document.getElementById("debugPage");
const debugDisabled = document.getElementById("debugDisabled");

const DEBUG_TOKEN_KEY = "debug_token";
const POLL_INTERVAL_MS = 2000;

let calls = [];
let selectedId = null;
let pollHandle = null;
let isPaused = false;
let isLoadingCalls = false;
let debugUnavailable = false;
let hasLoggedUnavailable = false;

function setError(message) {
  if (!debugError) {
    return;
  }
  if (message) {
    debugError.textContent = message;
    debugError.classList.add("visible");
  } else {
    debugError.textContent = "";
    debugError.classList.remove("visible");
  }
}

function setDetailsPlaceholder(message) {
  debugJson.textContent = message;
}

function setOutputPlaceholder(message) {
  if (debugOutput) {
    debugOutput.textContent = message;
  }
}

function disableDebug(reason) {
  debugUnavailable = true;
  if (pollHandle) {
    clearInterval(pollHandle);
    pollHandle = null;
  }

  if (debugPage) {
    debugPage.classList.add("is-hidden");
  }
  if (debugDisabled) {
    debugDisabled.classList.remove("is-hidden");
    debugDisabled.textContent = reason;
  }

  if (!hasLoggedUnavailable) {
    console.warn(reason);
    hasLoggedUnavailable = true;
  }
}

function formatTimestamp(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString();
}

function getStatusText(value) {
  if (value === undefined || value === null || value === "") {
    return "-";
  }
  return String(value);
}

function getOperationName(item) {
  return item?.operation || item?.operationName || item?.op || "unknown";
}

function applyFilters(items) {
  const operationValue = operationFilter.value;
  const statusValue = statusFilter.value.trim().toLowerCase();
  const idValue = idSearch.value.trim().toLowerCase();

  return items.filter((item) => {
    const operationName = getOperationName(item);
    const matchesOperation =
      operationValue === "all" || operationName === operationValue;
    const statusText = getStatusText(item.status).toLowerCase();
    const matchesStatus = !statusValue || statusText.includes(statusValue);
    const idText = String(item.id || "").toLowerCase();
    const matchesId = !idValue || idText.includes(idValue);
    return matchesOperation && matchesStatus && matchesId;
  });
}

function renderCalls() {
  debugList.innerHTML = "";
  const filtered = applyFilters(calls);

  if (!filtered.length) {
    debugEmpty.classList.remove("is-hidden");
  } else {
    debugEmpty.classList.add("is-hidden");
  }

  filtered.forEach((call) => {
    const item = document.createElement("li");
    item.className = "debug-list-item";
    item.dataset.id = call.id;
    if (call.id === selectedId) {
      item.classList.add("active");
    }

    const title = document.createElement("div");
    title.className = "debug-item-title";

    const idSpan = document.createElement("span");
    idSpan.className = "debug-item-id";
    idSpan.textContent = call.id || "(missing id)";

    const opSpan = document.createElement("span");
    opSpan.className = "debug-item-op";
    opSpan.textContent = getOperationName(call);

    title.appendChild(idSpan);
    title.appendChild(opSpan);

    const meta = document.createElement("div");
    meta.className = "debug-item-meta";

    const statusSpan = document.createElement("span");
    statusSpan.textContent = `Status: ${getStatusText(call.status)}`;

    const latencySpan = document.createElement("span");
    const latencyValue =
      call.latencyMs ?? call.latency ?? call.durationMs ?? call.duration;
    latencySpan.textContent = `Latency: ${
      latencyValue !== undefined && latencyValue !== null ? latencyValue : "-"
    }ms`;

    const timeSpan = document.createElement("span");
    const timestampValue = call.timestamp || call.createdAt || call.time;
    timeSpan.textContent = `Time: ${formatTimestamp(timestampValue)}`;

    meta.appendChild(statusSpan);
    meta.appendChild(latencySpan);
    meta.appendChild(timeSpan);

    item.appendChild(title);
    item.appendChild(meta);

    item.addEventListener("click", () => {
      selectCall(call.id);
    });

    debugList.appendChild(item);
  });
}

function extractExamOutputText(record) {
  if (!record) {
    return "";
  }

  const parsed = record.responseBodyParsed;
  const choiceContent = parsed?.choices?.[0]?.message?.content;
  if (typeof choiceContent === "string" && choiceContent.trim()) {
    return choiceContent.trim();
  }

  const choiceText = parsed?.choices?.[0]?.text;
  if (typeof choiceText === "string" && choiceText.trim()) {
    return choiceText.trim();
  }

  if (typeof parsed === "string" && parsed.trim()) {
    return parsed.trim();
  }

  if (typeof record.responseBodyRaw === "string" && record.responseBodyRaw.trim()) {
    try {
      const rawParsed = JSON.parse(record.responseBodyRaw);
      const rawContent = rawParsed?.choices?.[0]?.message?.content;
      if (typeof rawContent === "string" && rawContent.trim()) {
        return rawContent.trim();
      }
    } catch {
      return record.responseBodyRaw.trim();
    }
  }

  return "";
}

function renderExamOutput(record) {
  if (!debugOutput) {
    return;
  }

  const operationName = getOperationName(record);
  if (operationName !== "exam_generate") {
    setOutputPlaceholder("Select an exam_generate call to view exam output.");
    return;
  }

  const outputText = extractExamOutputText(record);
  if (!outputText) {
    setOutputPlaceholder("No exam output found for this call.");
    return;
  }

  debugOutput.textContent = outputText;
}

function updatePauseButton() {
  pauseBtn.textContent = isPaused ? "Resume" : "Pause";
}

function updateTokenInput() {
  const token = localStorage.getItem(DEBUG_TOKEN_KEY) || "";
  tokenInput.value = token;
}

function saveToken() {
  const token = tokenInput.value.trim();
  localStorage.setItem(DEBUG_TOKEN_KEY, token);
  setError(token ? "" : "Debug token is required to fetch debug data.");
}

async function fetchCalls() {
  if (debugUnavailable || isPaused || isLoadingCalls) {
    return;
  }
  isLoadingCalls = true;
  try {
    const res = await window.debugApiFetch("/__debug/api-calls");
    if (!res.ok) {
      if (res.status === 404) {
        disableDebug(
          "Debug endpoint not available. Run the backend with debug routes enabled."
        );
        return;
      }
      if (res.status === 401 || res.status === 403) {
        setError("Missing or invalid debug token. Please save a valid token.");
      } else {
        setError(`Failed to load debug calls (status ${res.status}).`);
      }
      isLoadingCalls = false;
      return;
    }

    setError("");
    const data = await res.json();
    calls = Array.isArray(data) ? data : data.calls || [];
    renderCalls();

    if (selectedId && !calls.find((call) => call.id === selectedId)) {
      selectedId = null;
      setDetailsPlaceholder("Select a call to view details.");
      setOutputPlaceholder("Select an exam_generate call to view exam output.");
    }
  } catch (err) {
    console.error(err);
    setError("Unable to reach the debug API.");
  } finally {
    isLoadingCalls = false;
  }
}

async function selectCall(id) {
  if (!id) {
    return;
  }
  selectedId = id;
  renderCalls();
  setDetailsPlaceholder("Loading call details...");
  setOutputPlaceholder("Loading exam output...");

  try {
    const res = await window.debugApiFetch(`/__debug/api-calls/${id}`);
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        setError("Missing or invalid debug token. Please save a valid token.");
      } else {
        setError(`Failed to load call details (status ${res.status}).`);
      }
      setDetailsPlaceholder("Unable to load details.");
      return;
    }

    setError("");
    const data = await res.json();
    debugJson.textContent = JSON.stringify(data, null, 2);
    renderExamOutput(data);
  } catch (err) {
    console.error(err);
    setDetailsPlaceholder("Unable to load details.");
    setOutputPlaceholder("Unable to load exam output.");
  }
}

async function clearCalls() {
  try {
    const res = await window.debugApiFetch("/__debug/api-calls", {
      method: "DELETE",
    });
    if (!res.ok) {
      setError(`Failed to clear calls (status ${res.status}).`);
      return;
    }
    setError("");
    calls = [];
    renderCalls();
    selectedId = null;
    setDetailsPlaceholder("Select a call to view details.");
    setOutputPlaceholder("Select an exam_generate call to view exam output.");
  } catch (err) {
    console.error(err);
    setError("Unable to clear calls.");
  }
}

function startPolling() {
  if (pollHandle) {
    clearInterval(pollHandle);
  }
  pollHandle = setInterval(fetchCalls, POLL_INTERVAL_MS);
}

function init() {
  const isEnabled =
    typeof window.isDebugRouteEnabled === "function"
      ? window.isDebugRouteEnabled()
      : true;

  if (!isEnabled) {
    debugPage.classList.add("is-hidden");
    debugDisabled.classList.remove("is-hidden");
    debugDisabled.textContent =
      "Debug routes are disabled. Set ENABLE_DEBUG_ROUTES=true to enable.";
    return;
  }

  updateTokenInput();
  if (!tokenInput.value) {
    setError("Debug token is required to fetch debug data.");
  }

  setDetailsPlaceholder("Select a call to view details.");
  setOutputPlaceholder("Select an exam_generate call to view exam output.");
  updatePauseButton();

  fetchCalls();
  startPolling();
}

saveTokenBtn.addEventListener("click", () => {
  saveToken();
  fetchCalls();
});

pauseBtn.addEventListener("click", () => {
  isPaused = !isPaused;
  updatePauseButton();
});

clearBtn.addEventListener("click", clearCalls);

copyJsonBtn.addEventListener("click", async () => {
  const text = debugJson.textContent.trim();
  if (!text) {
    setError("Nothing to copy yet.");
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    console.error(err);
    setError("Copy failed. Please try again.");
  }
});

operationFilter.addEventListener("change", renderCalls);
statusFilter.addEventListener("input", renderCalls);
idSearch.addEventListener("input", renderCalls);

init();
