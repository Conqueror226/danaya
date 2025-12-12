import React, { useState } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [user, setUser] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('username', email);
      formData.append('password', password);

      const response = await axios.post(
        '/token',
        formData,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      setUser(response.data.user);
      localStorage.setItem('token', response.data.access_token);
    } catch (err) {
      setError('Email ou mot de passe incorrect');
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('token');
  };

  if (user) {
    return (
      <div className="App">
        <div className="dashboard">
          <header className="dashboard-header">
            <h1>DANAYA</h1>
            <p className="tagline">Danaya ka kɛnɛya - Trust in health</p>
          </header>
          
          <div className="user-card">
            <div className="user-info">
              <h2>Bienvenue, {user.full_name}</h2>
              <div className="user-details">
                <p><strong>Email:</strong> {user.email}</p>
                <p><strong>Rôle:</strong> <span className="role-badge">{user.role}</span></p>
                <p><strong>Hôpital:</strong> {user.hospital_id}</p>
                <p><strong>Service:</strong> {user.department || 'N/A'}</p>
              </div>
            </div>
            
            <div className="demo-features">
              <h3>Fonctionnalités Disponibles</h3>
              <ul>
                <li><span className="status-active">✅</span> Authentification sécurisée (JWT)</li>
                <li><span className="status-active">✅</span> Gestion des rôles (RBAC)</li>
                <li><span className="status-active">✅</span> Architecture zero-trust</li>
                <li><span className="status-active">✅</span> Chiffrement end-to-end</li>
                <li><span className="status-pending">🚧</span> Dossiers patients (en développement)</li>
                <li><span className="status-pending">🚧</span> Résultats de laboratoire (bientôt)</li>
                <li><span className="status-pending">🚧</span> Prescriptions électroniques (bientôt)</li>
                <li><span className="status-pending">🚧</span> Télémédecine (planifié)</li>
              </ul>
            </div>

            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-number">180+</div>
                <div className="stat-label">Établissements ciblés</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">8M+</div>
                <div className="stat-label">Patients potentiels</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">99.5%</div>
                <div className="stat-label">Disponibilité cible</div>
              </div>
            </div>
            
            <button onClick={handleLogout} className="logout-btn">
              🚪 Déconnexion
            </button>
          </div>
        </div>
      </div>
    );
  }

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
              {loading ? '⏳ Connexion...' : '🔐 Se connecter'}
            </button>
          </form>

          <div className="demo-credentials">
            <p><strong>🎭 Compte de démonstration:</strong></p>
            <p><code>doctor@chu-ouaga.bf</code></p>
            <p><code>Doctor123!</code></p>
          </div>

          <div className="security-badge">
            <p>🛡️ Sécurisé par architecture zero-trust</p>
            <p>🔐 Chiffrement AES-256 | 🔑 JWT Tokens</p>
          </div>

          <footer className="login-footer">
            <p>© 2025 Ministère de la Santé, Burkina Faso</p>
            <p>Développé par <strong>Kader BONZI</strong> | Recherche en Cybersécurité</p>
          </footer>
        </div>
      </div>
    </div>
  );
}

export default App;
