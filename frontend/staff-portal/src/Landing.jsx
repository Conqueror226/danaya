import React, { useState } from "react";
import {
  ArrowRight,
  Heart,
  CalendarDays,
  Users,
  FlaskConical,
  Pill,
  ArrowLeftRight,
  ShieldCheck,
  Menu,
  Check,
  MapPin,
  Plus,
  X,
} from "lucide-react";
import { Brand, Badge } from "./components";
const services = [
  {
    icon: Users,
    title: "Le patient au centre",
    text: "Un espace pour retrouver les informations utiles et accompagner chaque personne dans son parcours.",
  },
  {
    icon: CalendarDays,
    title: "Des équipes coordonnées",
    text: "Rendez-vous, demandes d’analyses et ordonnances : chacun sait quelle est la prochaine étape.",
  },
  {
    icon: ArrowLeftRight,
    title: "Des soins qui se suivent",
    text: "Préparez une orientation vers un autre établissement avec une synthèse et une autorisation documentées.",
  },
];
export default function Landing({ onEnter, demo }) {
  const [menu, setMenu] = useState(false);
  return (
    <div className="landing">
      <a className="skip-link" href="#main">
        Aller au contenu
      </a>
      <header className="site-header">
        <a href="#" aria-label="Danaya accueil">
          <Brand />
        </a>
        <button
          className="icon-btn menu-toggle"
          onClick={() => setMenu(!menu)}
          aria-expanded={menu}
          aria-label="Menu"
        >
          {menu ? <X /> : <Menu />}
        </button>
        <nav className={menu ? "open" : ""} aria-label="Navigation principale">
          <a href="#approche" onClick={() => setMenu(false)}>
            Notre approche
          </a>
          <a href="#services" onClick={() => setMenu(false)}>
            Les services
          </a>
          <a href="#confiance" onClick={() => setMenu(false)}>
            La confiance
          </a>
        </nav>
        <button className="button small" onClick={onEnter}>
          Espace professionnel <ArrowRight size={16} />
        </button>
      </header>
      <main id="main">
        <section className="hero">
          <div className="hero-copy">
            <Badge tone="green">
              <span className="dot" /> POUR UNE SANTÉ PLUS PROCHE
            </Badge>
            <h1>
              Bien soigner
              <br />
              commence par
              <br />
              <em>mieux se relier.</em>
            </h1>
            <p>
              Patients, soignants, établissements.
              <br />
              Danaya rapproche celles et ceux qui prennent soin de nous, dans un
              même espace de confiance.
            </p>
            <div className="hero-actions">
              <button className="button" onClick={onEnter}>
                {demo ? "Explorer la plateforme" : "Accéder à mon espace"}
                <ArrowRight size={18} />
              </button>
              <a className="button ghost" href="#approche">
                Découvrir Danaya
              </a>
            </div>
            <div className="hero-caption">
              <span className="tiny-avatars">
                <b>+</b>
                <b>♡</b>
                <b>↗</b>
              </span>
              <span>
                Pensé pour les équipes de santé
                <br />
                <strong>Ancré au Burkina Faso.</strong>
              </span>
            </div>
          </div>
          <div
            className="hero-art"
            aria-label="Illustration du parcours de soins coordonné"
          >
            <div className="art-top">
              <span>LE LIEN QUI PREND SOIN</span>
              <Heart size={20} />
            </div>
            <div className="orb orb-one" />
            <div className="orb orb-two" />
            <div className="care-card">
              <span className="care-symbol">
                <Heart size={36} />
              </span>
              <p>
                Un parcours.
                <br />
                <strong>Toute une équipe.</strong>
              </p>
              <div className="care-people">
                <span>AM</span>
                <span>FI</span>
                <span>SO</span>
                <span>
                  <Plus size={20} />
                </span>
              </div>
              <div className="care-line">
                <span />
                <span />
                <span />
              </div>
              <div className="care-footer">
                <ShieldCheck size={16} /> L’humain, au cœur du soin
              </div>
            </div>
            <div className="floating-card float-one">
              <span className="mini-icon peach">
                <CalendarDays size={21} />
              </span>
              <div>
                <strong>Chaque étape compte</strong>
                <small>Organiser · Accompagner · Suivre</small>
              </div>
            </div>
            <div className="floating-card float-two">
              <span className="mini-icon">
                <ArrowLeftRight size={21} />
              </span>
              <div>
                <strong>Un lien entre les équipes</strong>
                <small>Du centre de santé à l’hôpital</small>
              </div>
            </div>
            <span className="art-bottom">
              DANAYA KA KƐNƐYA <span>✳</span> LA SANTÉ, EN CONFIANCE
            </span>
          </div>
        </section>
        <div className="care-strip">
          <span>UN ESPACE COMMUN POUR</span>
          <span>
            <Users size={18} /> Équipes de soins
          </span>
          <span>
            <FlaskConical size={18} /> Laboratoires
          </span>
          <span>
            <Pill size={18} /> Pharmacies
          </span>
          <span>
            <ArrowLeftRight size={18} /> Établissements
          </span>
        </div>
        <section className="section" id="approche">
          <div className="intro-row">
            <div>
              <p className="eyebrow">MOINS DE DISTANCE. PLUS DE CONTINUITÉ.</p>
              <h2>
                La bonne information.
                <br />
                Au bon moment.
              </h2>
            </div>
            <p>
              Un dossier égaré, une information à ressaisir, un suivi
              interrompu. Nous construisons Danaya pour simplifier le quotidien
              et remettre la relation de soin au premier plan.
            </p>
          </div>
          <div className="service-grid" id="services">
            {services.map(({ icon: Icon, title, text }, i) => (
              <article className="service-card" key={title}>
                <div className={`service-icon color-${i}`}>
                  <Icon size={27} />
                </div>
                <span className="service-number">0{i + 1}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="trust-section" id="confiance">
          <div>
            <p className="eyebrow">DANAYA SIGNIFIE CONFIANCE</p>
            <h2>
              La confiance se construit.
              <br />À chaque accès.
            </h2>
            <p>
              Un espace professionnel où les droits suivent les responsabilités
              et où les actions sont tracées.
            </p>
          </div>
          <ul>
            <li>
              <Check /> Des accès selon le métier et l’établissement
            </li>
            <li>
              <Check /> Une session limitée et révocable
            </li>
            <li>
              <Check /> Des transferts accompagnés d’une autorisation
            </li>
            <li>
              <Check /> Une trace des consultations et modifications
            </li>
          </ul>
        </section>
        <section className="bottom-cta">
          <div>
            <Badge>VERSION PILOTE</Badge>
            <h2>
              Un meilleur lien.
              <br />
              De meilleurs parcours.
            </h2>
            <p>Découvrez un quotidien de soins mieux organisé.</p>
          </div>
          <button className="button" onClick={onEnter}>
            {demo
              ? "Essayer la démonstration"
              : "Ouvrir l’espace professionnel"}
            <ArrowRight size={20} />
          </button>
        </section>
      </main>
      <footer className="site-footer">
        <Brand />
        <p>
          Une initiative de Désiré A. Kader BONZI.
          <br />
          Plateforme pilote indépendante, sans affiliation ministérielle
          déclarée.
        </p>
        <span>
          <MapPin size={14} /> Burkina Faso
        </span>
        <small>© {new Date().getFullYear()} Danaya</small>
      </footer>
      {demo && (
        <div className="demo-ribbon">
          Aperçu interactif · Données fictives uniquement · Aucune prise en
          charge médicale
        </div>
      )}
    </div>
  );
}
