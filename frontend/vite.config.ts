import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env["VITE_API_PROXY_TARGET"] || "https://haqi-api.onrender.com";

  return {
    server: {
      host: "::",
      port: 8080,
      // Dev calls /api/* on this origin; the proxy forwards to the API and
      // strips the prefix. This sidesteps CORS entirely in local development.
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
      },
    },
    resolve: {
      tsconfigPaths: true,
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
    },
    plugins: [viteReact(), tailwindcss()],
  };
});
