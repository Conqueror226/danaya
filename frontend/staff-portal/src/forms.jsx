import React, { useState, useEffect } from "react";
import { Field, Pagination } from "./components";
import { api } from "./api";
function Form({ children, onSubmit, submit = "Enregistrer", onClose }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        const body = Object.fromEntries(new FormData(e.currentTarget));
        setBusy(true);
        setError("");
        try {
          await onSubmit(body);
          onClose();
        } catch (err) {
          setError(err.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button
          type="button"
          className="button ghost"
          disabled={busy}
          onClick={onClose}
        >
          Annuler
        </button>
        <button className="button" disabled={busy}>
          {busy ? "Enregistrement…" : submit}
        </button>
      </div>
    </form>
  );
}
export function PatientForm({ patient = {}, onSave, onClose }) {
  return (
    <Form
      onClose={onClose}
      onSubmit={(values) =>
        onSave({
          ...values,
          national_id: values.national_id || null,
          date_of_birth: values.date_of_birth || null,
          ...(patient.id ? { version: patient.version } : {}),
        })
      }
    >
      <div className="form-grid">
        <Field
          label="Prénom"
          name="first_name"
          required
          maxLength={100}
          defaultValue={patient.first_name}
        />
        <Field
          label="Nom"
          name="last_name"
          required
          maxLength={100}
          defaultValue={patient.last_name}
        />
        <Field
          label="Date de naissance"
          name="date_of_birth"
          type="date"
          min="1850-01-01"
          max={new Date().toISOString().slice(0, 10)}
          defaultValue={patient.date_of_birth}
        />
        <Field label="Sexe">
          <select name="sex" defaultValue={patient.sex || "U"}>
            <option value="U">Non renseigné</option>
            <option value="F">Féminin</option>
            <option value="M">Masculin</option>
            <option value="O">Autre</option>
          </select>
        </Field>
        <Field
          label="Identifiant national (facultatif)"
          name="national_id"
          maxLength={80}
          defaultValue={patient.national_id}
        />
        <Field
          label="Téléphone (facultatif)"
          type="tel"
          name="phone"
          maxLength={40}
          defaultValue={patient.phone}
        />
      </div>
      <Field
        label="Adresse (facultatif)"
        name="address"
        maxLength={300}
        defaultValue={patient.address}
      />
      <p className="form-hint">
        Vérifiez l’identité et recherchez un dossier existant avant de créer un
        patient.
      </p>
    </Form>
  );
}
export function RecordForm({ kind, patients, onSave, onClose, patientId }) {
  return (
    <Form
      onClose={onClose}
      onSubmit={(values) => {
        const { patient_id, ...data } = values;
        if (kind === "appointment")
          data.scheduled_at = new Date(data.scheduled_at).toISOString();
        return onSave({ patient_id, kind, data });
      }}
    >
      <PatientPicker initialPatients={patients} patientId={patientId} />
      <Field
        label={kind === "prescription" ? "Médicament / traitement" : "Intitulé"}
        name="title"
        required
        minLength={2}
        maxLength={160}
      />
      {kind === "appointment" ? (
        <>
          <Field
            label="Date et heure (heure de cet appareil)"
            type="datetime-local"
            required
            name="scheduled_at"
          />
          <Field
            label="Service"
            required
            name="service"
            minLength={2}
            maxLength={100}
          />
        </>
      ) : (
        <Field
          label={
            kind === "prescription"
              ? "Posologie, voie et durée explicites"
              : kind === "note"
                ? "Observation clinique"
                : "Informations pour le laboratoire"
          }
        >
          <textarea
            name={kind === "prescription" ? "instructions" : "notes"}
            required={kind !== "lab"}
            minLength={kind === "lab" ? 0 : 2}
            maxLength={kind === "note" ? 4000 : kind === "lab" ? 1000 : 2000}
            rows={5}
          />
        </Field>
      )}
      {kind === "prescription" && (
        <p className="form-hint">
          La validation clinique relève du prescripteur. Ce pilote ne vérifie
          pas les interactions ou les contre-indications.
        </p>
      )}
    </Form>
  );
}
export function TransferForm({ patients, facilities, user, onSave, onClose }) {
  return (
    <Form
      onClose={onClose}
      submit="Envoyer l’orientation"
      onSubmit={(v) => onSave({ ...v, consent: v.consent === "on" })}
    >
      <PatientPicker initialPatients={patients} />
      <Field label="Établissement destinataire">
        <select name="destination_id" required>
          <option value="">Choisir un établissement</option>
          {facilities
            .filter((f) => f.id !== user.facility_id)
            .map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
        </select>
      </Field>
      <Field label="Synthèse nécessaire à la prise en charge">
        <textarea
          required
          name="summary"
          minLength={10}
          maxLength={4000}
          rows={4}
        />
      </Field>
      <Field label="Autorisation documentée (date, personne et périmètre)">
        <textarea
          required
          name="consent_note"
          minLength={10}
          maxLength={1000}
          rows={3}
        />
      </Field>
      <label className="check-field">
        <input type="checkbox" required name="consent" /> Je confirme avoir
        vérifié l’autorisation de partage et limité la synthèse aux informations
        nécessaires.
      </label>
      <p className="form-hint">
        Le destinataire reçoit l’identité minimale et cette synthèse. Le dossier
        source reste dans votre établissement. Aucun transport n’est réservé.
      </p>
    </Form>
  );
}
export function LabResultForm({ onSave, onClose }) {
  return (
    <Form
      onClose={onClose}
      submit="Valider le résultat"
      onSubmit={(v) => onSave(v.result)}
    >
      <Field label="Résultat validé (unités et références incluses)">
        <textarea name="result" required maxLength={4000} rows={6} />
      </Field>
      <p className="form-hint">
        Après validation, ce résultat devient final dans ce pilote. Vérifiez-le
        avant de confirmer.
      </p>
    </Form>
  );
}

function PatientPicker({ initialPatients = [], patientId = "" }) {
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState(initialPatients);
  const [total, setTotal] = useState(initialPatients.length);
  const [selected, setSelected] = useState(
    initialPatients.find((p) => p.id === patientId) || null,
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api(
          `/patients?q=${encodeURIComponent(query)}&offset=${offset}&limit=50`,
        );
        if (active) {
          setRows(data.items);
          setTotal(data.total);
          setError("");
        }
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, offset]);
  const options =
    selected && !rows.some((p) => p.id === selected.id)
      ? [selected, ...rows]
      : rows;
  return (
    <section className="patient-picker" aria-label="Sélection du patient">
      <Field
        label="Rechercher dans tous les dossiers"
        placeholder="Nom, prénom ou identifiant"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOffset(0);
        }}
      />
      <Field label="Patient">
        <select
          name="patient_id"
          required
          value={selected?.id || ""}
          onChange={(e) =>
            setSelected(options.find((p) => p.id === e.target.value) || null)
          }
        >
          <option value="">Choisir un patient</option>
          {options.map((p) => (
            <option key={p.id} value={p.id}>
              {p.first_name} {p.last_name} ·{" "}
              {p.date_of_birth || "Naissance non renseignée"} ·{" "}
              {p.national_id || p.id.slice(0, 8)}
            </option>
          ))}
        </select>
      </Field>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {loading && <p role="status">Recherche…</p>}
      {total > 50 && (
        <Pagination
          offset={offset}
          total={total}
          onChange={setOffset}
          busy={loading}
        />
      )}
      <p className="form-hint">
        Vérifiez le nom, la naissance et l’identifiant avant de poursuivre.
      </p>
    </section>
  );
}
