import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type MovieForStorage = {
  id: number;
  title: string;
  originalTitle: string;
  releaseDate: string | null;
  overview: string | null;
  originalLanguage: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  popularity: number | null;
  voteAverage: number | null;
  voteCount: number | null;
  runtime: number | null;
  budget: number | null;
  revenue: number | null;
  genres: Array<{ id: number; name: string }>;
  productionCountries: Array<{ code: string; name: string }>;
};

function moviesTableSql(tableName: string): string {
  return `CREATE TABLE ${tableName} (
    tmdb_id INTEGER PRIMARY KEY CHECK (tmdb_id > 0),
    title TEXT NOT NULL,
    original_title TEXT NOT NULL,
    release_date TEXT,
    release_year INTEGER GENERATED ALWAYS AS (
      CASE
        WHEN release_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
        THEN CAST(substr(release_date, 1, 4) AS INTEGER)
      END
    ) STORED,
    overview TEXT,
    original_language TEXT,
    poster_path TEXT,
    backdrop_path TEXT,
    popularity REAL CHECK (popularity IS NULL OR popularity >= 0),
    vote_average REAL CHECK (
      vote_average IS NULL OR (vote_average >= 0 AND vote_average <= 10)
    ),
    vote_count INTEGER CHECK (vote_count IS NULL OR vote_count >= 0),
    runtime INTEGER CHECK (runtime IS NULL OR runtime > 0),
    budget INTEGER CHECK (budget IS NULL OR budget > 0),
    revenue INTEGER CHECK (revenue IS NULL OR revenue > 0),
    first_imported_at TEXT NOT NULL,
    observed_at TEXT NOT NULL
  )`;
}

export const databaseSchema = `
  CREATE TABLE IF NOT EXISTS genres (
    tmdb_id INTEGER PRIMARY KEY CHECK (tmdb_id > 0),
    name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS countries (
    iso_3166_1 TEXT PRIMARY KEY CHECK (length(iso_3166_1) = 2),
    name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS movie_genres (
    movie_id INTEGER NOT NULL REFERENCES movies(tmdb_id) ON DELETE CASCADE,
    genre_id INTEGER NOT NULL REFERENCES genres(tmdb_id) ON DELETE RESTRICT,
    PRIMARY KEY (movie_id, genre_id)
  );

  CREATE TABLE IF NOT EXISTS movie_production_countries (
    movie_id INTEGER NOT NULL REFERENCES movies(tmdb_id) ON DELETE CASCADE,
    country_code TEXT NOT NULL REFERENCES countries(iso_3166_1) ON DELETE RESTRICT,
    PRIMARY KEY (movie_id, country_code)
  );

  CREATE INDEX IF NOT EXISTS idx_movies_release_date ON movies(release_date);
  CREATE INDEX IF NOT EXISTS idx_movie_genres_genre ON movie_genres(genre_id);
  CREATE INDEX IF NOT EXISTS idx_movie_countries_country
    ON movie_production_countries(country_code);
`;

export function createDatabaseSchema(database: DatabaseSync): void {
  database.exec('PRAGMA foreign_keys = OFF');

  try {
    database.exec('BEGIN IMMEDIATE');

    try {
      const moviesTable = database
        .prepare(
          "SELECT 1 AS movie_table_exists FROM sqlite_master WHERE type = 'table' AND name = 'movies'",
        )
        .get();

      if (!moviesTable) {
        database.exec(moviesTableSql('movies'));
      } else {
        const columns = database.prepare('PRAGMA table_xinfo(movies)').all();
        const hasReleaseYear = columns.some(
          (column) => column.name === 'release_year',
        );

        if (!hasReleaseYear) {
          database.exec(moviesTableSql('movies__migration'));
          database.exec(`
            INSERT INTO movies__migration (
              tmdb_id, title, original_title, release_date, overview,
              original_language, poster_path, backdrop_path, popularity,
              vote_average, vote_count, runtime, budget, revenue,
              first_imported_at, observed_at
            )
            SELECT
              tmdb_id, title, original_title, release_date, overview,
              original_language, poster_path, backdrop_path, popularity,
              vote_average, vote_count, runtime, budget, revenue,
              first_imported_at, observed_at
            FROM movies;
            DROP TABLE movies;
            ALTER TABLE movies__migration RENAME TO movies;
          `);
        }
      }

      database.exec(databaseSchema);
      database.exec('PRAGMA user_version = 1');
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  } finally {
    database.exec('PRAGMA foreign_keys = ON');
  }
}

export function openMoviesDatabase(path: string): DatabaseSync {
  const databasePath = resolve(path);
  mkdirSync(dirname(databasePath), { recursive: true });

  const database = new DatabaseSync(databasePath);
  try {
    createDatabaseSchema(database);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

export function upsertMovie(
  database: DatabaseSync,
  movie: MovieForStorage,
  observedAt = new Date().toISOString(),
): void {
  database.exec('BEGIN IMMEDIATE');

  try {
    database
      .prepare(
        `INSERT INTO movies (
          tmdb_id, title, original_title, release_date, overview,
          original_language, poster_path, backdrop_path, popularity,
          vote_average, vote_count, runtime, budget, revenue,
          first_imported_at, observed_at
        ) VALUES (
          $id, $title, $originalTitle, $releaseDate, $overview,
          $originalLanguage, $posterPath, $backdropPath, $popularity,
          $voteAverage, $voteCount, $runtime, $budget, $revenue,
          $observedAt, $observedAt
        )
        ON CONFLICT(tmdb_id) DO UPDATE SET
          title = excluded.title,
          original_title = excluded.original_title,
          release_date = excluded.release_date,
          overview = excluded.overview,
          original_language = excluded.original_language,
          poster_path = excluded.poster_path,
          backdrop_path = excluded.backdrop_path,
          popularity = excluded.popularity,
          vote_average = excluded.vote_average,
          vote_count = excluded.vote_count,
          runtime = excluded.runtime,
          budget = excluded.budget,
          revenue = excluded.revenue,
          observed_at = excluded.observed_at`,
      )
      .run({
        $id: movie.id,
        $title: movie.title,
        $originalTitle: movie.originalTitle,
        $releaseDate: movie.releaseDate,
        $overview: movie.overview,
        $originalLanguage: movie.originalLanguage,
        $posterPath: movie.posterPath,
        $backdropPath: movie.backdropPath,
        $popularity: movie.popularity,
        $voteAverage: movie.voteAverage,
        $voteCount: movie.voteCount,
        $runtime: movie.runtime,
        $budget: movie.budget,
        $revenue: movie.revenue,
        $observedAt: observedAt,
      });

    const insertGenre = database.prepare(
      `INSERT INTO genres (tmdb_id, name) VALUES ($id, $name)
       ON CONFLICT(tmdb_id) DO UPDATE SET name = excluded.name`,
    );
    const insertMovieGenre = database.prepare(
      'INSERT INTO movie_genres (movie_id, genre_id) VALUES ($movieId, $genreId)',
    );
    database
      .prepare('DELETE FROM movie_genres WHERE movie_id = ?')
      .run(movie.id);
    for (const genre of movie.genres) {
      insertGenre.run({ $id: genre.id, $name: genre.name });
      insertMovieGenre.run({ $movieId: movie.id, $genreId: genre.id });
    }

    const insertCountry = database.prepare(
      `INSERT INTO countries (iso_3166_1, name) VALUES ($code, $name)
       ON CONFLICT(iso_3166_1) DO UPDATE SET name = excluded.name`,
    );
    const insertMovieCountry = database.prepare(
      `INSERT INTO movie_production_countries (movie_id, country_code)
       VALUES ($movieId, $countryCode)`,
    );
    database
      .prepare('DELETE FROM movie_production_countries WHERE movie_id = ?')
      .run(movie.id);
    for (const country of movie.productionCountries) {
      insertCountry.run({ $code: country.code, $name: country.name });
      insertMovieCountry.run({
        $movieId: movie.id,
        $countryCode: country.code,
      });
    }

    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}
