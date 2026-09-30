import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  DEFAULT_LANGUAGE,
  DEFAULT_PAGE,
  DEFAULT_REGION,
} from '../../back-end/constants';
import type {
  Movie,
  MoviesApiResponse,
} from '../../back-end/schemas/MoviesTypes';
import MovieItem from '../components/MovieItem';
import './MoviesListPage.css';

type MoviesResult =
  | { key: string; movies: Movie[] }
  | { key: string; error: true };

export default function MoviesListPage() {
  const [searchParams] = useSearchParams();
  const language = searchParams.get('language') || DEFAULT_LANGUAGE;
  const page = searchParams.get('page') || DEFAULT_PAGE;
  const region = searchParams.get('region') || DEFAULT_REGION;
  const [result, setResult] = useState<MoviesResult | null>(null);
  const requestKey = new URLSearchParams({ language, page, region }).toString();

  useEffect(() => {
    let isCurrent = true;

    fetch(`/api/movies/popular?${requestKey}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to fetch popular movies');
        }
        return response.json() as Promise<MoviesApiResponse>;
      })
      .then((data) => {
        if (isCurrent) {
          setResult({ key: requestKey, movies: data.results });
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
  }, [requestKey]);

  const detailQuery = new URLSearchParams({ language }).toString();
  const isLoading = result?.key !== requestKey;
  const hasError = !isLoading && result !== null && 'error' in result;
  const movies =
    !isLoading && result && 'movies' in result ? result.movies : null;

  return (
    <main className="app-shell">
      <header className="movies-page-header">
        <h1>Films populaires</h1>
        <h2>
          Films à découvrir en France, d’après les données de{' '}
          <b>The Movie Database</b>
        </h2>
      </header>
      <section aria-label="Liste des films populaires">
        {hasError ? (
          <p className="status-message status-message--error" role="alert">
            Impossible de charger les films. Réessayez plus tard.
          </p>
        ) : movies ? (
          <ul className="movie-grid">
            {movies.map((movie) => (
              <li key={movie.id}>
                <Link
                  className="movie-card-link"
                  to={`/movies/${movie.id}?${detailQuery}`}
                  aria-label={`Voir les détails de ${movie.title}`}
                >
                  <MovieItem movie={movie} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="status-message" role="status">
            Chargement des films…
          </p>
        )}
      </section>
    </main>
  );
}
