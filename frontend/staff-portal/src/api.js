import { createDemoApi } from "./demo";
import { request } from "./transport";
export const DEMO = import.meta.env.VITE_DEMO_MODE === "true";
const demo = DEMO ? createDemoApi() : null;
export async function api(path, options = {}) {
  if (demo) return demo(path, options);
  return request(path, options);
}
