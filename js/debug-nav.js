(function () {
  const debugLinks = document.querySelectorAll("[data-debug-link]");
  if (!debugLinks.length) {
    return;
  }

  const isEnabled =
    typeof window.isDebugRouteEnabled === "function"
      ? window.isDebugRouteEnabled()
      : true;

  debugLinks.forEach((link) => {
    if (isEnabled) {
      link.classList.remove("is-hidden");
    } else {
      link.classList.add("is-hidden");
    }
  });
})();