import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
import { getRuntimeErrorOverlay, getCartographerPlugin, getDevBannerPlugin } from "./vite-plugins";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Helper function to load development plugins conditionally
async function loadDevPlugins() {
  if (process.env.NODE_ENV === "production" || process.env.DEV_ENV_ID === undefined) {
    return [];
  }
  
  try {
    const [cartographerPlugin, devBannerPlugin] = await Promise.all([
      getCartographerPlugin(),
      getDevBannerPlugin(),
    ]);
    
    return [
      cartographerPlugin(),
      devBannerPlugin(),
    ];
  } catch (error) {
    console.warn("Failed to load development plugins:", error);
    return [];
  }
}

export default defineConfig(async () => {
  const devPlugins = await loadDevPlugins();
  const runtimeErrorOverlay = await getRuntimeErrorOverlay();
  
  return {
    plugins: [
      react(),
      runtimeErrorOverlay(),
      ...devPlugins,
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "client", "src"),
        "@shared": path.resolve(__dirname, "shared"),
        "@assets": path.resolve(__dirname, "attached_assets"),
      },
    },
    root: path.resolve(__dirname, "client"),
    build: {
      outDir: path.resolve(__dirname, "dist/public"),
      emptyOutDir: true,
    },
    server: {
      fs: {
        strict: true,
        deny: ["**/.*"],
      },
      middlewareMode: true,
      hmr: false,
    },
  };
});
