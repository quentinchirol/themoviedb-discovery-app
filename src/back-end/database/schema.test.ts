import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import {
  createDatabaseSchema,
  upsertMovie,
  type MovieForStorage,
} from './schema';

function createTestDatabase(): DatabaseSync {
  const database = new DatabaseSync(':memory:');
  createDatabaseSchema(database);
  return database;
}

const movie: MovieForStorage = {
  id: 101,
  title: 'Film exemple',
  originalTitle: 'Example Movie',
  releaseDate: '2020-06-15',
  overview: 'Résumé',
  originalLanguage: 'en',
  posterPath: '/poster.jpg',
  backdropPath: '/backdrop.jpg',
  popularity: 12.5,
  voteAverage: 8,
  voteCount: 100,
  runtime: 120,
  budget: 100,
  revenue: 300,
  genres: [
    { id: 18, name: 'Drame' },
    { id: 12, name: 'Aventure' },
  ],
  productionCountries: [
    { code: 'FR', name: 'France' },
    { code: 'BE', name: 'Belgique' },
  ],
};

describe('SQLite movie dashboard schema', () => {
  it('creates normalized tables with primary keys and foreign keys', () => {
    const database = createTestDatabase();

    try {
      const version = database
        .prepare('SELECT sqlite_version() AS version')
        .get();
      const tables = database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
        )
        .all()
        .map((row) => row.name);

      expect(version?.version).toBeTypeOf('string');
      expect(tables).toEqual(
        expect.arrayContaining([
          'movies',
          'genres',
          'countries',
          'movie_genres',
          'movie_production_countries',
        ]),
      );
      expect(
        database
          .prepare('PRAGMA foreign_key_list(movie_genres)')
          .all()
          .map((row) => row.table),
      ).toEqual(expect.arrayContaining(['movies', 'genres']));
      expect(database.prepare('PRAGMA foreign_keys').get()?.foreign_keys).toBe(
        1,
      );
      expect(() =>
        database
          .prepare(
            'INSERT INTO movie_genres (movie_id, genre_id) VALUES (999, 999)',
          )
          .run(),
      ).toThrow();
    } finally {
      database.close();
    }
  });

  it('upserts a movie and its relationships atomically without deleting other films', () => {
    const database = createTestDatabase();
    try {
      upsertMovie(database, movie, '2024-01-01T00:00:00.000Z');
      upsertMovie(
        database,
        {
          ...movie,
          title: 'Film actualisé',
          genres: [{ id: 35, name: 'Comédie' }],
          productionCountries: [{ code: 'CA', name: 'Canada' }],
        },
        '2025-01-01T00:00:00.000Z',
      );
      upsertMovie(
        database,
        { ...movie, id: 202, releaseDate: '2023-02-01' },
        '2025-01-02T00:00:00.000Z',
      );

      expect(
        database.prepare('SELECT COUNT(*) AS count FROM movies').get()?.count,
      ).toBe(2);
      expect(
        database
          .prepare('SELECT title, observed_at FROM movies WHERE tmdb_id = 101')
          .get(),
      ).toEqual({
        title: 'Film actualisé',
        observed_at: '2025-01-01T00:00:00.000Z',
      });
      expect(
        database
          .prepare('SELECT genre_id FROM movie_genres WHERE movie_id = 101')
          .all(),
      ).toEqual([{ genre_id: 35 }]);
      expect(
        database
          .prepare(
            'SELECT country_code FROM movie_production_countries WHERE movie_id = 101',
          )
          .all(),
      ).toEqual([{ country_code: 'CA' }]);
      expect(
        database
          .prepare(
            'SELECT COUNT(*) AS count FROM movie_genres WHERE movie_id = 202',
          )
          .get()?.count,
      ).toBe(2);
      expect(() =>
        upsertMovie(database, {
          ...movie,
          id: 303,
          genres: [
            { id: 91, name: 'Genre temporaire' },
            { id: 91, name: 'Genre temporaire' },
          ],
          productionCountries: [],
        }),
      ).toThrow();
      expect(
        database
          .prepare('SELECT tmdb_id FROM movies WHERE tmdb_id = 303')
          .get(),
      ).toBeUndefined();
      expect(
        database.prepare('SELECT tmdb_id FROM genres WHERE tmdb_id = 91').get(),
      ).toBeUndefined();
    } finally {
      database.close();
    }
  });

  it('keeps unavailable metrics null and rejects zero duration, budget, or revenue', () => {
    const database = createTestDatabase();
    try {
      expect(() =>
        upsertMovie(
          database,
          { ...movie, runtime: 0 },
          '2025-01-01T00:00:00.000Z',
        ),
      ).toThrow();
      expect(() =>
        upsertMovie(
          database,
          { ...movie, budget: 0 },
          '2025-01-01T00:00:00.000Z',
        ),
      ).toThrow();
      expect(() =>
        upsertMovie(
          database,
          { ...movie, revenue: 0 },
          '2025-01-01T00:00:00.000Z',
        ),
      ).toThrow();

      upsertMovie(
        database,
        {
          ...movie,
          popularity: null,
          voteAverage: null,
          voteCount: null,
          runtime: null,
          budget: null,
          revenue: null,
          genres: [],
          productionCountries: [],
        },
        '2025-01-01T00:00:00.000Z',
      );
      expect(
        database
          .prepare(
            'SELECT popularity, vote_average, vote_count, runtime, budget, revenue FROM movies WHERE tmdb_id = 101',
          )
          .get(),
      ).toEqual({
        popularity: null,
        vote_average: null,
        vote_count: null,
        runtime: null,
        budget: null,
        revenue: null,
      });
    } finally {
      database.close();
    }
  });
});
