import React from "react";
import { test, expect, vi, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

const delayed = vi.hoisted(() => ({ resolve: null }));
vi.mock("./api", async () => {
  const { createDemoApi } = await import("./demo");
  const demo = createDemoApi();
  return {
    DEMO: true,
    api: (path, options) =>
      path.startsWith("/patients/")
        ? new Promise((resolve) => {
            delayed.resolve = resolve;
          })
        : demo(path, options),
  };
});
afterEach(cleanup);

test("a delayed patient response cannot populate the next staff session", async () => {
  window.scrollTo = vi.fn();
  const user = userEvent.setup();
  render(<App />);
  await user.click(
    screen.getByRole("button", { name: "Explorer la plateforme" }),
  );
  await user.click(
    screen.getByRole("button", { name: "Ouvrir la démonstration" }),
  );
  await screen.findByText("Bonjour, prenons soin ensemble.");
  await user.click(
    screen.getByRole("button", { name: "Patients", exact: true }),
  );
  await screen.findByText("Awa Exemple");
  await user.click(
    screen.getAllByRole("button", { name: "Ouvrir", exact: true })[0],
  );
  expect(delayed.resolve).toBeTypeOf("function");
  act(() => window.dispatchEvent(new Event("danaya-session-expired")));
  await user.selectOptions(
    screen.getByLabelText("Explorer en tant que"),
    "pharmacist",
  );
  await user.click(
    screen.getByRole("button", { name: "Ouvrir la démonstration" }),
  );
  await screen.findByText("Bonjour, prenons soin ensemble.");
  await user.click(
    screen.getByRole("button", { name: "Patients", exact: true }),
  );
  await act(async () =>
    delayed.resolve({
      id: "old-patient",
      first_name: "SENSITIVE",
      last_name: "PREVIOUS SESSION",
      phone: "private-number",
    }),
  );
  expect(screen.queryByText("SENSITIVE PREVIOUS SESSION")).toBeNull();
  expect(screen.queryByText("private-number")).toBeNull();
});
