import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createDatabaseSchema,
  openMoviesDatabase,
  upsertMovie,
  type MovieForStorage,
} from './schema';

let temporaryDirectory = '';

afterEach(() => {
  if (temporaryDirectory) {
    rmSync(temporaryDirectory, { recursive: true, force: true });
    temporaryDirectory = '';
  }
});

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
  it('creates a database and its schema at a nested path', () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'sqlite-schema-'));
    const databasePath = join(temporaryDirectory, 'nested', 'movies.sqlite');
    const database = openMoviesDatabase(databasePath);

    try {
      expect(
        database
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'movies'",
          )
          .get(),
      ).toEqual({ name: 'movies' });
    } finally {
      database.close();
    }
  });

  it('closes and propagates errors when schema creation fails', () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'sqlite-schema-'));
    const databasePath = join(temporaryDirectory, 'invalid.sqlite');
    const invalidDatabase = new DatabaseSync(databasePath);
    invalidDatabase.exec(
      'CREATE TABLE movies (tmdb_id INTEGER PRIMARY KEY, title TEXT NOT NULL)',
    );
    invalidDatabase.close();

    expect(() => openMoviesDatabase(databasePath)).toThrow();

    const database = new DatabaseSync(databasePath);
    try {
      expect(
        database
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'genres'",
          )
          .get(),
      ).toBeUndefined();
    } finally {
      database.close();
    }
  });

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

  it('stores the release year derived from the release date and updates it with the date', () => {
    const database = createTestDatabase();
    try {
      upsertMovie(database, movie, '2024-01-01T00:00:00.000Z');

      expect(
        database
          .prepare(
            'SELECT release_date, release_year FROM movies WHERE tmdb_id = 101',
          )
          .get(),
      ).toEqual({ release_date: '2020-06-15', release_year: 2020 });
      expect(
        database
          .prepare("PRAGMA table_xinfo('movies')")
          .all()
          .find((column) => column.name === 'release_year')?.hidden,
      ).toBe(3);

      upsertMovie(
        database,
        { ...movie, releaseDate: '2024-01-01' },
        '2025-01-01T00:00:00.000Z',
      );
      expect(
        database
          .prepare('SELECT release_year FROM movies WHERE tmdb_id = 101')
          .get()?.release_year,
      ).toBe(2024);
    } finally {
      database.close();
    }
  });

  it('migrates an existing database while preserving its movies and relationships', () => {
    const database = new DatabaseSync(':memory:');
    try {
      database.exec(`
        PRAGMA foreign_keys = ON;
        CREATE TABLE movies (
          tmdb_id INTEGER PRIMARY KEY,
          title TEXT NOT NULL,
          original_title TEXT NOT NULL,
          release_date TEXT,
          overview TEXT,
          original_language TEXT,
          poster_path TEXT,
          backdrop_path TEXT,
          popularity REAL,
          vote_average REAL,
          vote_count INTEGER,
          runtime INTEGER,
          budget INTEGER,
          revenue INTEGER,
          first_imported_at TEXT NOT NULL,
          observed_at TEXT NOT NULL
        );
        CREATE TABLE genres (tmdb_id INTEGER PRIMARY KEY, name TEXT NOT NULL);
        CREATE TABLE countries (
          iso_3166_1 TEXT PRIMARY KEY,
          name TEXT NOT NULL
        );
        CREATE TABLE movie_genres (
          movie_id INTEGER NOT NULL REFERENCES movies(tmdb_id) ON DELETE CASCADE,
          genre_id INTEGER NOT NULL REFERENCES genres(tmdb_id) ON DELETE RESTRICT,
          PRIMARY KEY (movie_id, genre_id)
        );
        CREATE TABLE movie_production_countries (
          movie_id INTEGER NOT NULL REFERENCES movies(tmdb_id) ON DELETE CASCADE,
          country_code TEXT NOT NULL REFERENCES countries(iso_3166_1) ON DELETE RESTRICT,
          PRIMARY KEY (movie_id, country_code)
        );
        INSERT INTO movies (
          tmdb_id, title, original_title, release_date, first_imported_at,
          observed_at
        ) VALUES (101, 'Film existant', 'Existing movie', '2020-06-15', '2024-01-01', '2024-01-01');
        INSERT INTO genres VALUES (18, 'Drame');
        INSERT INTO countries VALUES ('FR', 'France');
        INSERT INTO movie_genres VALUES (101, 18);
        INSERT INTO movie_production_countries VALUES (101, 'FR');
      `);

      createDatabaseSchema(database);

      expect(
        database
          .prepare('SELECT title, release_year FROM movies WHERE tmdb_id = 101')
          .get(),
      ).toEqual({ title: 'Film existant', release_year: 2020 });
      expect(
        database
          .prepare('SELECT genre_id FROM movie_genres WHERE movie_id = 101')
          .all(),
      ).toEqual([{ genre_id: 18 }]);
      expect(
        database
          .prepare(
            'SELECT country_code FROM movie_production_countries WHERE movie_id = 101',
          )
          .all(),
      ).toEqual([{ country_code: 'FR' }]);
      expect(database.prepare('PRAGMA foreign_keys').get()?.foreign_keys).toBe(
        1,
      );
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      database.close();
    }
  });

  it('rolls back and propagates an initialization error', () => {
    const database = new DatabaseSync(':memory:');
    try {
      database.exec(`
        CREATE TABLE movies (tmdb_id INTEGER PRIMARY KEY, title TEXT NOT NULL);
        INSERT INTO movies VALUES (101, 'Existing movie');
      `);

      expect(() => createDatabaseSchema(database)).toThrow();
      expect(
        database
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
          )
          .all(),
      ).toEqual([{ name: 'movies' }]);
      expect(database.prepare('SELECT * FROM movies').all()).toEqual([
        { tmdb_id: 101, title: 'Existing movie' },
      ]);
      expect(database.prepare('PRAGMA foreign_keys').get()?.foreign_keys).toBe(
        1,
      );
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
