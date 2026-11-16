import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseSchema } from './schema';
import {
  findGenreById,
  listGenres,
  cleanUnusedGenres,
  upsertGenres,
  type Genre,
} from './genre-repository';

let database: DatabaseSync;

afterEach(() => {
  database?.close();
});

function createTestDatabase(): DatabaseSync {
  database = new DatabaseSync(':memory:');
  createDatabaseSchema(database);
  return database;
}

describe('genre repository', () => {
  it('rejects rows that do not match the Genre type', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`
        CREATE TABLE genres (tmdb_id, name);
        INSERT INTO genres VALUES ('invalid-id', 123);
      `);
      createDatabaseSchema(db);

      expect(() => listGenres(db)).toThrow(
        'Invalid genre row returned by SQLite',
      );
    } finally {
      db.close();
    }
  });

  it('finds an existing genre and returns undefined for a missing genre', () => {
    const db = createTestDatabase();
    upsertGenres(db, [{ id: 18, name: 'Drame' }]);

    expect(findGenreById(db, 18)).toEqual({ id: 18, name: 'Drame' });
    expect(findGenreById(db, 99)).toBeUndefined();
  });

  it('lists genres in ascending identifier order', () => {
    const db = createTestDatabase();
    upsertGenres(db, [
      { id: 35, name: 'Comédie' },
      { id: 12, name: 'Aventure' },
      { id: 18, name: 'Drame' },
    ]);

    expect(listGenres(db)).toEqual([
      { id: 12, name: 'Aventure' },
      { id: 18, name: 'Drame' },
      { id: 35, name: 'Comédie' },
    ]);
  });

  it('inserts and updates genres without creating duplicate identifiers', () => {
    const db = createTestDatabase();
    upsertGenres(db, [{ id: 18, name: 'Drama' }]);
    upsertGenres(db, [
      { id: 18, name: 'Drame' },
      { id: 35, name: 'Comédie' },
    ]);

    expect(findGenreById(db, 18)).toEqual({ id: 18, name: 'Drame' });
    expect(listGenres(db)).toEqual([
      { id: 18, name: 'Drame' },
      { id: 35, name: 'Comédie' },
    ]);
    expect(
      db.prepare('SELECT COUNT(*) AS count FROM genres').get()?.count,
    ).toBe(2);
  });

  it('accepts sets and generators as well as arrays', () => {
    const db = createTestDatabase();
    const set = new Set<Genre>([{ id: 12, name: 'Aventure' }]);
    function* genreGenerator(): Generator<Genre> {
      yield { id: 18, name: 'Drame' };
    }

    upsertGenres(db, set);
    upsertGenres(db, genreGenerator());

    expect(listGenres(db)).toEqual([
      { id: 12, name: 'Aventure' },
      { id: 18, name: 'Drame' },
    ]);
  });

  it('does not modify data for an empty iterable', () => {
    const db = createTestDatabase();
    upsertGenres(db, [{ id: 18, name: 'Drame' }]);

    upsertGenres(db, []);

    expect(listGenres(db)).toEqual([{ id: 18, name: 'Drame' }]);
  });

  it('keeps the last name when an identifier appears repeatedly', () => {
    const db = createTestDatabase();
    upsertGenres(db, [
      { id: 18, name: 'Drama' },
      { id: 18, name: 'Drame' },
      { id: 35, name: 'Comédie' },
    ]);

    expect(listGenres(db)).toEqual([
      { id: 18, name: 'Drame' },
      { id: 35, name: 'Comédie' },
    ]);
  });

  it('rejects a genre without a name and rolls back the batch', () => {
    const db = createTestDatabase();
    const invalidGenre = { id: 18, name: null } as unknown as Genre;

    expect(() =>
      upsertGenres(db, [{ id: 12, name: 'Aventure' }, invalidGenre]),
    ).toThrow();
    expect(listGenres(db)).toEqual([]);
  });

  it('removes only genres not associated with a movie and returns the count', () => {
    const db = createTestDatabase();
    upsertGenres(db, [
      { id: 12, name: 'Aventure' },
      { id: 18, name: 'Drame' },
      { id: 35, name: 'Comédie' },
    ]);
    db.prepare(
      `INSERT INTO movies (
        tmdb_id, title, original_title, first_imported_at, observed_at
      ) VALUES (101, 'Film', 'Movie', '2024-01-01', '2024-01-01')`,
    ).run();
    db.prepare(
      'INSERT INTO movie_genres (movie_id, genre_id) VALUES (101, 18)',
    ).run();

    expect(cleanUnusedGenres(db)).toBe(2);
    expect(listGenres(db)).toEqual([{ id: 18, name: 'Drame' }]);
    expect(cleanUnusedGenres(db)).toBe(0);
  });

  it('rolls back genre cleanup when SQLite rejects a deletion', () => {
    const db = createTestDatabase();
    upsertGenres(db, [{ id: 18, name: 'Drame' }]);
    db.exec(`
      CREATE TRIGGER reject_genre_delete
      BEFORE DELETE ON genres
      BEGIN
        SELECT RAISE(ABORT, 'delete rejected');
      END;
    `);

    expect(() => cleanUnusedGenres(db)).toThrow('delete rejected');
    expect(listGenres(db)).toEqual([{ id: 18, name: 'Drame' }]);
  });
});
