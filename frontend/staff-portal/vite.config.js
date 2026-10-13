import { defineConfig } from "vite";
export default defineConfig(({ mode }) => ({
  // GitHub Pages serves the demo under /<repo>/; local and Docker builds keep "/".
  base: process.env.VITE_BASE || "/",
  server: { proxy: { "/api": "http://127.0.0.1:8000" } },
  build: { sourcemap: false },
  ...(mode === "test"
    ? { define: { "import.meta.env.VITE_DEMO_MODE": '"true"' } }
    : {}),
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.jsx", "tests/**/*.test.js"],
    testTimeout: 15000,
  },
}));
