const { createSummaryText, formatSummary } = require("../utils/summary");

const summarize = async ({ text, length, format }) => {
  const summaryText = createSummaryText({ text, length });
  return formatSummary({ summaryText, format });
};

module.exports = {
  summarize,
};
