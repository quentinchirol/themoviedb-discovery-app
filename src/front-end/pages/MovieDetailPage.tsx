import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { DEFAULT_LANGUAGE } from '../../back-end/constants';
import type { Movie } from '../../back-end/schemas/MoviesTypes';
import './MovieDetailPage.css';

type MovieDetails = Pick<
  Movie,
  | 'backdrop_path'
  | 'id'
  | 'original_language'
  | 'original_title'
  | 'overview'
  | 'poster_path'
  | 'release_date'
  | 'title'
  | 'vote_average'
> & {
  genres: Array<{ id: number; name: string }>;
  runtime: number | null;
  tagline: string | null;
};

type MovieDetailsResult =
  | { key: string; movie: MovieDetails }
  | { key: string; error: true };

export default function MovieDetailPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const language = searchParams.get('language') || DEFAULT_LANGUAGE;
  const [result, setResult] = useState<MovieDetailsResult | null>(null);
  const requestKey = `${id ?? ''}?language=${language}`;

  useEffect(() => {
    let isCurrent = true;

    if (!id) {
      return () => {
        isCurrent = false;
      };
    }

    fetch(
      `/api/movies/${encodeURIComponent(id)}?language=${encodeURIComponent(language)}`,
    )
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to fetch movie details');
        }
        return response.json() as Promise<MovieDetails>;
      })
      .then((data) => {
        if (isCurrent) {
          setResult({ key: requestKey, movie: data });
        }
      })
      .catch(() => {
        if (isCurrent) {
          setResult({ key: requestKey, error: true });
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [id, language, requestKey]);

  const isLoading = result?.key !== requestKey;
  const hasError = !isLoading && result !== null && 'error' in result;
  const movie = !isLoading && result && 'movie' in result ? result.movie : null;

  return (
    <main className="app-shell movie-detail-page">
      <h1>Détails du film</h1>
      <Link className="back-link" to={`/movies?language=${language}`}>
        ← Retour vers les films populaires
      </Link>
      {hasError ? (
        <p className="status-message status-message--error" role="alert">
          Impossible de charger ce film. Vérifiez le lien ou réessayez plus
          tard.
        </p>
      ) : movie ? (
        <article className="movie-detail-card">
          <figure className="movie-detail-hero-container">
            {movie.poster_path ? (
              <img
                className="movie-detail-hero"
                src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`}
                alt={`Affiche de ${movie.title}`}
              />
            ) : (
              <div
                className="movie-detail-hero movie-detail-hero-placeholder"
                role="img"
                aria-label={`Affiche indisponible pour ${movie.title}`}
              />
            )}
          </figure>
          <div className="movie-detail-copy">
            <p className="movie-detail-kicker">Détails du film</p>
            <h1>{movie.title}</h1>
            {movie.tagline && (
              <p className="movie-detail-tagline">{movie.tagline}</p>
            )}
            <dl className="movie-detail-meta">
              <div>
                <dt>Sortie</dt>
                <dd>{movie.release_date || 'Non renseignée'}</dd>
              </div>
              {movie.runtime !== null && (
                <div>
                  <dt>Durée</dt>
                  <dd>{movie.runtime} min</dd>
                </div>
              )}
              <div>
                <dt>Note</dt>
                <dd>{movie.vote_average.toFixed(1)}/10</dd>
              </div>
            </dl>
            {movie.genres.length > 0 && (
              <ul className="movie-detail-genres" aria-label="Genres">
                {movie.genres.map((genre) => (
                  <li key={genre.id}>{genre.name}</li>
                ))}
              </ul>
            )}
            <section className="movie-detail-section">
              <h2>Synopsis</h2>
              <p>{movie.overview || 'Aucun synopsis disponible.'}</p>
            </section>
            {movie.original_title !== movie.title && (
              <section className="movie-detail-section">
                <h2>Titre original</h2>
                <p>{movie.original_title}</p>
              </section>
            )}
          </div>
        </article>
      ) : (
        <p className="status-message" role="status">
          Chargement du film…
        </p>
      )}
    </main>
  );
}
