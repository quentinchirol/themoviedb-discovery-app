import type { Movie } from '../../back-end/schemas/MoviesTypes';

export type MovieDetails = Pick<
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

type MovieDetailCardProps = {
  movie: MovieDetails;
};

export default function MovieDetailCard({ movie }: MovieDetailCardProps) {
  return (
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
  );
}
