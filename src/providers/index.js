const { AppError } = require("../middleware/errorHandler");
const mockProvider = require("./mockProvider");
const openaiProvider = require("./openaiProvider");
const providers = {
  mock: mockProvider,
  openai: openaiProvider,
};

const getProvider = () => {
  const providerName = (process.env.SUMMARIZER_PROVIDER || "mock").toLowerCase();
  const provider = providers[providerName];

  if (!provider) {
    throw new AppError(
      `SUMMARIZER_PROVIDER must be one of: ${Object.keys(providers).join(", ")}.`,
      400,
      "CONFIG_ERROR"
    );
  }

  return provider;
};

module.exports = {
  getProvider,
};
