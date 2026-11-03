import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseSchema } from './schema';
import {
  findGenreById,
  listGenres,
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
});
