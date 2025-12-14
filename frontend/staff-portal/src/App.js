import React, { useState } from "react";
import axios from "axios";
import "./App.css";

// Role-based permissions
const PERMISSIONS = {
  doctor: {
    canViewPatients: true,
    canEditPatients: true,
    canViewLabs: true,
    canViewPrescriptions: true,
    canWritePrescriptions: true,
    canViewAppointments: true,
    canManageAppointments: true,
    canAccessTelemedicine: true,
    canViewSettings: true,
  },
  nurse: {
    canViewPatients: true,
    canEditPatients: true,
    canViewLabs: true,
    canViewPrescriptions: true,
    canWritePrescriptions: false,
    canViewAppointments: true,
    canManageAppointments: true,
    canAccessTelemedicine: true,
    canViewSettings: false,
  },
  pharmacist: {
    canViewPatients: false,
    canEditPatients: false,
    canViewLabs: false,
    canViewPrescriptions: true,
    canWritePrescriptions: false,
    canViewAppointments: false,
    canManageAppointments: false,
    canViewSettings: false,
  },
  lab_tech: {
    canViewPatients: true,
    canEditPatients: false,
    canViewLabs: true,
    canViewPrescriptions: false,
    canWritePrescriptions: false,
    canViewAppointments: false,
    canManageAppointments: false,
    canViewSettings: false,
  },
  admin: {
    canViewPatients: true,
    canEditPatients: true,
    canViewLabs: true,
    canViewPrescriptions: true,
    canWritePrescriptions: true,
    canViewAppointments: true,
    canManageAppointments: true,
    canViewSettings: true,
  },
};

function App() {
  const [email, setEmail] = useState("doctor@chu-ouaga.bf");
  const [password, setPassword] = useState("Doctor123!");
  const [user, setUser] = useState(null);
  const [hospital, setHospital] = useState(null);
  const [activePage, setActivePage] = useState("dashboard");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Get permissions for current user
  const permissions = user ? PERMISSIONS[user.role] || {} : {};

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

      setUser(res.data.user);
      setHospital(res.data.hospital);
      localStorage.setItem("danaya_token", res.data.access_token);
      localStorage.setItem("danaya_hospital", JSON.stringify(res.data.hospital));
      setActivePage("dashboard");
    } catch (err) {
      console.error("Login error:", err);
      setError("Email ou mot de passe incorrect");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setHospital(null);
    localStorage.removeItem("danaya_token");
    localStorage.removeItem("danaya_hospital");
    setActivePage("dashboard");
  };

  // Check if user can access a page
  const canAccessPage = (page) => {
    switch (page) {
      case "patients":
        return permissions.canViewPatients;
      case "appointments":
        return permissions.canViewAppointments;
      case "labs":
        return permissions.canViewLabs;
      case "prescriptions":
        return permissions.canViewPrescriptions;
      case "settings":
        return permissions.canViewSettings;
      default:
        return true;
    }
  };

  // ---------- PAGE CONTENT ----------

  const renderPageContent = () => {
    if (!user) return null;

    // Check access
    if (!canAccessPage(activePage)) {
      return (
        <div className="page">
          <h2 className="page-title">Access Denied</h2>
          <p className="page-subtitle">
            You don't have permission to access this page.
          </p>
          <div className="access-denied-box">
            <p>🚫 Your role ({user.role}) does not have access to this feature.</p>
            <p>Contact your administrator if you need access.</p>
          </div>
        </div>
      );
    }

    switch (activePage) {
      case "dashboard":
        return (
          <div className="page">
            <h2 className="page-title">Dashboard</h2>
            <p className="page-subtitle">
              Welcome, <strong>{user.full_name}</strong> ({user.role}).
            </p>

            <div className="cards-grid">
              <div className="info-card">
                <h3>User Information</h3>
                <p>
                  <strong>Email:</strong> {user.email}
                </p>
                <p>
                  <strong>Role:</strong> <span className="role-badge">{user.role}</span>
                </p>
                <p>
                  <strong>Department:</strong> {user.department || "N/A"}
                </p>
              </div>

              {hospital && (
                <div className="info-card">
                  <h3>Hospital Information</h3>
                  <p>
                    <strong>Name:</strong> {hospital.name}
                  </p>
                  <p>
                    <strong>Type:</strong> {hospital.type} ({hospital.level})
                  </p>
                  <p>
                    <strong>Region:</strong> {hospital.region_name}
                  </p>
                  <p>
                    <strong>City:</strong> {hospital.city}
                  </p>
                </div>
              )}

              <div className="info-card">
                <h3>Your Permissions</h3>
                <ul className="list">
                  {permissions.canViewPatients && <li>✅ View Patients</li>}
                  {permissions.canEditPatients && <li>✅ Edit Patients</li>}
                  {permissions.canViewLabs && <li>✅ View Lab Results</li>}
                  {permissions.canViewPrescriptions && <li>✅ View Prescriptions</li>}
                  {permissions.canWritePrescriptions && <li>✅ Write Prescriptions</li>}
                  {permissions.canManageAppointments && <li>✅ Manage Appointments</li>}
                  {permissions.canViewSettings && <li>✅ System Settings</li>}
                </ul>
              </div>

              <div className="info-card">
                <h3>Security & Access</h3>
                <ul className="list">
                  <li>✅ Zero-trust architecture</li>
                  <li>✅ Role-based access control</li>
                  <li>✅ Audit logging enabled</li>
                  <li>🔐 Session expires in 30min</li>
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
              Patient records for {hospital ? hospital.name : "your hospital"}.
              {!permissions.canEditPatients && " (Read-only access)"}
            </p>
            <div className="table-wrapper">
              <table className="simple-table">
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>NHID</th>
                    <th>Age</th>
                    <th>Gender</th>
                    <th>Phone</th>
                    {permissions.canEditPatients && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Zongo Awa</td>
                    <td>BF2025ABC12345</td>
                    <td>33</td>
                    <td>F</td>
                    <td>+226 70 12 34 56</td>
                    {permissions.canEditPatients && (
                      <td><button className="btn-small">Edit</button></td>
                    )}
                  </tr>
                  <tr>
                    <td>Ouedraogo Salif</td>
                    <td>BF2025DEF67890</td>
                    <td>47</td>
                    <td>M</td>
                    <td>+226 76 55 44 33</td>
                    {permissions.canEditPatients && (
                      <td><button className="btn-small">Edit</button></td>
                    )}
                  </tr>
                  <tr>
                    <td>Sawadogo Mariam</td>
                    <td>BF2025GHI11223</td>
                    <td>30</td>
                    <td>F</td>
                    <td>+226 72 88 99 00</td>
                    {permissions.canEditPatients && (
                      <td><button className="btn-small">Edit</button></td>
                    )}
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
              {permissions.canManageAppointments
                ? "Manage patient appointments and schedules."
                : "View patient appointments (read-only)."}
            </p>
            <p className="placeholder-box">
              📅 Appointment management system coming soon.
              {permissions.canManageAppointments && " You can create and edit appointments."}
            </p>
          </div>
        );

      case "labs":
        return (
          <div className="page">
            <h2 className="page-title">Lab Results</h2>
            <p className="page-subtitle">Laboratory test results and imaging reports.</p>
            <div className="info-card">
              <h3>Recent Lab Tests</h3>
              <ul className="list">
                <li>🧪 Blood Test - Zongo Awa (Pending)</li>
                <li>🧪 X-Ray - Ouedraogo Salif (Completed)</li>
                <li>🧪 COVID-19 Test - Sawadogo Mariam (Completed)</li>
              </ul>
            </div>
          </div>
        );

      case "prescriptions":
        return (
          <div className="page">
            <h2 className="page-title">Prescriptions</h2>
            <p className="page-subtitle">
              {permissions.canWritePrescriptions
                ? "Create and manage electronic prescriptions."
                : "View prescriptions (read-only access)."}
            </p>
            <div className="info-card">
              <h3>Recent Prescriptions</h3>
              <ul className="list">
                <li>💊 Paracetamol 500mg - Zongo Awa</li>
                <li>💊 Amoxicillin 250mg - Ouedraogo Salif</li>
                <li>💊 Ibuprofen 400mg - Sawadogo Mariam</li>
              </ul>
              {permissions.canWritePrescriptions && (
                <button className="btn-primary" style={{marginTop: "20px"}}>
                  ➕ New Prescription
                </button>
              )}
            </div>
          </div>
        );
	case "telemedicine":
  return (
    <div className="page">
      <h2 className="page-title">Télémédecine</h2>
      <p className="page-subtitle">
        Consultations à distance et collaboration inter-hospitalière.
      </p>

      <div className="cards-grid">
        <div className="info-card telemedicine-card">
          <h3>📹 Consultations Vidéo</h3>
          <p>Consultations en temps réel avec des patients distants</p>
          <ul className="list">
            <li>✅ Chiffrement end-to-end</li>
            <li>✅ Enregistrement sécurisé</li>
            <li>✅ Partage d'écran</li>
          </ul>
          <button className="btn-primary" disabled style={{marginTop: "16px"}}>
            🚧 Coming Soon
          </button>
        </div>

        <div className="info-card telemedicine-card">
          <h3>🏥 Références Inter-Hôpitaux</h3>
          <p>Transfert de patients entre CSPS → CMA → CHR → CHU</p>
          <ul className="list">
            <li>📤 Envoi de dossiers</li>
            <li>📥 Réception de cas</li>
            <li>💬 Chat médical sécurisé</li>
          </ul>
          <button className="btn-primary" disabled style={{marginTop: "16px"}}>
            �� Coming Soon
          </button>
        </div>

        <div className="info-card telemedicine-card">
          <h3>🎓 Formation Continue</h3>
          <p>Webinaires et sessions de formation</p>
          <ul className="list">
            <li>📚 Bibliothèque médicale</li>
            <li>🎥 Vidéos éducatives</li>
            <li>📊 Partage de cas cliniques</li>
          </ul>
          <button className="btn-primary" disabled style={{marginTop: "16px"}}>
            🚧 Coming Soon
          </button>
        </div>

        <div className="info-card telemedicine-card">
          <h3>🚑 Urgences à Distance</h3>
          <p>Support en temps réel pour les urgences</p>
          <ul className="list">
            <li>⚡ Triage à distance</li>
            <li>🩺 Guidance procédurale</li>
            <li>📞 Ligne directe CHU</li>
          </ul>
          <button className="btn-primary" disabled style={{marginTop: "16px"}}>
            🚧 Coming Soon
          </button>
        </div>
      </div>

      <div className="info-card" style={{marginTop: "24px"}}>
        <h3>🔮 Roadmap Télémédecine</h3>
        <div className="roadmap-timeline">
          <div className="roadmap-item">
            <div className="roadmap-quarter">Q1 2026</div>
            <div className="roadmap-feature">Infrastructure WebRTC/Core platform completion</div>
          </div>
          <div className="roadmap-item">
            <div className="roadmap-quarter">Q2 2026</div>
            <div className="roadmap-feature">Consultations vidéo pilote/Telemedicine pilot (3 hôpitaux)</div>
          </div>
          <div className="roadmap-item">
            <div className="roadmap-quarter">Q3 2026</div>
            <div className="roadmap-feature">Système de référence inter-niveaux/Déploiement régional (10 sites)</div>
          </div>
          <div className="roadmap-item">
            <div className="roadmap-quarter">Q4 2026</div>
            <div className="roadmap-feature">Déploiement national/(180+ sites)</div>
          </div>
        </div>
      </div>
    </div>
  );

      case "settings":
        return (
          <div className="page">
            <h2 className="page-title">Settings</h2>
            <p className="page-subtitle">System configuration and user management.</p>
            <div className="cards-grid">
              <div className="info-card">
                <h3>User Management</h3>
                <p>Add, edit, or remove users</p>
                <button className="btn-primary">Manage Users</button>
              </div>
              <div className="info-card">
                <h3>System Settings</h3>
                <p>Configure platform settings</p>
                <button className="btn-primary">Configure</button>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // ---------- LAYOUT WITH SIDEBAR ----------

  if (user) {
    return (
      <div className="app app-with-sidebar">
        <aside className="sidebar">
          <div className="sidebar-header">
            <div className="sidebar-logo">DANAYA</div>
            <div className="sidebar-subtitle">National Health Platform</div>
          </div>

          {/* Hospital Info */}
          {hospital && (
            <div className="sidebar-hospital">
              <div
                className="hospital-logo-circle"
                style={{ background: hospital.logo_color || "#0047AB" }}
              >
                {hospital.short_code.substring(0, 2).toUpperCase()}
              </div>
              <div className="hospital-info">
                <div className="hospital-name">{hospital.name}</div>
                <div className="hospital-meta">
                  {hospital.type} • {hospital.region_name}
                </div>
              </div>
            </div>
          )}

          {/* User Info */}
          <div className="sidebar-user">
            <div className="avatar-circle">{user.full_name?.charAt(0) || "U"}</div>
            <div>
              <div className="sidebar-user-name">{user.full_name}</div>
              <div className="sidebar-user-role">{user.role}</div>
              {user.department && (
                <div className="sidebar-user-hospital">{user.department}</div>
              )}
            </div>
          </div>

          {/* Navigation - Only show pages user can access */}
          <nav className="sidebar-nav">
            <button
              className={activePage === "dashboard" ? "nav-item nav-item-active" : "nav-item"}
              onClick={() => setActivePage("dashboard")}
            >
              🏠 Dashboard
            </button>

            {permissions.canViewPatients && (
              <button
                className={activePage === "patients" ? "nav-item nav-item-active" : "nav-item"}
                onClick={() => setActivePage("patients")}
              >
                👨‍⚕️ Patients
              </button>
            )}

            {permissions.canViewAppointments && (
              <button
                className={activePage === "appointments" ? "nav-item nav-item-active" : "nav-item"}
                onClick={() => setActivePage("appointments")}
              >
                📅 Appointments
              </button>
            )}

            {permissions.canViewLabs && (
              <button
                className={activePage === "labs" ? "nav-item nav-item-active" : "nav-item"}
                onClick={() => setActivePage("labs")}
              >
                🧪 Lab Results
              </button>
            )}

            {permissions.canViewPrescriptions && (
              <button
                className={activePage === "prescriptions" ? "nav-item nav-item-active" : "nav-item"}
                onClick={() => setActivePage("prescriptions")}
              >
                💊 Prescriptions
              </button>
            )}
	    {permissions.canAccessTelemedicine && (
  	      <button
    		className={activePage === "telemedicine" ? "nav-item nav-item-active" : "nav-item"}
    		onClick={() => setActivePage("telemedicine")}
  	      >
    		📹 Télémédecine
  	      </button>
	    )}

            {permissions.canViewSettings && (
              <button
                className={activePage === "settings" ? "nav-item nav-item-active" : "nav-item"}
                onClick={() => setActivePage("settings")}
              >
                ⚙️ Settings
              </button>
            )}
          </nav>

          {/* Footer */}
          <div className="sidebar-footer">
            <div className="sidebar-footer-text">Danaya ka kɛnɛya – Trust in health</div>
            <button className="btn-secondary btn-logout" onClick={handleLogout}>
              Log out
            </button>
          </div>
        </aside>

        <main className="main-content">{renderPageContent()}</main>
      </div>
    );
  }

  // ---------- LOGIN PAGE ----------

  return (
    <div className="App">
      <div className="login-container">
        <div className="login-box">
          <div className="logo-section">
            <h1>DANAYA</h1>
            <p className="subtitle">Plateforme Nationale de Santé du Burkina Faso</p>
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
              <label>🔒 Mot de passe</label>
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
              <strong>🎭 Test Different Roles:</strong>
            </p>
            <p>
              👨‍⚕️ <code>doctor@chu-ouaga.bf</code> / <code>Doctor123!</code>
            </p>
            <p>
              👩‍⚕️ <code>nurse@chu-ouaga.bf</code> / <code>Nurse123!</code>
            </p>
            <p>
              👨‍💼 <code>admin@danaya.bf</code> / <code>Admin123!</code>
            </p>
          </div>

          <div className="security-badge">
            <p>🛡️ Role-Based Access Control (RBAC)</p>
            <p>🔐 Zero-Trust Security | 🔑 JWT Tokens</p>
          </div>

          <footer className="login-footer">
            <p>© 2025 Ministère de la Santé, Burkina Faso</p>
            <p>
              Développé par <strong>Kader BONZI</strong> | Recherche en Cybersécurité
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}

export default App;
