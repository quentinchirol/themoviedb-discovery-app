import type { DatabaseSync } from 'node:sqlite';

export type Genre = {
  id: number;
  name: string;
};

function toGenre(row: Record<string, unknown> | undefined): Genre | undefined {
  if (!row) return undefined;
  if (typeof row.tmdb_id !== 'number' || typeof row.name !== 'string') {
    throw new Error('Invalid genre row returned by SQLite');
  }

  return { id: row.tmdb_id, name: row.name };
}

export function findGenreById(
  database: DatabaseSync,
  id: number,
): Genre | undefined {
  const row = database
    .prepare('SELECT tmdb_id, name FROM genres WHERE tmdb_id = ?')
    .get(id);

  return toGenre(row);
}

export function listGenres(database: DatabaseSync): Genre[] {
  return database
    .prepare('SELECT tmdb_id, name FROM genres ORDER BY tmdb_id ASC')
    .all()
    .map((row) => {
      const genre = toGenre(row);
      if (!genre) throw new Error('SQLite returned an empty genre row');
      return genre;
    });
}

export function upsertGenres(
  database: DatabaseSync,
  genres: Iterable<Genre>,
): void {
  const uniqueGenres = new Map<number, Genre>();
  for (const genre of genres) uniqueGenres.set(genre.id, genre);
  if (uniqueGenres.size === 0) return;

  database.exec('BEGIN IMMEDIATE');
  try {
    const upsert = database.prepare(
      `INSERT INTO genres (tmdb_id, name) VALUES ($id, $name)
       ON CONFLICT(tmdb_id) DO UPDATE SET name = excluded.name`,
    );

    for (const genre of uniqueGenres.values()) {
      upsert.run({ $id: genre.id, $name: genre.name });
    }

    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}
