// No automatic retries: an interrupted write may already have committed.
export const UNCERTAIN_WRITE =
  "Résultat non confirmé : l’enregistrement a peut-être abouti. Fermez ce formulaire et actualisez la liste pour vérifier avant de saisir à nouveau.";

export async function request(path, options = {}) {
  const method = options.method || "GET";
  const mutation = !["GET", "HEAD"].includes(method);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  const unavailable = () =>
    Object.assign(
      new Error(
        mutation
          ? UNCERTAIN_WRITE
          : "Connexion indisponible. Actualisez lorsque la connexion est rétablie.",
      ),
      { uncertain: mutation },
    );
  try {
    let response;
    try {
      response = await fetch(`/api${path}`, {
        method,
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-Danaya-Request": "1",
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
        signal: controller.signal,
        cache: "no-store",
      });
    } catch {
      throw unavailable();
    }
    if (
      response.status === 401 &&
      !["/auth/login", "/auth/me"].includes(path)
    ) {
      window.dispatchEvent(new Event("danaya-session-expired"));
    }
    if (response.status === 204 && path === "/auth/logout") return null;
    if (response.status >= 500 || response.status === 408) throw unavailable();
    let data;
    try {
      if (!response.headers.get("content-type")?.includes("application/json"))
        throw new Error();
      data = await response.json();
      if (!data || typeof data !== "object") throw new Error();
    } catch {
      throw unavailable();
    }
    if (!response.ok) {
      throw new Error(
        typeof data.detail === "string"
          ? data.detail
          : response.status === 422
            ? "Vérifiez les champs du formulaire."
            : "Le service a refusé cette demande. Veuillez actualiser.",
      );
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}
