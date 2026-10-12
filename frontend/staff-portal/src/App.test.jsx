import React from "react";
import { test, expect, vi, beforeAll, afterEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  cleanup,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  window.scrollTo = vi.fn();
});
afterEach(cleanup);

test("French landing, demo login, patient registration, search, detail, edit and logout", async () => {
  const user = userEvent.setup();
  render(<App />);
  expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(
    "Bien soigner",
  );
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
  await user.click(screen.getByRole("button", { name: "Nouveau patient" }));
  const dialog = screen.getByRole("dialog");
  await user.type(within(dialog).getByLabelText("Prénom"), "Testy");
  await user.type(
    within(dialog).getByLabelText("Nom", { exact: true }),
    "Nouvelle",
  );
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await user.type(
    screen.getByRole("textbox", { name: "Rechercher un patient" }),
    "Testy",
  );
  await waitFor(() => expect(screen.queryByText("Awa Exemple")).toBeNull());
  expect(screen.getByText("Testy Nouvelle")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Ouvrir", exact: true }));
  await user.click(
    await screen.findByRole("button", { name: "Modifier l’identité" }),
  );
  await user.clear(screen.getByLabelText("Prénom"));
  await user.type(screen.getByLabelText("Prénom"), "TestyUpdated");
  await user.click(screen.getByRole("button", { name: "Enregistrer" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await screen.findByRole("heading", { name: "TestyUpdated Nouvelle" });
  await user.click(screen.getByRole("button", { name: "Se déconnecter" }));
  await screen.findByRole("button", { name: "Ouvrir la démonstration" });
  expect(screen.queryByText("TestyUpdated Nouvelle")).toBeNull();
});

test("pharmacist navigation limits and simulated dispense confirmation", async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(
    screen.getByRole("button", { name: "Explorer la plateforme" }),
  );
  await user.selectOptions(
    screen.getByLabelText("Explorer en tant que"),
    "pharmacist",
  );
  await user.click(
    screen.getByRole("button", { name: "Ouvrir la démonstration" }),
  );
  await screen.findByText("Bonjour, prenons soin ensemble.");
  expect(
    screen.queryByRole("button", { name: "Laboratoire", exact: true }),
  ).toBeNull();
  expect(screen.queryByRole("button", { name: "Journal d’audit" })).toBeNull();
  await user.click(
    screen.getByRole("button", { name: "Pharmacie", exact: true }),
  );
  await user.click(
    await screen.findByRole("button", { name: "Confirmer la délivrance" }),
  );
  await user.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Confirmer",
      exact: true,
    }),
  );
  await screen.findByText("Délivré");
  expect(
    screen.queryByRole("button", { name: "Confirmer la délivrance" }),
  ).toBeNull();
});
