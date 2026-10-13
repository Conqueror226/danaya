import React, { useState } from "react";
import { ChevronLeft, ArrowRight, ShieldCheck } from "lucide-react";
import { Brand, Badge, Field } from "./components";
import { api, DEMO } from "./api";
import { roleNames } from "./demo";
export default function Login({ onLogin, onBack }) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [role, setRole] = useState("doctor"),
    [receiving, setReceiving] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="login-page">
      <div className="login-story">
        <Brand light />
        <div>
          <p className="eyebrow">UN ESPACE POUR PRENDRE SOIN</p>
          <h1>
            Votre équipe.
            <br />
            Vos patients.
            <br />
            <em>Le même lien.</em>
          </h1>
          <p>
            Retrouvez les informations et les outils utiles à votre journée,
            dans un espace commun.
          </p>
        </div>
        <small>Danaya ka kɛnɛya — La santé, en confiance.</small>
      </div>
      <main className="login-main">
        <button className="text-link" disabled={busy} onClick={onBack}>
          <ChevronLeft size={16} /> Retour à l’accueil
        </button>
        <div className="login-form">
          <Badge tone="green">ESPACE PROFESSIONNEL</Badge>
          <h2>
            {DEMO ? "Bienvenue dans Danaya." : "Heureux de vous retrouver."}
          </h2>
          <p>
            {DEMO
              ? "Explorez les parcours avec des données entièrement fictives."
              : "Connectez-vous avec le compte créé par votre établissement."}
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              setBusy(true);
              setError("");
              try {
                onLogin(
                  await api("/auth/login", {
                    method: "POST",
                    body: DEMO ? { role, receiving } : { email, password },
                  }),
                );
              } catch (err) {
                setError(err.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {DEMO ? (
              <>
                <Field label="Explorer en tant que">
                  <select
                    value={role}
                    onChange={(e) => {
                      setRole(e.target.value);
                      setReceiving(false);
                    }}
                  >
                    {Object.entries(roleNames).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                {role === "doctor" && (
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={receiving}
                      onChange={(e) => setReceiving(e.target.checked)}
                    />{" "}
                    Établissement destinataire (Bobo)
                  </label>
                )}
                <div className="notice">
                  Cet aperçu ne sauvegarde rien après rechargement. N’y
                  saisissez aucune donnée personnelle réelle.
                </div>
              </>
            ) : (
              <>
                <Field
                  label="Adresse e-mail professionnelle"
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <Field
                  label="Mot de passe"
                  type="password"
                  required
                  maxLength={256}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="button full" disabled={busy}>
              {busy
                ? "Connexion…"
                : DEMO
                  ? "Ouvrir la démonstration"
                  : "Se connecter"}
              <ArrowRight size={17} />
            </button>
          </form>
          <p className="login-help">
            <ShieldCheck size={17} />
            {DEMO
              ? "Aperçu pilote · Aucun service médical réel"
              : "Besoin d’un accès ? Contactez votre administrateur local."}
          </p>
        </div>
      </main>
    </div>
  );
}
