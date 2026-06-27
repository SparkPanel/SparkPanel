export async function getRuntimeErrorOverlay() {
  return () => ({ name: "noop-runtime-error-overlay" });
}

export async function getCartographerPlugin() {
  return () => ({ name: "noop-cartographer" });
}

export async function getDevBannerPlugin() {
  return () => ({ name: "noop-dev-banner" });
}
