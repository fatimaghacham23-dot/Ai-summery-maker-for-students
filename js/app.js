// =======================
// DOM ELEMENTS
// =======================
const inputText = document.getElementById("inputText");
const output = document.getElementById("output");
const summarizeBtn = document.getElementById("summarizeBtn");
const clearBtn = document.getElementById("clearBtn");
const lengthSelect = document.getElementById("lengthSelect");
const formatSelect = document.getElementById("formatSelect");
const statusText = document.getElementById("status");

// =======================
// STATE
// =======================
let latestSummary = "";

// =======================
// HELPERS
// =======================
function setLoading(isLoading) {
  summarizeBtn.disabled = isLoading;
  summarizeBtn.textContent = isLoading ? "Summarizing..." : "Summarize";
}

function setStatus(text, type = "idle") {
  statusText.textContent = text;
  statusText.className = `status ${type}`;
}

function setOutput(html) {
  output.innerHTML = html;
}

function escapeHTML(str) {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function showToast(msg) {
  alert(msg); // simple + reliable
}

// =======================
// MAIN ACTION
// =======================
async function runSummarize() {
  const text = inputText.value.trim();
  const length = lengthSelect.value;
  const format = formatSelect.value;

  if (!text) {
    setStatus("Empty input", "error");
    showToast("Please paste text first");
    inputText.focus();
    return;
  }

  setLoading(true);
  setStatus("Processing...", "loading");

  try {
    const res = await fetch("http://localhost:3000/api/summarize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text,
        length,
        format
      })
    });

    if (!res.ok) {
      throw new Error("Backend error");
    }

    const data = await res.json();

    latestSummary = data.summary;

    if (Array.isArray(latestSummary)) {
      setOutput(`
        <ul class="bullet-list">
          ${latestSummary.map(item => `<li>${escapeHTML(item)}</li>`).join("")}
        </ul>
      `);
    } else {
      setOutput(`<p class="summary-text">${escapeHTML(latestSummary)}</p>`);
    }

    setStatus("Done", "done");
    showToast("Summary ready ✅");
  } catch (err) {
    console.error(err);
    setStatus("Error", "error");
    setOutput("<p>Failed to generate summary.</p>");
    showToast("API error ❌");
  } finally {
    setLoading(false);
  }
}

// =======================
// CLEAR
// =======================
function clearAll() {
  inputText.value = "";
  setOutput("");
  setStatus("Idle");
}

// =======================
// EVENTS
// =======================
summarizeBtn.addEventListener("click", runSummarize);
clearBtn.addEventListener("click", clearAll);