import React, { useState, useEffect } from "react";
import axios from "axios";
import "./App.css";

function App() {
  const [email, setEmail] = useState("doctor@chu-ouaga.bf");
  const [password, setPassword] = useState("Doctor123!");
  const [user, setUser] = useState(null);
  const [activePage, setActivePage] = useState("dashboard");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // NEW: hospital info
  const [hospital, setHospital] = useState(null);
  const [hospitalLoading, setHospitalLoading] = useState(false);
  const [hospitalError, setHospitalError] = useState("");

  // ========= LOGIN / LOGOUT =========

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const formData = new URLSearchParams();
      formData.append("username", email);
      formData.append("password", password);

      const res = await axios.post("/token", formData, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });

      const loggedUser = res.data.user;
      setUser(loggedUser);
      localStorage.setItem("danaya_token", res.data.access_token);
      setActivePage("dashboard");

      // fetch hospital as soon as we know the hospital_id
      if (loggedUser?.hospital_id) {
        fetchHospital(loggedUser.hospital_id);
      }
    } catch (err) {
      console.error(err);
      setError("Email ou mot de passe incorrect");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setHospital(null);
    setHospitalError("");
    localStorage.removeItem("danaya_token");
    setActivePage("dashboard");
  };

  // ========= FETCH HOSPITAL =========

  const fetchHospital = async (hospitalId) => {
    if (!hospitalId) return;
    setHospitalLoading(true);
    setHospitalError("");

    try {
      // backend exposes GET /hospitals/{facility_id}
      const res = await axios.get(`/hospitals/${hospitalId}`);
      setHospital(res.data);
    } catch (err) {
      console.error("Failed to load hospital", err);
      setHospitalError("Unable to load hospital information");
    } finally {
      setHospitalLoading(false);
    }
  };

  // If one day you restore token from localStorage, you can also
  // call fetchHospital(user.hospital_id) in a useEffect here.

  // ========= PAGES CONTENT =========

  const renderPageContent = () => {
    if (!user) return null;

    switch (activePage) {
      case "dashboard":
        return (
          <div className="page">
            <h2 className="page-title">Dashboard</h2>
            <p className="page-subtitle">
              Welcome, <strong>{user.full_name}</strong>. This is your overview
              of the DANAYA platform.
            </p>

            <div className="cards-grid">
              <div className="info-card">
                <h3>User Information</h3>
                <p>
                  <strong>Email:</strong> {user.email}
                </p>
                <p>
                  <strong>Role:</strong> {user.role}
                </p>
                <p>
                  <strong>Hospital ID:</strong> {user.hospital_id}
                </p>
                <p>
                  <strong>Department:</strong> {user.department || "N/A"}
                </p>
              </div>

              <div className="info-card">
                <h3>Hospital</h3>
                {hospitalLoading && <p>Loading hospital…</p>}
                {hospitalError && (
                  <p className="small-error">{hospitalError}</p>
                )}
                {hospital && (
                  <>
                    <p>
                      <strong>Name:</strong> {hospital.name}
                    </p>
                    <p>
                      <strong>Type:</strong> {hospital.type}{" "}
                      {hospital.level && `(${hospital.level})`}
                    </p>
                    <p>
                      <strong>Location:</strong>{" "}
                      {hospital.city || "—"},{" "}
                      {hospital.district || ""}
                    </p>
                    <p>
                      <strong>Ownership:</strong>{" "}
                      {hospital.ownership || "—"}
                    </p>
                  </>
                )}
                {!hospital && !hospitalLoading && !hospitalError && (
                  <p>No hospital metadata loaded yet.</p>
                )}
              </div>

              <div className="info-card">
                <h3>Platform Vision</h3>
                <ul className="list">
                  <li>🏥 National hospital coverage</li>
                  <li>👨‍⚕️ Support for doctors, nurses & admins</li>
                  <li>📊 Better data for health decisions</li>
                  <li>🌍 Built in Burkina Faso for Burkina Faso</li>
                </ul>
              </div>
            </div>
          </div>
        );

      case "patients":
        return (
          <div className="page">
            <h2 className="page-title">Patients</h2>
            <p className="page-subtitle">
              This is a demo patients list. Later it will connect to the patient
              service.
            </p>
            <div className="table-wrapper">
              <table className="simple-table">
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Age</th>
                    <th>Hospital ID</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Zongo Awa</td>
                    <td>32</td>
                    <td>P-000112</td>
                    <td>
                      <span className="status-badge status-active">
                        Active
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td>Ouedraogo Salif</td>
                    <td>45</td>
                    <td>P-000113</td>
                    <td>
                      <span className="status-badge status-active">
                        Active
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td>Sawadogo Mariam</td>
                    <td>28</td>
                    <td>P-000114</td>
                    <td>
                      <span className="status-badge status-discharged">
                        Discharged
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );

      case "appointments":
        return (
          <div className="page">
            <h2 className="page-title">Appointments</h2>
            <p className="page-subtitle">
              Here you will later manage patient appointments and schedules.
            </p>
            <p className="placeholder-box">
              📅 Appointment scheduling, calendars and triage logic will be
              implemented here.
            </p>
          </div>
        );

      case "labs":
        return (
          <div className="page">
            <h2 className="page-title">Lab Results</h2>
            <p className="page-subtitle">
              Integration with laboratory systems (HL7/FHIR) will appear here.
            </p>
            <p className="placeholder-box">
              🧪 Demo view for lab results and imaging reports.
            </p>
          </div>
        );

      case "prescriptions":
        return (
          <div className="page">
            <h2 className="page-title">Prescriptions</h2>
            <p className="page-subtitle">
              Electronic prescriptions and pharmacy integration will be
              available here.
            </p>
            <p className="placeholder-box">
              💊 e-Prescriptions, renewals and drug interactions.
            </p>
          </div>
        );

      case "settings":
        return (
          <div className="page">
            <h2 className="page-title">Settings</h2>
            <p className="page-subtitle">
              Future area for user profile, preferences and access settings.
            </p>
            <p className="placeholder-box">
              ⚙️ Profile information, language, theme, security options.
            </p>
          </div>
        );

      default:
        return null;
    }
  };

  // ========= LOGGED-IN LAYOUT (SIDEBAR) =========

  if (user) {
    return (
      <div className="app app-with-sidebar">
        <aside className="sidebar">
          <div className="sidebar-header">
            <div className="sidebar-logo">DANAYA</div>
            <div className="sidebar-subtitle">
              National Health Platform
            </div>
          </div>

          {/* Hospital block */}
          <div className="sidebar-hospital">
            <div className="hospital-logo-circle">
              {hospital?.name
                ? hospital.name.charAt(0)
                : user.full_name?.charAt(0) || "D"}
            </div>
            <div className="hospital-info">
              <div className="hospital-name">
                {hospital?.name || "Unknown facility"}
              </div>
              {hospital && (
                <div className="hospital-meta">
                  {hospital.type}
                  {hospital.level ? ` · ${hospital.level}` : ""}
                </div>
              )}
            </div>
          </div>

          <div className="sidebar-user">
            <div>
              <div className="sidebar-user-name">{user.full_name}</div>
              <div className="sidebar-user-role">{user.role}</div>
            </div>
          </div>

          <nav className="sidebar-nav">
            <button
              className={
                activePage === "dashboard"
                  ? "nav-item nav-item-active"
                  : "nav-item"
              }
              onClick={() => setActivePage("dashboard")}
            >
              🏠 Dashboard
            </button>
            <button
              className={
                activePage === "patients"
                  ? "nav-item nav-item-active"
                  : "nav-item"
              }
              onClick={() => setActivePage("patients")}
            >
              👨‍⚕️ Patients
            </button>
            <button
              className={
                activePage === "appointments"
                  ? "nav-item nav-item-active"
                  : "nav-item"
              }
              onClick={() => setActivePage("appointments")}
            >
              📅 Appointments
            </button>
            <button
              className={
                activePage === "labs"
                  ? "nav-item nav-item-active"
                  : "nav-item"
              }
              onClick={() => setActivePage("labs")}
            >
              🧪 Lab Results
            </button>
            <button
              className={
                activePage === "prescriptions"
                  ? "nav-item nav-item-active"
                  : "nav-item"
              }
              onClick={() => setActivePage("prescriptions")}
            >
              💊 Prescriptions
            </button>
            <button
              className={
                activePage === "settings"
                  ? "nav-item nav-item-active"
                  : "nav-item"
              }
              onClick={() => setActivePage("settings")}
            >
              ⚙️ Settings
            </button>
          </nav>

          <div className="sidebar-footer">
            <div className="sidebar-footer-text">
              Danaya ka kɛnɛya – Trust in health
            </div>
            <button className="btn-secondary btn-logout" onClick={handleLogout}>
              Log out
            </button>
          </div>
        </aside>

        <main className="main-content">{renderPageContent()}</main>
      </div>
    );
  }

  // ========= LOGIN SCREEN (KEEPING THE NICE DESIGN) =========

  return (
    <div className="App">
      <div className="login-container">
        <div className="login-box">
          <div className="logo-section">
            <h1>DANAYA</h1>
            <p className="subtitle">Plateforme Nationale de Santé</p>
            <p className="tagline">Building trust through zero-trust security</p>
          </div>

          <form onSubmit={handleLogin}>
            <h2>Connexion Personnel Médical</h2>

            {error && <div className="error-message">⚠️ {error}</div>}

            <div className="form-group">
              <label>📧 Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="votre.email@chu-ouaga.bf"
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label>�� Mot de passe</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            <button type="submit" disabled={loading} className="login-btn">
              {loading ? "⏳ Connexion..." : "🔐 Se connecter"}
            </button>
          </form>

          <div className="demo-credentials">
            <p>
              <strong>🎭 Compte de démonstration:</strong>
            </p>
            <p>
              <code>doctor@chu-ouaga.bf</code>
            </p>
            <p>
              <code>Doctor123!</code>
            </p>
          </div>

          <div className="security-badge">
            <p>🛡️ Sécurisé par architecture zero-trust</p>
            <p>🔐 Chiffrement AES-256 | 🔑 JWT Tokens</p>
          </div>

          <footer className="login-footer">
            <p>© 2025 Ministère de la Santé, Burkina Faso</p>
            <p>
              Développé par <strong>Kader BONZI</strong> | Recherche en
              Cybersécurité
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}

export default App;
