const inputText = document.getElementById("inputText");
const outputBox = document.getElementById("outputBox");
const countBadge = document.getElementById("countBadge");
const statusPill = document.getElementById("statusPill");

const summarizeBtn = document.getElementById("summarizeBtn");
const copyBtn = document.getElementById("copyBtn");
const clearBtn = document.getElementById("clearBtn");
const pasteBtn = document.getElementById("pasteBtn");
const downloadBtn = document.getElementById("downloadBtn");

const lengthSelect = document.getElementById("lengthSelect");
const formatSelect = document.getElementById("formatSelect");

let latestSummary = "";

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.classList.add("show"), 50);
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 250);
  }, 1600);
}

function escapeHTML(str) {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setStatus(text, type = "ready") {
  statusPill.textContent = text;

  if (type === "loading") {
    statusPill.style.background = "#FEF3C7";
    statusPill.style.borderColor = "#FDE68A";
    statusPill.style.color = "#92400E";
  } else if (type === "done") {
    statusPill.style.background = "#D1FAE5";
    statusPill.style.borderColor = "#A7F3D0";
    statusPill.style.color = "#065F46";
  } else if (type === "error") {
    statusPill.style.background = "#FEE2E2";
    statusPill.style.borderColor = "#FECACA";
    statusPill.style.color = "#991B1B";
  } else {
    statusPill.style.background = "#EEF2FF";
    statusPill.style.borderColor = "#E0E7FF";
    statusPill.style.color = "#1E3A8A";
  }
}

function setOutput(html) {
  outputBox.innerHTML = html;
}

function setLoading(isLoading) {
  if (isLoading) {
    summarizeBtn.disabled = true;
    summarizeBtn.textContent = "Summarizing...";
    setStatus("Summarizing...", "loading");

    setOutput(`
      <div class="loading">
        <div class="spinner"></div>
        <p>Generating summary…</p>
      </div>
    `);
  } else {
    summarizeBtn.disabled = false;
    summarizeBtn.textContent = "Summarize";
  }
}

function updateCounts() {
  const raw = inputText.value;
  const trimmed = raw.trim();
  const words = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
  const chars = raw.length;
  countBadge.textContent = `${words} words • ${chars} chars`;
}

inputText.addEventListener("input", updateCounts);
updateCounts();

function fakeSummarize(text, length) {
  const cleaned = text.trim().replace(/\s+/g, " ");
  let limit = 260;
  if (length === "short") limit = 160;
  if (length === "detailed") limit = 460;

  if (cleaned.length <= limit) return cleaned;
  return cleaned.slice(0, limit) + "...";
}

function toBullets(summary) {
  const parts = summary
    .replace(/\.\.\.$/, ".")
    .split(/[.!?]\s+/)
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 6);

  if (parts.length === 0) return ["Could not split into bullets."];
  return parts.map(s => (s.endsWith(".") ? s : s + "."));
}

function runSummarize() {
  const text = inputText.value.trim();
  if (!text) {
    setStatus("Empty input", "error");
    showToast("Paste text first.");
    inputText.focus();
    return;
  }

  const length = lengthSelect.value;
  const format = formatSelect.value;

  setLoading(true);

  setTimeout(() => {
    const summary = fakeSummarize(text, length);
    latestSummary = summary;

    setLoading(false);
    setStatus("Done", "done");

    if (format === "bullets") {
      const bullets = toBullets(summary);
      setOutput(`
        <ul class="bullet-list">
          ${bullets.map(b => `<li>${escapeHTML(b)}</li>`).join("")}
        </ul>
      `);
    } else {
      setOutput(`<p class="summary-text">${escapeHTML(summary)}</p>`);
    }

    showToast("Summary ready!");
  }, 800);
}

summarizeBtn.addEventListener("click", runSummarize);

document.addEventListener("keydown", (e) => {
  const isCmdEnter = (e.metaKey || e.ctrlKey) && e.key === "Enter";
  if (isCmdEnter) runSummarize();
});

copyBtn.addEventListener("click", async () => {
  const visibleText = outputBox.innerText.trim();
  if (!visibleText || visibleText.includes("Generate a summary")) {
    showToast("Nothing to copy yet.");
    return;
  }

  try {
    await navigator.clipboard.writeText(visibleText);
    showToast("Copied ✅");
  } catch {
    showToast("Copy failed.");
  }
});

clearBtn.addEventListener("click", () => {
  inputText.value = "";
  latestSummary = "";
  updateCounts();
  setStatus("Ready", "ready");
  setOutput(`<p class="placeholder">Generate a summary to see it here.</p>`);
  showToast("Cleared ✨");
});

pasteBtn.addEventListener("click", async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (!text) {
      showToast("Clipboard is empty.");
      return;
    }
    inputText.value = text;
    updateCounts();
    showToast("Pasted 📋");
  } catch {
    showToast("Clipboard access denied.");
  }
});

downloadBtn.addEventListener("click", () => {
  if (!latestSummary) {
    showToast("No summary to download.");
    return;
  }

  const blob = new Blob([latestSummary], { type: "text/plain" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "summary.txt";
  document.body.appendChild(a);
  a.click();

  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast("Downloaded 📄");
});

setStatus("Ready", "ready");


