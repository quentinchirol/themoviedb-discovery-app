import type { DatabaseSync } from 'node:sqlite';

export type Country = {
  code: string;
  name: string;
};

function toCountry(
  row: Record<string, unknown> | undefined,
): Country | undefined {
  if (!row) return undefined;
  return toCountryRow(row);
}

function toCountryRow(row: Record<string, unknown>): Country {
  if (typeof row.iso_3166_1 !== 'string' || typeof row.name !== 'string') {
    throw new Error('Invalid country row returned by SQLite');
  }

  return { code: row.iso_3166_1, name: row.name };
}

export function findCountryByCode(
  database: DatabaseSync,
  code: string,
): Country | undefined {
  const row = database
    .prepare('SELECT iso_3166_1, name FROM countries WHERE iso_3166_1 = ?')
    .get(code);

  return toCountry(row);
}

export function listCountries(database: DatabaseSync): Country[] {
  return database
    .prepare('SELECT iso_3166_1, name FROM countries ORDER BY iso_3166_1 ASC')
    .all()
    .map(toCountryRow);
}

export function upsertCountries(
  database: DatabaseSync,
  countries: Iterable<Country>,
): void {
  const uniqueCountries = new Map<string, Country>();
  for (const country of countries) uniqueCountries.set(country.code, country);
  if (uniqueCountries.size === 0) return;

  database.exec('BEGIN IMMEDIATE');
  try {
    const upsert = database.prepare(
      `INSERT INTO countries (iso_3166_1, name) VALUES ($code, $name)
       ON CONFLICT(iso_3166_1) DO UPDATE SET name = excluded.name`,
    );

    for (const country of uniqueCountries.values()) {
      upsert.run({ $code: country.code, $name: country.name });
    }

    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}
