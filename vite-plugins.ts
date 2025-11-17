// Development plugin wrappers
export async function getRuntimeErrorOverlay() {
  const module = await import("@replit/vite-plugin-runtime-error-modal");
  return module.default;
}

export async function getCartographerPlugin() {
  const module = await import("@replit/vite-plugin-cartographer");
  return module.cartographer;
}

export async function getDevBannerPlugin() {
  const module = await import("@replit/vite-plugin-dev-banner");
  return module.devBanner;
}

