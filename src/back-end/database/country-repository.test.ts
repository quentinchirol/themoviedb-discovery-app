import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseSchema } from './schema';
import {
  cleanUnusedCountries,
  findCountryByCode,
  listCountries,
  upsertCountries,
  type Country,
} from './country-repository';

let database: DatabaseSync;

afterEach(() => {
  database?.close();
});

function createTestDatabase(): DatabaseSync {
  database = new DatabaseSync(':memory:');
  createDatabaseSchema(database);
  return database;
}

describe('country repository', () => {
  it('rejects rows that do not match the Country type', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`
        CREATE TABLE countries (iso_3166_1, name);
        INSERT INTO countries VALUES (123, 'Invalid code');
      `);

      expect(() => listCountries(db)).toThrow(
        'Invalid country row returned by SQLite',
      );
    } finally {
      db.close();
    }
  });

  it('finds an existing country and returns undefined for a missing code', () => {
    const db = createTestDatabase();
    upsertCountries(db, [{ code: 'FR', name: 'France' }]);

    expect(findCountryByCode(db, 'FR')).toEqual({
      code: 'FR',
      name: 'France',
    });
    expect(findCountryByCode(db, 'BE')).toBeUndefined();
  });

  it('returns an empty list when no countries are stored', () => {
    const db = createTestDatabase();

    expect(listCountries(db)).toEqual([]);
  });

  it('lists countries in ascending code order', () => {
    const db = createTestDatabase();
    upsertCountries(db, [
      { code: 'US', name: 'United States' },
      { code: 'BE', name: 'Belgium' },
      { code: 'FR', name: 'France' },
    ]);

    expect(listCountries(db)).toEqual([
      { code: 'BE', name: 'Belgium' },
      { code: 'FR', name: 'France' },
      { code: 'US', name: 'United States' },
    ]);
  });

  it('inserts and updates countries without duplicating existing codes', () => {
    const db = createTestDatabase();
    upsertCountries(db, [{ code: 'FR', name: 'French Republic' }]);
    upsertCountries(db, [
      { code: 'FR', name: 'France' },
      { code: 'BE', name: 'Belgium' },
    ]);

    expect(findCountryByCode(db, 'FR')).toEqual({
      code: 'FR',
      name: 'France',
    });
    expect(listCountries(db)).toEqual([
      { code: 'BE', name: 'Belgium' },
      { code: 'FR', name: 'France' },
    ]);
    expect(
      db.prepare('SELECT COUNT(*) AS count FROM countries').get()?.count,
    ).toBe(2);
  });

  it('accepts arrays, sets, and generators', () => {
    const db = createTestDatabase();
    const countries = new Set<Country>([
      { code: 'FR', name: 'France' },
      { code: 'BE', name: 'Belgium' },
    ]);
    function* countryGenerator(): Generator<Country> {
      yield { code: 'US', name: 'United States' };
    }

    upsertCountries(db, countries);
    upsertCountries(db, countryGenerator());

    expect(listCountries(db)).toEqual([
      { code: 'BE', name: 'Belgium' },
      { code: 'FR', name: 'France' },
      { code: 'US', name: 'United States' },
    ]);
  });

  it('does not modify data for an empty iterable', () => {
    const db = createTestDatabase();
    upsertCountries(db, [{ code: 'FR', name: 'France' }]);

    upsertCountries(db, []);

    expect(listCountries(db)).toEqual([{ code: 'FR', name: 'France' }]);
  });

  it('keeps the last name when a country code appears repeatedly', () => {
    const db = createTestDatabase();
    upsertCountries(db, [
      { code: 'FR', name: 'French Republic' },
      { code: 'FR', name: 'France' },
      { code: 'BE', name: 'Belgium' },
    ]);

    expect(listCountries(db)).toEqual([
      { code: 'BE', name: 'Belgium' },
      { code: 'FR', name: 'France' },
    ]);
  });

  it('rolls back all country updates when an invalid code is rejected', () => {
    const db = createTestDatabase();

    expect(() =>
      upsertCountries(db, [
        { code: 'FR', name: 'France' },
        { code: 'USA', name: 'United States' },
      ]),
    ).toThrow();
    expect(listCountries(db)).toEqual([]);
  });

  it('removes only countries that have no movie production association', () => {
    const db = createTestDatabase();
    upsertCountries(db, [
      { code: 'FR', name: 'France' },
      { code: 'BE', name: 'Belgium' },
    ]);
    db.prepare(
      `INSERT INTO movies (
        tmdb_id, title, original_title, first_imported_at, observed_at
      ) VALUES (1, 'Film', 'Film', 'now', 'now')`,
    ).run();
    db.prepare(
      'INSERT INTO movie_production_countries (movie_id, country_code) VALUES (1, ?)',
    ).run('FR');

    expect(cleanUnusedCountries(db)).toBe(1);
    expect(listCountries(db)).toEqual([{ code: 'FR', name: 'France' }]);
  });
});
