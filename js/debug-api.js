(function () {
  const CONFIG_META_KEYS = {
    apiBaseUrl: "api-base-url",
    nodeEnv: "node-env",
    enableDebugRoutes: "enable-debug-routes",
  };

  function getMetaContent(name) {
    const meta = document.querySelector(`meta[name="${name}"]`);
    return meta ? meta.getAttribute("content") : "";
  }

  function getAppConfig() {
    return window.APP_CONFIG || window.__APP_CONFIG__ || {};
  }

  function getApiBaseUrl() {
    const config = getAppConfig();
    return (
      config.BASE_API_URL ||
      config.baseApiUrl ||
      getMetaContent(CONFIG_META_KEYS.apiBaseUrl) ||
      ""
    );
  }

  function isDebugRouteEnabled() {
    const config = getAppConfig();
    const nodeEnv =
      config.NODE_ENV ||
      config.nodeEnv ||
      getMetaContent(CONFIG_META_KEYS.nodeEnv) ||
      "development";
    const enableDebugRoutes =
      String(
        config.ENABLE_DEBUG_ROUTES ||
          config.enableDebugRoutes ||
          getMetaContent(CONFIG_META_KEYS.enableDebugRoutes) ||
          ""
      ).toLowerCase() === "true";
    return nodeEnv !== "production" || enableDebugRoutes;
  }

  function getDebugToken() {
    return localStorage.getItem("debug_token") || "";
  }

  async function debugApiFetch(path, options = {}) {
    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}${path}`;
    const headers = new Headers(options.headers || {});
    const token = getDebugToken();
    if (token) {
      headers.set("x-debug-token", token);
    }

    return fetch(url, {
      ...options,
      headers,
    });
  }

  window.debugApiFetch = debugApiFetch;
  window.isDebugRouteEnabled = isDebugRouteEnabled;
  window.getApiBaseUrl = getApiBaseUrl;
  window.getDebugToken = getDebugToken;
})();