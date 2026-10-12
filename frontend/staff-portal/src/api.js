import { createDemoApi } from "./demo";
export const DEMO = import.meta.env.VITE_DEMO_MODE === "true";
const demo = DEMO ? createDemoApi() : null;
export async function api(path, options = {}) {
  if (demo) return demo(path, options);
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method: options.method || "GET",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-Danaya-Request": "1" },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch {
    throw new Error(
      "Connexion indisponible. Rien n’a été confirmé. Vérifiez la connexion avant de réessayer.",
    );
  }
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (
      response.status === 401 &&
      path !== "/auth/login" &&
      path !== "/auth/me"
    )
      window.dispatchEvent(new Event("danaya-session-expired"));
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : response.status === 422
          ? "Vérifiez les champs du formulaire."
          : "Le service est indisponible. Veuillez réessayer.",
    );
  }
  return data;
}
