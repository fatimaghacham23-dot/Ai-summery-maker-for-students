import { requestJson } from "./api.js";
import { showToast } from "./ui.js";

const summaryView = document.querySelector(".summary-view");
const summaryForm = document.getElementById("summaryForm");
const summaryText = document.getElementById("summaryText");
const summaryLength = document.getElementById("summaryLength");
const summaryFormat = document.getElementById("summaryFormat");
const summaryCounter = document.getElementById("summaryCounter");
const summaryStatus = document.getElementById("summaryStatus");
const summaryPreview = document.getElementById("summaryPreview");
const summaryOutput = document.getElementById("summaryOutput");
const summaryError = document.getElementById("summaryError");
const summaryValidation = document.getElementById("summaryValidation");
const previewStatus = document.getElementById("previewStatus");

let summaryPayload = null;

const getWordCount = (text = "") => {
  if (!text.trim()) {
    return 0;
  }
  return text.trim().split(/\s+/).length;
};

const updateCounter = () => {
  if (!summaryCounter || !summaryText) return;
  const text = summaryText.value || "";
  summaryCounter.textContent = `${getWordCount(text)} words - ${text.length} chars`;
};

const setStatus = (text, statusClass = "online") => {
  if (!summaryStatus) return;
  summaryStatus.textContent = text;
  summaryStatus.className = `status-chip ${statusClass}`;
};

const renderPlaceholder = () => {
  if (summaryError) summaryError.hidden = true;
  if (summaryValidation) summaryValidation.textContent = "";
  if (previewStatus) previewStatus.textContent = "Waiting for generation";
  if (summaryOutput) {
    summaryOutput.innerHTML = `<p class="placeholder">Start with a summary request to see results here.</p>`;
  }
  summaryPreview?.classList.remove("loading");
};

const setPreviewLoading = () => {
  if (summaryError) summaryError.hidden = true;
  if (previewStatus) previewStatus.textContent = "Generating summary";
  summaryPreview?.classList.add("loading");
  if (summaryOutput) {
    summaryOutput.innerHTML = `
      <div class="loading-placeholder">
        <span></span>
        <span></span>
        <span></span>
      </div>
    `;
  }
};

const renderSummary = (summary) => {
  if (!summaryOutput) return;
  if (summaryError) summaryError.hidden = true;
  summaryValidation?.setAttribute("aria-hidden", "true");
  summaryOutput.innerHTML = "";

  if (Array.isArray(summary)) {
    const list = document.createElement("ul");
    list.className = "summary-list";
    summary.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      list.appendChild(li);
    });
    summaryOutput.appendChild(list);
    return;
  }

  const paragraph = document.createElement("p");
  paragraph.className = "summary-text";
  paragraph.textContent = summary;
  summaryOutput.appendChild(paragraph);
};

const handleError = (message) => {
  if (summaryError) {
    summaryError.hidden = false;
    summaryError.textContent = message;
  }
  if (summaryValidation) {
    summaryValidation.textContent = message;
    summaryValidation.setAttribute("aria-hidden", "false");
  }
  setStatus("Error", "offline");
  previewStatus && (previewStatus.textContent = "Issue generating summary");
  showToast(message, "error");
};

const handlePaste = async () => {
  if (!summaryText) return;
  try {
    const text = await navigator.clipboard.readText();
    summaryText.value = text;
    updateCounter();
    setStatus("Ready");
  } catch (error) {
    console.error(error);
    showToast("Unable to access clipboard", "error");
  }
};

const handleCopy = async () => {
  if (!summaryPayload) {
    showToast("Nothing to copy", "error");
    return;
  }
  try {
    await navigator.clipboard.writeText(
      Array.isArray(summaryPayload) ? summaryPayload.join("\n") : summaryPayload
    );
    showToast("Copied summary", "success");
  } catch (error) {
    console.error(error);
    showToast("Copy failed", "error");
  }
};

const handleDownload = () => {
  if (!summaryPayload) {
    showToast("Nothing to download", "error");
    return;
  }
  const content = Array.isArray(summaryPayload) ? summaryPayload.join("\n") : summaryPayload;
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "summary.txt";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("Summary downloaded", "success");
};

const generateSummary = async () => {
  if (!summaryText) return;
  const text = summaryText.value.trim();
  if (!text) {
    handleError("Paste your study text first");
    summaryText.focus();
    return;
  }
  setStatus("Summarizing...");
  setPreviewLoading();

  try {
    const data = await requestJson("/api/summarize", {
      method: "POST",
      body: JSON.stringify({
        text,
        length: summaryLength.value,
        format: summaryFormat.value,
      }),
    });
    summaryPayload = data.summary;
    renderSummary(summaryPayload);
    setStatus("Ready", "online");
    previewStatus?.textContent = "Summary generated";
    showToast("Summary ready", "success");
  } catch (error) {
    console.error(error);
    handleError(error.message || "Failed to summarize");
  } finally {
    summaryPreview?.classList.remove("loading");
  }
};

const handleAction = async (action) => {
  switch (action) {
    case "summarize":
      await generateSummary();
      break;
    case "paste":
      await handlePaste();
      break;
    case "clear":
      if (summaryText) summaryText.value = "";
      summaryPayload = null;
      updateCounter();
      renderPlaceholder();
      setStatus("Ready");
      break;
    case "copy":
      await handleCopy();
      break;
    case "download":
      handleDownload();
      break;
    default:
      break;
  }
};

const bindSummaryActions = () => {
  const buttons = summaryView?.querySelectorAll("[data-action]") || [];
  buttons.forEach((button) => {
    button.addEventListener("click", () => handleAction(button.dataset.action));
  });
};

const initSummaryFlow = () => {
  updateCounter();
  setStatus("Ready", "online");
  renderPlaceholder();
  summaryText?.addEventListener("input", updateCounter);
  bindSummaryActions();
};

export { initSummaryFlow };
