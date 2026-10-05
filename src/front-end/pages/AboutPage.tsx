import './AboutPage.css';

const technologyCards = [
  {
    title: 'TypeScript',
    description: 'Type et fiabilité',
  },
  {
    title: 'React',
    description: 'Interface composable',
  },
  {
    title: 'Node.js + Express',
    description: 'API légère',
  },
  {
    title: 'Vite',
    description: 'Développement rapide',
  },
];

export default function AboutPage() {
  return (
    <main className="about-page">
      <div className="about-page__content app-shell">
        <header className="about-hero">
          <p className="about-hero__brand">TMDB DISCOVERY</p>
          <h1>À propos de l'application</h1>
          <p className="about-hero__subtitle">
            Une application de découverte de films, pensée comme une
            expérience web claire, rapide et maintenable.
          </p>
        </header>

        <section className="about-section">
          <div className="about-section__label">LE PROJET</div>
          <div className="about-section__body">
            <h2>Découvrir, comparer, choisir</h2>
            <p>
              Cette application utilise l’API de{' '}
              <strong>The Movie Database</strong> pour rendre les films
              populaires faciles à explorer. Elle démontre la construction d’une
              application complète, du front-end à l’API.
            </p>
          </div>
        </section>

        <section className="about-section about-section--stack">
          <div className="about-section__label">FONDATIONS TECHNIQUES</div>
          <div className="about-section__body about-section__body--stack">
            <h2>Une stack volontairement simple</h2>
            <div className="tech-grid" aria-label="Stack technique">
              {technologyCards.map(({ title, description }) => (
                <article key={title} className="tech-card">
                  <h3>{title}</h3>
                  <p>{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <footer className="source-banner">
          <div className="source-banner__info">
            <p className="source-banner__label">CODE SOURCE</p>
            <h3>Voir la réalisation du projet</h3>
          </div>

          <a
            className="source-banner__button"
            href="https://github.com/quentinchirol/themoviedb-discovery-app"
            target="_blank"
            rel="noreferrer"
          >
            Ouvrir le dépôt GitHub
          </a>
        </footer>
      </div>
    </main>
  );
}