import React, { useEffect, useRef, useId } from "react";
import { Plus, X, ArrowUpRight, ShieldCheck } from "lucide-react";
export function Brand({ light = false }) {
  return (
    <span className={`brand ${light ? "light" : ""}`}>
      <span className="brand-mark">
        <Plus size={24} strokeWidth={3} />
      </span>
      <span>
        danaya<span className="brand-dot">.</span>
      </span>
    </span>
  );
}
export function Badge({ children, tone = "" }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Empty({ title = "Aucun élément pour le moment", children }) {
  return (
    <div className="empty">
      <ShieldCheck size={32} />
      <h3>{title}</h3>
      <p>{children || "Les nouveaux éléments apparaîtront ici."}</p>
    </div>
  );
}
export function Field({ label, children, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children || <input {...props} />}
    </label>
  );
}
export function Modal({ title, children, onClose }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={titleId}
      onCancel={onClose}
    >
      <div className="modal-header">
        <h2 id={titleId}>{title}</h2>
        <button className="icon-btn" aria-label="Fermer" onClick={onClose}>
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function SectionHeading({ eyebrow, title, children }) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
      </div>
      {children}
    </div>
  );
}
export function ArrowLink({ children, onClick }) {
  return (
    <button className="text-link" onClick={onClick}>
      {children}
      <ArrowUpRight size={16} />
    </button>
  );
}
export const dateTime = (value) =>
  new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
export const statuses = {
  pending: "En attente",
  completed: "Terminé",
  cancelled: "Annulé",
  dispensed: "Délivré",
  accepted: "Accepté",
  declined: "Refusé",
};

export function Pagination({
  offset,
  total,
  onChange,
  busy = false,
  size = 50,
}) {
  return (
    <nav className="pagination" aria-label="Pagination des résultats">
      <span>
        {total ? offset + 1 : 0}–{Math.min(offset + size, total)} sur {total}
      </span>
      <div>
        <button
          type="button"
          className="button small ghost"
          disabled={busy || offset === 0}
          onClick={() => onChange(Math.max(0, offset - size))}
        >
          Précédent
        </button>{" "}
        <button
          type="button"
          className="button small ghost"
          disabled={busy || offset + size >= total}
          onClick={() => onChange(offset + size)}
        >
          Suivant
        </button>
      </div>
    </nav>
  );
}
