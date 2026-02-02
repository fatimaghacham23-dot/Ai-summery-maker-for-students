const dataSourcesList = document.getElementById("dataSourcesList");

const renderSources = (sources) => {
  if (!dataSourcesList) {
    return;
  }
  if (!sources || !sources.length) {
    dataSourcesList.innerHTML = "<li>No sources available yet.</li>";
    return;
  }
  dataSourcesList.innerHTML = sources
    .map((source) => `<li>${source.source} (${source.license})</li>`)
    .join("");
};

const loadSources = async () => {
  if (!dataSourcesList) {
    return;
  }
  try {
    const response = await fetch("/api/knowledge/sources");
    if (!response.ok) {
      renderSources([]);
      return;
    }
    const payload = await response.json();
    renderSources(payload.sources || []);
  } catch (err) {
    renderSources([]);
  }
};

loadSources();
