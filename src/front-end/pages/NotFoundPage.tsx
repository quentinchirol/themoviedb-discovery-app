import { Link } from 'react-router';
import './NotFoundPage.css';

export default function NotFoundPage() {
  return (
    <main className="app-shell not-found-page">
      <p className="not-found-page__eyebrow">Erreur 404</p>
      <h1>Cette page n’existe pas</h1>
      <p>L’adresse demandée ne correspond à aucune page.</p>
      <Link className="back-link" to="/movies">
        Découvrir les films
      </Link>
    </main>
  );
}
