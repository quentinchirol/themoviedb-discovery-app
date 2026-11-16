import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseSchema } from './schema';
import { syncMoviesFromDiscover } from './movie';

let database: DatabaseSync | undefined;
let temporaryDirectory = '';

afterEach(() => {
  database?.close();
  database = undefined;
  if (temporaryDirectory) {
    rmSync(temporaryDirectory, { recursive: true, force: true });
    temporaryDirectory = '';
  }
});

function createTestDatabase(): DatabaseSync {
  database = new DatabaseSync(':memory:');
  createDatabaseSchema(database);
  return database;
}

function createTemporaryCsv(content?: string): string {
  temporaryDirectory = mkdtempSync(join(tmpdir(), 'movies-sync-'));
  const path = join(temporaryDirectory, 'movies.csv');
  if (content !== undefined) writeFileSync(path, content, 'utf8');
  return path;
}

function response(data: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(data),
  } as unknown as Response;
}

const movieDetails = (id: number) => ({
  id,
  title: `Film ${id}`,
  original_title: `Film original ${id}`,
  original_language: 'fr',
  overview: 'Une histoire, avec des guillemets "importants".',
  release_date: '2023-06-01',
  popularity: 12.5,
  vote_average: 7.4,
  vote_count: 100,
  poster_path: `/poster-${id}.jpg`,
  backdrop_path: `/backdrop-${id}.jpg`,
  runtime: 120,
  budget: 1000000,
  revenue: 2000000,
  genres: [{ id: 18, name: 'Drame' }],
  production_countries: [{ iso_3166_1: 'FR', name: 'France' }],
});

describe('movie repository', () => {
  it('fetches Discover pages and details, then updates the CSV and SQLite', async () => {
    const db = createTestDatabase();
    const csvPath = createTemporaryCsv(
      'id,title\n7,Existing movie\ninvalid,Ignored row\n',
    );
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({ results: [{ id: 7 }, { id: 8 }], total_pages: 2 }),
      )
      .mockResolvedValueOnce(response({ results: [{ id: 9 }], total_pages: 2 }))
      .mockResolvedValueOnce(response(movieDetails(7)))
      .mockResolvedValueOnce(response(movieDetails(8)))
      .mockResolvedValueOnce(response(movieDetails(9)));

    const movieCount = await syncMoviesFromDiscover({
      database: db,
      year: '2023',
      maxPages: 2,
      accessToken: 'test-token',
      csvPath,
      fetcher,
    });

    expect(movieCount).toBe(3);
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      'https://api.themoviedb.org/3/discover/movie?primary_release_year=2023&language=fr-FR&page=1&region=FR',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      'https://api.themoviedb.org/3/discover/movie?primary_release_year=2023&language=fr-FR&page=2&region=FR',
      expect.any(Object),
    );
    expect(
      db.prepare('SELECT tmdb_id, title FROM movies ORDER BY tmdb_id').all(),
    ).toEqual([
      { tmdb_id: 7, title: 'Film 7' },
      { tmdb_id: 8, title: 'Film 8' },
      { tmdb_id: 9, title: 'Film 9' },
    ]);
    expect(
      db.prepare('SELECT genre_id FROM movie_genres WHERE movie_id = 7').all(),
    ).toEqual([{ genre_id: 18 }]);
    expect(
      db
        .prepare(
          'SELECT country_code FROM movie_production_countries WHERE movie_id = 7',
        )
        .all(),
    ).toEqual([{ country_code: 'FR' }]);
    expect(readFileSync(csvPath, 'utf8')).toContain(
      '"[{""iso_3166_1"":""FR"",""name"":""France""}]"',
    );
    expect(readFileSync(csvPath, 'utf8')).toContain(
      '"Une histoire, avec des guillemets ""importants""."',
    );
  });

  it('uses the first Discover page by default and creates a CSV when none exists', async () => {
    const db = createTestDatabase();
    const csvPath = createTemporaryCsv();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({ results: [{ id: 21 }], total_pages: 3 }),
      )
      .mockResolvedValueOnce(response(movieDetails(21)));

    await syncMoviesFromDiscover({
      database: db,
      year: '2022',
      accessToken: 'test-token',
      csvPath,
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(readFileSync(csvPath, 'utf8').split('\n')[0]).toBe(
      'id,title,original_title,original_language,overview,release_date,popularity,vote_average,vote_count,poster_path,backdrop_path,runtime,budget,revenue,genres,production_countries',
    );
  });

  it('rejects invalid years and page limits before making requests', async () => {
    const db = createTestDatabase();
    const fetcher = vi.fn<typeof fetch>();
    const csvPath = createTemporaryCsv();

    await expect(
      syncMoviesFromDiscover({
        database: db,
        year: '0999',
        accessToken: 'test-token',
        csvPath,
        fetcher,
      }),
    ).rejects.toThrow('Year must be a 4-digit number between 1000 and 9999.');
    await expect(
      syncMoviesFromDiscover({
        database: db,
        year: '2023',
        maxPages: 0,
        accessToken: 'test-token',
        csvPath,
        fetcher,
      }),
    ).rejects.toThrow('maxPages must be a positive integer.');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not write the CSV or database when a TMDB request fails', async () => {
    const db = createTestDatabase();
    const csvPath = createTemporaryCsv('id,title\n1,Original\n');
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({}, false, 503));

    await expect(
      syncMoviesFromDiscover({
        database: db,
        year: '2023',
        accessToken: 'test-token',
        csvPath,
        fetcher,
      }),
    ).rejects.toThrow('TMDB API request failed with status 503');
    expect(readFileSync(csvPath, 'utf8')).toBe('id,title\n1,Original\n');
    expect(
      db.prepare('SELECT COUNT(*) AS count FROM movies').get()?.count,
    ).toBe(0);
  });

  it('removes its temporary CSV when SQLite rejects a movie upsert', async () => {
    const db = createTestDatabase();
    const csvPath = createTemporaryCsv();
    db.exec(
      "CREATE TRIGGER reject_movie BEFORE INSERT ON movies BEGIN SELECT RAISE(ABORT, 'rejected movie'); END",
    );
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({ results: [{ id: 33 }], total_pages: 1 }),
      )
      .mockResolvedValueOnce(response(movieDetails(33)));

    await expect(
      syncMoviesFromDiscover({
        database: db,
        year: '2023',
        accessToken: 'test-token',
        csvPath,
        fetcher,
      }),
    ).rejects.toThrow('rejected movie');
    expect(existsSync(`${csvPath}.tmp`)).toBe(false);
    expect(existsSync(csvPath)).toBe(false);
  });
});
