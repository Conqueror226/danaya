import { afterEach, expect, test, vi } from "vitest";
import { request, UNCERTAIN_WRITE } from "../src/transport";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
test("a lost write response is uncertain and never automatically retried", async () => {
  const fetch = vi.fn().mockRejectedValue(new TypeError("network lost"));
  vi.stubGlobal("fetch", fetch);
  await expect(
    request("/records", { method: "POST", body: { kind: "note" } }),
  ).rejects.toMatchObject({ message: UNCERTAIN_WRITE, uncertain: true });
  expect(fetch).toHaveBeenCalledOnce();
});
test("HTML fallback and gateway failure cannot become a confirmed save", async () => {
  for (const response of [
    new Response("<html>wrong proxy</html>", { status: 200 }),
    new Response("gateway timeout", { status: 504 }),
    new Response('{"id":', {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }),
  ]) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    await expect(
      request("/patients", { method: "POST" }),
    ).rejects.toMatchObject({ uncertain: true });
  }
});
test("known validation errors permit correction, and reads do not imply a write", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "Champs invalides" }), {
        status: 422,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
  await expect(request("/patients", { method: "POST" })).rejects.toThrow(
    "Champs invalides",
  );
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
  await expect(request("/patients")).rejects.toMatchObject({
    uncertain: false,
  });
});
test("expired session is cleared even if a proxy returns a non-JSON error", async () => {
  const listener = vi.fn();
  window.addEventListener("danaya-session-expired", listener);
  try {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("unauthorized", { status: 401 })),
    );
    await expect(request("/patients")).rejects.toThrow();
    expect(listener).toHaveBeenCalledOnce();
  } finally {
    window.removeEventListener("danaya-session-expired", listener);
  }
});
test("a stalled request times out instead of leaving the form pending forever", async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    ),
  );
  const result = expect(
    request("/records", { method: "POST" }),
  ).rejects.toMatchObject({ uncertain: true });
  await vi.advanceTimersByTimeAsync(30000);
  await result;
});
test("confirmed responses preserve data and same-origin session settings", async () => {
  const fetch = vi.fn().mockResolvedValue(
    new Response('{"id":"created"}', {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetch);
  await expect(
    request("/patients", { method: "POST", body: { first_name: "Fiction" } }),
  ).resolves.toEqual({ id: "created" });
  expect(fetch.mock.calls[0][1]).toMatchObject({
    credentials: "same-origin",
    cache: "no-store",
  });
});
