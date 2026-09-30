import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { DEFAULT_LANGUAGE } from '../../back-end/constants';
import type { Movie } from '../../back-end/schemas/MoviesTypes';

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
    <main className="app-shell">
      <Link className="back-link" to={`/movies?language=${language}`}>
        ← Tous les films
      </Link>
      {hasError ? (
        <p className="status-message status-message--error" role="alert">
          Impossible de charger ce film. Vérifiez le lien ou réessayez plus
          tard.
        </p>
      ) : movie ? (
        <article className="movie-detail">
          {movie.backdrop_path && (
            <img
              className="movie-detail__backdrop"
              src={`https://image.tmdb.org/t/p/w1280${movie.backdrop_path}`}
              alt=""
            />
          )}
          <div className="movie-detail__body">
            {movie.poster_path ? (
              <img
                className="movie-detail__poster"
                src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`}
                alt={`Affiche de ${movie.title}`}
              />
            ) : (
              <div
                className="movie-detail__poster movie-poster--fallback"
                role="img"
                aria-label={`Affiche indisponible pour ${movie.title}`}
              />
            )}
            <div className="movie-detail__content">
              <p className="movie-detail__eyebrow">
                {movie.release_date.slice(0, 4)}
                {movie.runtime ? ` · ${movie.runtime} min` : ''}
                {` · ${movie.vote_average.toFixed(1)}/10`}
              </p>
              <h1>{movie.title}</h1>
              {movie.tagline && (
                <p className="movie-detail__tagline">{movie.tagline}</p>
              )}
              {movie.genres.length > 0 && (
                <ul className="movie-genres" aria-label="Genres">
                  {movie.genres.map((genre) => (
                    <li key={genre.id}>{genre.name}</li>
                  ))}
                </ul>
              )}
              <h2>Synopsis</h2>
              <p className="movie-detail__overview">
                {movie.overview || 'Aucun synopsis disponible.'}
              </p>
              {movie.original_title !== movie.title && (
                <p className="movie-detail__original-title">
                  Titre original : {movie.original_title}
                </p>
              )}
            </div>
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
