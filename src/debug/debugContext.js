const { AsyncLocalStorage } = require("async_hooks");

const storage = new AsyncLocalStorage();

const runWithDebugContext = (context, fn) => storage.run(context, fn);

const getDebugContext = () => storage.getStore() || null;

module.exports = {
  runWithDebugContext,
  getDebugContext,
};
