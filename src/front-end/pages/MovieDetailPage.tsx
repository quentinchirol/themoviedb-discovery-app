import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { DEFAULT_LANGUAGE } from '../../back-end/constants';
import MovieDetailCard, {
  type MovieDetails,
} from '../components/MovieDetailCard';
import './MovieDetailPage.css';

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
        <MovieDetailCard movie={movie} />
      ) : (
        <p className="status-message" role="status">
          Chargement du film…
        </p>
      )}
    </main>
  );
}
