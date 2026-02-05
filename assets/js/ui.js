const toastPortal = document.getElementById("toastPortal") || (() => {
  const wrapper = document.createElement("div");
  wrapper.className = "toast-wrapper";
  document.body.appendChild(wrapper);
  return wrapper;
})();

const VARIANT_CLASSES = {
  neutral: "",
  success: "toast--success",
  error: "toast--error",
};

const showToast = (message, variant = "neutral") => {
  if (!message || !toastPortal) {
    return;
  }
  const toast = document.createElement("div");
  toast.className = `toast ${VARIANT_CLASSES[variant] || ""}`.trim();
  toast.textContent = message;
  toastPortal.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add("show"));

  const settle = () => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 250);
  };

  setTimeout(settle, 2600);
};

export { showToast };
