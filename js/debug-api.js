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

  function isLocalhost(hostname) {
    return hostname === "localhost" || hostname === "127.0.0.1";
  }

  function getNodeEnv() {
    const config = getAppConfig();
    const fromConfig =
      config.NODE_ENV ||
      config.nodeEnv ||
      getMetaContent(CONFIG_META_KEYS.nodeEnv);

    if (fromConfig) {
      return String(fromConfig).toLowerCase();
    }

    return isLocalhost(window.location.hostname) ? "development" : "production";
  }

  function getApiBaseUrl() {
    const config = getAppConfig();
    const baseUrl =
      config.BASE_API_URL ||
      config.baseApiUrl ||
      getMetaContent(CONFIG_META_KEYS.apiBaseUrl) ||
      "";

    if (!baseUrl && isLocalhost(window.location.hostname)) {
      if (window.location.port && window.location.port !== "3000") {
        return "http://localhost:3000";
      }
    }

    return baseUrl;
  }

  function isDebugRouteEnabled() {
    const config = getAppConfig();
    const nodeEnv = getNodeEnv();
    const enableDebugRoutes =
      String(
        config.ENABLE_DEBUG_ROUTES ||
          config.enableDebugRoutes ||
          getMetaContent(CONFIG_META_KEYS.enableDebugRoutes) ||
          ""
      ).toLowerCase() === "true";

    if (nodeEnv === "production") {
      return false;
    }

    return enableDebugRoutes || nodeEnv !== "production";
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
      credentials: "include",
      ...options,
      headers,
    });
  }

  window.debugApiFetch = debugApiFetch;
  window.isDebugRouteEnabled = isDebugRouteEnabled;
  window.getApiBaseUrl = getApiBaseUrl;
  window.getDebugToken = getDebugToken;
})();
