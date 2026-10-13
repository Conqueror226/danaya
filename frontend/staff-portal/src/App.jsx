import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  FlaskConical,
  Pill,
  ArrowLeftRight,
  ShieldCheck,
  LogOut,
  Search,
  Plus,
  ArrowRight,
  ArrowUpRight,
  RefreshCw,
  MapPin,
  ChevronLeft,
  ChevronRight,
  FileText,
  Settings,
  WifiOff,
} from "lucide-react";
import Landing from "./Landing";
import Login from "./Login";
import { Pagination } from "./components";
import { api, DEMO } from "./api";
import { roleNames, readKinds } from "./demo";
import {
  Brand,
  Badge,
  Empty,
  Field,
  Modal,
  SectionHeading,
  ArrowLink,
  dateTime,
  statuses,
} from "./components";
import { PatientForm, RecordForm, TransferForm, LabResultForm } from "./forms";
import "./App.css";
const pages = [
  ["dashboard", "Vue d’ensemble", LayoutDashboard],
  ["patients", "Patients", Users],
  ["appointment", "Rendez-vous", CalendarDays],
  ["lab", "Laboratoire", FlaskConical],
  ["prescription", "Pharmacie", Pill],
  ["transfers", "Orientations", ArrowLeftRight],
  ["audit", "Journal d’audit", ShieldCheck],
  ["settings", "Mon espace", Settings],
];
const kindNames = {
  appointment: "Rendez-vous",
  lab: "Demande d’analyse",
  prescription: "Ordonnance",
  note: "Observation",
};
const createRoles = {
  appointment: ["doctor", "nurse", "admin"],
  lab: ["doctor", "nurse"],
  prescription: ["doctor"],
  note: ["doctor", "nurse"],
};
const mutatorRoles = ["doctor", "nurse", "admin"];
function canSee(page, role) {
  if (["dashboard", "patients", "settings"].includes(page)) return true;
  if (page === "audit") return role === "admin";
  if (page === "transfers") return ["doctor", "nurse"].includes(role);
  return readKinds[role]?.includes(page);
}
export default function App() {
  const [screen, setScreen] = useState("landing"),
    [user, setUser] = useState(null),
    [page, setPage] = useState("dashboard"),
    [patients, setPatients] = useState([]),
    [total, setTotal] = useState(0),
    [records, setRecords] = useState([]),
    [recordTotal, setRecordTotal] = useState(0),
    [collectionOffset, setCollectionOffset] = useState(0),
    [transferTotal, setTransferTotal] = useState(0),
    [auditTotal, setAuditTotal] = useState(0),
    [detailTotal, setDetailTotal] = useState(0),
    [detailOffset, setDetailOffset] = useState(0),
    [summary, setSummary] = useState({ pending: {}, transfers: 0 }),
    [facilities, setFacilities] = useState([]),
    [transfers, setTransfers] = useState([]),
    [audits, setAudits] = useState([]),
    [query, setQuery] = useState(""),
    [offset, setOffset] = useState(0),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [modal, setModal] = useState(null),
    [selected, setSelected] = useState(null),
    [detailRecords, setDetailRecords] = useState([]),
    [offline, setOffline] = useState(!navigator.onLine),
    [busy, setBusy] = useState(false);
  const loadVersion = useRef(0);
  const sessionVersion = useRef(0);
  const clearSession = useCallback(() => {
    sessionVersion.current++;
    loadVersion.current++;
    setUser(null);
    setPatients([]);
    setRecords([]);
    setTransfers([]);
    setAudits([]);
    setSelected(null);
    setDetailRecords([]);
    setFacilities([]);
    setMessage("");
    setError("");
    setCollectionOffset(0);
    setSummary({ pending: {}, transfers: 0 });
    setModal(null);
    setQuery("");
    setOffset(0);
    setTotal(0);
    setRecordTotal(0);
    setTransferTotal(0);
    setAuditTotal(0);
    setDetailTotal(0);
    setDetailOffset(0);
    setBusy(false);
    setLoading(false);
    setScreen("login");
  }, []);
  useEffect(() => {
    const version = sessionVersion.current;
    let active = true;
    if (!DEMO)
      api("/auth/me")
        .then((u) => {
          if (!active || version !== sessionVersion.current) return;
          setUser(u);
          setScreen("workspace");
        })
        .catch(() => {});
    const online = () => setOffline(!navigator.onLine);
    const expired = () => {
      clearSession();
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    window.addEventListener("danaya-session-expired", expired);
    return () => {
      active = false;
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
      window.removeEventListener("danaya-session-expired", expired);
    };
  }, [clearSession]);
  useEffect(() => {
    if (!user || DEMO) return;
    const timer = setTimeout(
      clearSession,
      Math.max(0, user.session_seconds) * 1000,
    );
    return () => clearTimeout(timer);
  }, [user, clearSession]);
  const load = useCallback(async () => {
    if (!user) return;
    const version = ++loadVersion.current;
    setLoading(true);
    setError("");
    try {
      const queue = ["appointment", "lab", "prescription"].includes(page);
      const [p, r, f, t, a, overview] = await Promise.all([
        api(`/patients?q=${encodeURIComponent(query)}&offset=${offset}`),
        api(
          queue
            ? `/records?kind=${page}&offset=${collectionOffset}&limit=50`
            : "/records?status=pending&limit=100",
        ),
        api("/facilities"),
        ["doctor", "nurse"].includes(user.role)
          ? api(
              `/transfers?offset=${page === "transfers" ? collectionOffset : 0}&limit=50`,
            )
          : Promise.resolve({ items: [], total: 0 }),
        user.role === "admin" && page === "audit"
          ? api(`/audit?offset=${collectionOffset}&limit=50`)
          : Promise.resolve({ items: [], total: 0 }),
        api("/dashboard"),
      ]);
      if (version !== loadVersion.current) return;
      setPatients(p.items);
      setTotal(p.total);
      setRecords(r.items);
      setRecordTotal(r.total);
      setFacilities(f);
      setTransfers(t.items);
      setTransferTotal(t.total);
      setAudits(a.items);
      setAuditTotal(a.total);
      setSummary(overview);
    } catch (err) {
      if (version === loadVersion.current) setError(err.message);
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, [user, query, offset, page, collectionOffset]);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      if (active) load();
    }, 200);
    return () => {
      active = false;
      loadVersion.current++;
      clearTimeout(timer);
    };
  }, [load]);
  useEffect(() => {
    if (page !== "patients") setSelected(null);
    setModal(null);
    setMessage("");
  }, [page]);
  async function change(path, method, body) {
    const version = sessionVersion.current;
    const checkSession = () => {
      if (version !== sessionVersion.current)
        throw new Error(
          "Session terminée. Vérifiez le dossier après reconnexion.",
        );
    };
    const result = await api(path, { method, body });
    checkSession();
    await load();
    checkSession();
    setMessage("Modification enregistrée.");
    if (selected) {
      try {
        const refreshed = await api(
          `/records?patient_id=${selected.id}&offset=${detailOffset}&limit=50`,
        );
        checkSession();
        setDetailRecords(refreshed.items);
        setDetailTotal(refreshed.total);
      } catch {
        checkSession();
        setError(
          "Enregistrement confirmé, mais actualisation indisponible. Ne ressaisissez pas cet élément ; actualisez le dossier.",
        );
      }
    }
    return result;
  }
  async function act(fn) {
    if (busy) return;
    setBusy(true);
    setError("");
    const version = sessionVersion.current;
    try {
      await fn();
    } catch (err) {
      if (version === sessionVersion.current) setError(err.message);
    } finally {
      if (version === sessionVersion.current) setBusy(false);
    }
  }
  async function openPatient(p, nextOffset = 0) {
    const version = sessionVersion.current;
    await act(async () => {
      const [detail, r] = await Promise.all([
        api(`/patients/${p.id}`),
        api(`/records?patient_id=${p.id}&offset=${nextOffset}&limit=50`),
      ]);
      if (version !== sessionVersion.current) return;
      setSelected(detail);
      setDetailRecords(r.items);
      setDetailTotal(r.total);
      setDetailOffset(nextOffset);
    });
  }
  function navigate(next) {
    setPage(next);
    setCollectionOffset(0);
    if (next !== "patients") {
      setQuery("");
      setOffset(0);
    }
    window.scrollTo({ top: 0 });
  }
  function patientName(id) {
    const p = patients.find((p) => p.id === id);
    return p ? `${p.first_name} ${p.last_name}` : `Dossier ${id.slice(0, 8)}`;
  }
  function facilityName(id) {
    return facilities.find((f) => f.id === id)?.name || id;
  }
  function renderRecord(r) {
    const mayComplete =
      r.status === "pending" &&
      ((r.kind === "appointment" && mutatorRoles.includes(user.role)) ||
        (r.kind === "lab" && user.role === "lab_tech") ||
        (r.kind === "prescription" && user.role === "pharmacist"));
    const mayCancel =
      r.status === "pending" &&
      ((r.kind === "appointment" && mutatorRoles.includes(user.role)) ||
        (r.kind === "lab" && ["doctor", "nurse"].includes(user.role)) ||
        (r.kind === "prescription" && user.role === "doctor"));
    return (
      <article className="record-card" key={r.id}>
        <div className="record-top">
          <div>
            <span className="eyebrow">{kindNames[r.kind]}</span>
            <h3>{r.data.title}</h3>
            <p>{r.patient_name || patientName(r.patient_id)}</p>
          </div>
          <Badge tone={r.status === "pending" ? "orange" : "green"}>
            {statuses[r.status] || r.status}
          </Badge>
        </div>
        {r.data.scheduled_at && (
          <p className="record-time">
            <CalendarDays size={16} />
            {dateTime(r.data.scheduled_at)} · {r.data.service}
          </p>
        )}
        {["notes", "instructions", "result"].map(
          (key) =>
            r.data[key] && (
              <p className="record-text" key={key}>
                {key === "result" && <strong>Résultat : </strong>}
                {r.data[key]}
              </p>
            ),
        )}
        <div className="record-bottom">
          <small>{dateTime(r.created_at)}</small>
          <div>
            {mayCancel && (
              <button
                disabled={busy}
                className="text-link muted"
                onClick={() =>
                  setModal({
                    type: "confirm",
                    title: "Annuler cet élément ?",
                    action: () =>
                      change(`/records/${r.id}`, "PATCH", {
                        version: r.version,
                        status: "cancelled",
                      }),
                  })
                }
              >
                Annuler
              </button>
            )}
            {mayComplete && (
              <button
                disabled={busy}
                className="button small ghost"
                onClick={() =>
                  r.kind === "lab"
                    ? setModal({ type: "result", record: r })
                    : setModal({
                        type: "confirm",
                        title:
                          r.kind === "prescription"
                            ? "Confirmer la délivrance ?"
                            : "Terminer ce rendez-vous ?",
                        action: () =>
                          change(`/records/${r.id}`, "PATCH", {
                            version: r.version,
                            status:
                              r.kind === "prescription"
                                ? "dispensed"
                                : "completed",
                          }),
                      })
                }
              >
                {r.kind === "lab"
                  ? "Saisir le résultat"
                  : r.kind === "prescription"
                    ? "Confirmer la délivrance"
                    : "Terminer"}
                <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>
      </article>
    );
  }
  if (screen === "landing")
    return (
      <Landing
        demo={DEMO}
        onEnter={() => setScreen(user ? "workspace" : "login")}
      />
    );
  if (screen === "login" || !user)
    return (
      <Login
        onBack={() => setScreen("landing")}
        onLogin={(u) => {
          sessionVersion.current++;
          loadVersion.current++;
          setUser(u);
          setScreen("workspace");
          setPage("dashboard");
          setError("");
        }}
      />
    );
  const pageLabel = pages.find((p) => p[0] === page)?.[1] || "Vue d’ensemble";
  const pending = records.filter((r) => r.status === "pending");
  return (
    <div className="workspace">
      <a className="skip-link" href="#workspace-main">
        Aller au contenu
      </a>
      <aside className="sidebar">
        <button
          className="brand-button"
          aria-label="Retour à l’accueil"
          onClick={() => setScreen("landing")}
        >
          <Brand />
        </button>
        <div className="facility-label">
          <span className="mini-icon">
            <MapPin size={18} />
          </span>
          <div>
            <strong>{user.facility.name}</strong>
            <small>{user.facility.city} · Espace équipe</small>
          </div>
        </div>
        <p className="nav-label">MON QUOTIDIEN</p>
        <nav aria-label="Espace professionnel">
          {pages
            .filter(([key]) => canSee(key, user.role))
            .map(([key, label, Icon]) => (
              <button
                key={key}
                className={page === key ? "nav-item active" : "nav-item"}
                aria-current={page === key ? "page" : undefined}
                onClick={() => navigate(key)}
              >
                <Icon size={19} />
                {label}
                {key === "transfers" && (summary.transfers ?? 0) > 0 && (
                  <span className="nav-count">{summary.transfers ?? 0}</span>
                )}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="pilot-note">
            <ShieldCheck size={22} />
            <strong>La santé, en confiance.</strong>
            <small>
              {DEMO ? "Environnement de démonstration" : "Version pilote · 0.2"}
            </small>
          </div>
          <div className="user-row">
            <span className="avatar">{user.name.charAt(0)}</span>
            <div>
              <strong>{user.name}</strong>
              <small>{roleNames[user.role]}</small>
            </div>
            <button
              className="icon-btn"
              aria-label="Se déconnecter"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await api("/auth/logout", { method: "POST" });
                  clearSession();
                })
              }
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="workspace-body">
        <header className="workspace-top">
          <span>
            Espace de soins <ChevronRight size={14} />{" "}
            <strong>{pageLabel}</strong>
          </span>
          <div>
            <span className={`connection ${offline ? "disconnected" : ""}`}>
              {offline ? <WifiOff size={14} /> : <span className="dot" />}
              {DEMO
                ? "Aperçu fictif"
                : offline
                  ? "Hors connexion"
                  : "Espace professionnel"}
            </span>
            <button
              className="icon-btn"
              aria-label="Actualiser les données"
              disabled={loading}
              onClick={load}
            >
              <RefreshCw size={18} />
            </button>
            <span className="top-avatar">{user.name.charAt(0)}</span>
          </div>
        </header>
        {DEMO && (
          <div className="workspace-demo">
            Démonstration interactive — données fictives. Les changements sont
            effacés au rechargement.
          </div>
        )}
        {offline && (
          <div className="notice">
            Connexion perdue. Les modifications ne sont pas mises en file
            d’attente. Reconnectez-vous pour enregistrer.
          </div>
        )}
        <main
          id="workspace-main"
          className="workspace-main"
          aria-busy={loading}
        >
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {page === "dashboard"
                  ? new Intl.DateTimeFormat("fr-FR", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    }).format(new Date())
                  : "DANAYA · COORDINATION DES SOINS"}
              </p>
              <h1>
                {page === "dashboard"
                  ? "Bonjour, prenons soin ensemble."
                  : pageLabel}
              </h1>
              <p>
                {page === "dashboard"
                  ? "Les informations utiles pour une journée bien organisée."
                  : page === "patients"
                    ? "Retrouvez les personnes que votre établissement accompagne."
                    : page === "transfers"
                      ? "Préparez le relais et suivez la réponse de l’équipe destinataire."
                      : page === "settings"
                        ? "Votre identité professionnelle et votre périmètre d’accès."
                        : "Un suivi partagé, des responsabilités clairement définies."}
              </p>
            </div>
            {page === "patients" && mutatorRoles.includes(user.role) && (
              <button
                className="button"
                disabled={offline}
                onClick={() => setModal({ type: "patient" })}
              >
                <Plus size={18} /> Nouveau patient
              </button>
            )}
            {createRoles[page]?.includes(user.role) && (
              <button
                className="button"
                disabled={offline}
                onClick={() => setModal({ type: "record", kind: page })}
              >
                <Plus size={18} /> {kindNames[page]}
              </button>
            )}
            {page === "transfers" && user.role === "doctor" && (
              <button
                className="button"
                disabled={offline}
                onClick={() => setModal({ type: "transfer" })}
              >
                <Plus size={18} /> Orienter un patient
              </button>
            )}
          </div>
          {error && (
            <div className="error" role="alert">
              {error}
              <button className="text-link" onClick={load}>
                Réessayer
              </button>
            </div>
          )}
          {message && (
            <div className="success" role="status">
              {message}
            </div>
          )}
          {loading && (
            <p className="loading" role="status">
              Actualisation des données…
            </p>
          )}
          {page === "dashboard" && (
            <>
              <div className="stats-grid">
                <div className="stat-card">
                  <span className="mini-icon">
                    <Users size={21} />
                  </span>
                  <span>Patients enregistrés</span>
                  <strong>{total}</strong>
                  <small>Dans votre établissement</small>
                </div>
                <div className="stat-card">
                  <span className="mini-icon peach">
                    <CalendarDays size={21} />
                  </span>
                  <span>Rendez-vous en attente</span>
                  <strong>{summary.pending.appointment ?? "—"}</strong>
                  <small>Dans votre établissement</small>
                </div>
                <div className="stat-card">
                  <span className="mini-icon lavender">
                    <FlaskConical size={21} />
                  </span>
                  <span>Analyses en attente</span>
                  <strong>
                    {readKinds[user.role].includes("lab")
                      ? (summary.pending.lab ?? 0)
                      : "—"}
                  </strong>
                  <small>
                    {readKinds[user.role].includes("lab")
                      ? "Dans votre établissement"
                      : "Hors de votre périmètre"}
                  </small>
                </div>
                <div className="stat-card">
                  <span className="mini-icon sand">
                    <ArrowLeftRight size={21} />
                  </span>
                  <span>Orientations en cours</span>
                  <strong>
                    {["doctor", "nurse"].includes(user.role)
                      ? (summary.transfers ?? 0)
                      : "—"}
                  </strong>
                  <small>Demandes envoyées et reçues</small>
                </div>
              </div>
              <div className="dashboard-grid">
                <section className="panel">
                  <SectionHeading eyebrow="LA PROCHAINE ÉTAPE" title="À suivre">
                    <ArrowLink
                      onClick={() => navigate(readKinds[user.role][0])}
                    >
                      Tout voir
                    </ArrowLink>
                  </SectionHeading>
                  {pending.length ? (
                    pending.slice(0, 4).map((r) => (
                      <button
                        className="activity-row"
                        key={r.id}
                        onClick={() => navigate(r.kind)}
                      >
                        <span
                          className={`mini-icon ${r.kind === "appointment" ? "peach" : ""}`}
                        >
                          {r.kind === "appointment" ? (
                            <CalendarDays size={20} />
                          ) : r.kind === "lab" ? (
                            <FlaskConical size={20} />
                          ) : (
                            <Pill size={20} />
                          )}
                        </span>
                        <span>
                          <strong>{r.data.title}</strong>
                          <small>
                            {r.patient_name || patientName(r.patient_id)} ·{" "}
                            {kindNames[r.kind]}
                          </small>
                        </span>
                        <Badge tone="orange">À traiter</Badge>
                        <ArrowUpRight size={16} />
                      </button>
                    ))
                  ) : (
                    <Empty title="Vous êtes à jour">
                      Aucune action en attente dans les éléments chargés.
                    </Empty>
                  )}
                  <p className="panel-foot">
                    {records.length} éléments chargés sur {recordTotal}.
                    Actualisez pour voir les changements de votre équipe.
                  </p>
                </section>
                <section className="quick-panel">
                  <span className="eyebrow">CHAQUE PARCOURS COMPTE</span>
                  <h2>
                    Le bon geste,
                    <br />
                    au bon endroit.
                  </h2>
                  <p>
                    Retrouvez un dossier ou préparez la prochaine étape de
                    soins.
                  </p>
                  <button onClick={() => navigate("patients")}>
                    <Users size={20} /> Rechercher un patient{" "}
                    <ArrowRight size={16} />
                  </button>
                  {createRoles.appointment.includes(user.role) && (
                    <button
                      onClick={() =>
                        setModal({ type: "record", kind: "appointment" })
                      }
                    >
                      <CalendarDays size={20} /> Planifier un rendez-vous{" "}
                      <ArrowRight size={16} />
                    </button>
                  )}
                  {user.role === "doctor" && (
                    <button onClick={() => navigate("transfers")}>
                      <ArrowLeftRight size={20} /> Organiser une orientation{" "}
                      <ArrowRight size={16} />
                    </button>
                  )}
                  <div className="quick-decoration" aria-hidden="true">
                    ✳
                  </div>
                </section>
              </div>
              <section className="panel">
                <SectionHeading title="Vos patients récents">
                  <ArrowLink onClick={() => navigate("patients")}>
                    Ouvrir les dossiers
                  </ArrowLink>
                </SectionHeading>
                <div className="patient-mini-grid">
                  {[...patients]
                    .sort((a, b) =>
                      (b.created_at || "").localeCompare(a.created_at || ""),
                    )
                    .slice(0, 4)
                    .map((p, i) => (
                      <button
                        className="patient-mini"
                        key={p.id}
                        onClick={() => {
                          setPage("patients");
                          openPatient(p);
                        }}
                      >
                        <span className={`avatar avatar-${i}`}>
                          {p.first_name.charAt(0)}
                          {p.last_name.charAt(0)}
                        </span>
                        <strong>
                          {p.first_name} {p.last_name}
                        </strong>
                        <small>
                          {p.national_id || `Dossier ${p.id.slice(0, 8)}`}
                        </small>
                        <ArrowUpRight size={16} />
                      </button>
                    ))}
                </div>
                {!patients.length && <Empty />}
                <p className="panel-foot">Parmi les 50 dossiers chargés.</p>
              </section>
            </>
          )}
          {page === "patients" && (
            <>
              <div className="toolbar">
                <label className="search-box">
                  <Search size={18} />
                  <input
                    aria-label="Rechercher un patient"
                    placeholder="Nom, prénom ou identifiant…"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setOffset(0);
                    }}
                  />
                </label>
                <span>
                  {total} dossier{total !== 1 ? "s" : ""}
                </span>
              </div>
              <section className="panel table-panel">
                <div className="table-scroll">
                  <table>
                    <caption className="sr-only">
                      Patients de votre établissement
                    </caption>
                    <thead>
                      <tr>
                        <th>Patient</th>
                        <th>Identifiant</th>
                        <th>Naissance</th>
                        <th>Contact</th>
                        <th>
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {patients.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <span className="patient-cell">
                              <span className="avatar">
                                {p.first_name.charAt(0)}
                                {p.last_name.charAt(0)}
                              </span>
                              <strong>
                                {p.first_name} {p.last_name}
                              </strong>
                            </span>
                          </td>
                          <td>{p.national_id || p.id.slice(0, 8)}</td>
                          <td>{p.date_of_birth || "Non renseignée"}</td>
                          <td>{p.phone || "—"}</td>
                          <td>
                            <button
                              className="text-link"
                              disabled={busy}
                              onClick={() => openPatient(p)}
                            >
                              Ouvrir <ArrowUpRight size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!patients.length && !loading && (
                  <Empty
                    title={
                      query ? "Aucun résultat" : "Aucun patient enregistré"
                    }
                  >
                    {query
                      ? "Essayez un autre nom ou identifiant."
                      : "Commencez par créer un dossier patient."}
                  </Empty>
                )}
                <div className="pagination">
                  <span>
                    {total ? offset + 1 : 0}–{Math.min(offset + 50, total)} sur{" "}
                    {total}
                  </span>
                  <div>
                    <button
                      aria-label="Page précédente"
                      className="icon-btn"
                      disabled={offset === 0 || loading}
                      onClick={() => setOffset(Math.max(0, offset - 50))}
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      aria-label="Page suivante"
                      className="icon-btn"
                      disabled={offset + 50 >= total || loading}
                      onClick={() => setOffset(offset + 50)}
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </div>
              </section>
              {selected && (
                <section className="panel detail-panel">
                  <SectionHeading
                    eyebrow="DOSSIER PATIENT"
                    title={`${selected.first_name} ${selected.last_name}`}
                  >
                    {mutatorRoles.includes(user.role) && (
                      <button
                        className="button small ghost"
                        onClick={() =>
                          setModal({ type: "patient", patient: selected })
                        }
                      >
                        Modifier l’identité
                      </button>
                    )}
                  </SectionHeading>
                  <div className="detail-info">
                    <p>
                      <span>Naissance</span>
                      {selected.date_of_birth || "Non renseignée"}
                    </p>
                    <p>
                      <span>Téléphone</span>
                      {selected.phone || "Non renseigné"}
                    </p>
                    <p>
                      <span>Adresse</span>
                      {selected.address || "Non renseignée"}
                    </p>
                  </div>
                  <SectionHeading title="Parcours dans cet établissement">
                    {["doctor", "nurse"].includes(user.role) && (
                      <button
                        className="text-link"
                        onClick={() =>
                          setModal({
                            type: "record",
                            kind: "note",
                            patientId: selected.id,
                          })
                        }
                      >
                        <Plus size={16} /> Observation
                      </button>
                    )}
                  </SectionHeading>
                  <div className="records-grid">
                    {detailRecords.map(renderRecord)}
                  </div>
                  <Pagination
                    offset={detailOffset}
                    total={detailTotal}
                    busy={busy}
                    onChange={(value) => openPatient(selected, value)}
                  />
                  {!detailRecords.length && (
                    <Empty title="Aucun élément accessible">
                      Le parcours affiche uniquement les informations autorisées
                      pour votre rôle.
                    </Empty>
                  )}
                </section>
              )}
            </>
          )}
          {["appointment", "lab", "prescription"].includes(page) && (
            <>
              <div className="toolbar">
                <span>{recordTotal} éléments accessibles</span>
                <Badge>{roleNames[user.role]}</Badge>
              </div>
              <div className="records-grid">
                {records.filter((r) => r.kind === page).map(renderRecord)}
              </div>
              {!records.some((r) => r.kind === page) && !loading && (
                <div className="panel">
                  <Empty />
                </div>
              )}
            </>
          )}
          {page === "transfers" && (
            <>
              <div className="notice">
                L’orientation partage une synthèse ciblée. Elle ne fusionne pas
                les dossiers et n’accorde pas l’accès à l’historique complet.
              </div>
              <div className="records-grid">
                {transfers.map((t) => (
                  <article className="record-card" key={t.id}>
                    <div className="record-top">
                      <h3>
                        {t.patient_snapshot.first_name}{" "}
                        {t.patient_snapshot.last_name}
                      </h3>
                      <Badge tone={t.status === "pending" ? "orange" : "green"}>
                        {statuses[t.status]}
                      </Badge>
                    </div>
                    <p className="transfer-route">
                      {facilityName(t.source_id)}
                      <ArrowRight size={16} />
                      {facilityName(t.destination_id)}
                    </p>
                    <p className="record-text">{t.summary}</p>
                    <details>
                      <summary>Autorisation de partage</summary>
                      <p>{t.consent_note}</p>
                    </details>
                    <div className="record-bottom">
                      <small>{dateTime(t.created_at)}</small>
                      {t.status === "pending" && user.role === "doctor" && (
                        <div>
                          {(t.source_id === user.facility_id
                            ? ["cancelled"]
                            : ["accepted", "declined"]
                          ).map((status) => (
                            <button
                              disabled={busy}
                              className="button small ghost"
                              key={status}
                              onClick={() =>
                                setModal({
                                  type: "confirm",
                                  title: `${status === "accepted" ? "Accepter" : status === "declined" ? "Refuser" : "Annuler"} cette orientation ?`,
                                  action: () =>
                                    change(`/transfers/${t.id}`, "PATCH", {
                                      version: t.version,
                                      status,
                                    }),
                                })
                              }
                            >
                              {status === "accepted"
                                ? "Accepter"
                                : status === "declined"
                                  ? "Refuser"
                                  : "Annuler"}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
              {!transfers.length && !loading && (
                <div className="panel">
                  <Empty title="Aucune orientation">
                    Les demandes envoyées et reçues par votre établissement
                    seront regroupées ici.
                  </Empty>
                </div>
              )}
            </>
          )}
          {page === "audit" && (
            <section className="panel">
              <p className="form-hint">
                Les actions de votre établissement, par page. Aucune donnée
                clinique n’est incluse dans ce journal.
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Action</th>
                      <th>Utilisateur</th>
                      <th>Ressource</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audits.map((a) => (
                      <tr key={a.id}>
                        <td>{dateTime(a.at)}</td>
                        <td>{a.action}</td>
                        <td>{a.user_id.slice(0, 8)}</td>
                        <td>{a.resource_id?.slice(0, 8) || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!audits.length && <Empty />}
            </section>
          )}
          {page === "settings" && (
            <div className="records-grid">
              <section className="panel">
                <ShieldCheck className="settings-icon" />
                <h2>Votre espace professionnel</h2>
                <dl>
                  <dt>Nom</dt>
                  <dd>{user.name}</dd>
                  <dt>Rôle</dt>
                  <dd>{roleNames[user.role]}</dd>
                  <dt>Établissement</dt>
                  <dd>{user.facility.name}</dd>
                  <dt>Version</dt>
                  <dd>Danaya 0.2 · Pilote</dd>
                </dl>
                <p className="form-hint">
                  Pour modifier vos habilitations, contactez l’administrateur de
                  votre établissement.
                </p>
              </section>
              <section className="panel">
                <h2>Confidentialité et disponibilité</h2>
                <p>
                  Utilisez votre compte nominatif et déconnectez-vous après
                  utilisation, en particulier sur un appareil partagé.
                </p>
                <p>
                  Les données de soins ne sont pas enregistrées dans le stockage
                  local du navigateur. Une connexion au serveur de
                  l’établissement est nécessaire pour enregistrer.
                </p>
                <p>
                  {DEMO
                    ? "La démonstration simule les parcours et les rôles dans votre navigateur. Les contrôles de sécurité réels sont assurés par l’API dans le déploiement complet."
                    : "La session expire après 30 minutes. Les droits sont vérifiés par le serveur pour chaque action."}
                </p>
              </section>
            </div>
          )}
          {[
            "appointment",
            "lab",
            "prescription",
            "transfers",
            "audit",
          ].includes(page) && (
            <Pagination
              offset={collectionOffset}
              total={
                page === "transfers"
                  ? transferTotal
                  : page === "audit"
                    ? auditTotal
                    : recordTotal
              }
              busy={loading}
              onChange={setCollectionOffset}
            />
          )}
          <footer className="workspace-footer">
            <span>Danaya · La santé, en confiance.</span>
            <span>Version pilote {DEMO ? "· Démonstration" : ""}</span>
          </footer>
        </main>
      </div>
      {modal && (
        <Modal
          title={
            modal.title ||
            (modal.type === "patient"
              ? modal.patient
                ? "Modifier le dossier"
                : "Nouveau patient"
              : modal.type === "record"
                ? kindNames[modal.kind]
                : modal.type === "result"
                  ? "Valider le résultat"
                  : "Orienter un patient")
          }
          onClose={() => setModal(null)}
        >
          {modal.type === "patient" ? (
            <PatientForm
              patient={modal.patient}
              onClose={() => setModal(null)}
              onSave={async (body) => {
                const p = await change(
                  modal.patient ? `/patients/${modal.patient.id}` : "/patients",
                  modal.patient ? "PUT" : "POST",
                  body,
                );
                if (selected?.id === p.id) setSelected(p);
              }}
            />
          ) : modal.type === "record" ? (
            <RecordForm
              kind={modal.kind}
              patients={patients}
              patientId={modal.patientId}
              onClose={() => setModal(null)}
              onSave={async (body) => {
                await change("/records", "POST", body);
              }}
            />
          ) : modal.type === "transfer" ? (
            <TransferForm
              patients={patients}
              facilities={facilities}
              user={user}
              onClose={() => setModal(null)}
              onSave={(body) => change("/transfers", "POST", body)}
            />
          ) : modal.type === "result" ? (
            <LabResultForm
              onClose={() => setModal(null)}
              onSave={(result) =>
                change(`/records/${modal.record.id}`, "PATCH", {
                  version: modal.record.version,
                  status: "completed",
                  result,
                })
              }
            />
          ) : (
            <Confirm onClose={() => setModal(null)} onConfirm={modal.action} />
          )}
        </Modal>
      )}
    </div>
  );
}
function Confirm({ onClose, onConfirm }) {
  const [error, setError] = useState(""),
    [uncertain, setUncertain] = useState(false),
    [busy, setBusy] = useState(false);
  return (
    <>
      <p>
        Vérifiez que cette action correspond au suivi effectué. Elle sera
        inscrite dans le journal d’audit.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button disabled={busy} className="button ghost" onClick={onClose}>
          {uncertain ? "Fermer et vérifier la liste" : "Revenir"}
        </button>
        <button
          className="button"
          disabled={busy || uncertain}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
              onClose();
            } catch (err) {
              setError(err.message);
              setUncertain(Boolean(err.uncertain));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Enregistrement…" : "Confirmer"}
        </button>
      </div>
    </>
  );
}
