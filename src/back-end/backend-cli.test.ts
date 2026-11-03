import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addGenresFromCsv,
  cleanGenresFromDatabase,
  createProgram,
  initializeDatabase,
} from './backend-cli.ts';
import { listGenres, upsertGenres } from './database/genre-repository.ts';

const cliPath = fileURLToPath(new URL('./backend-cli.ts', import.meta.url));
const sampleGenresCsvPath = fileURLToPath(
  new URL('../../data/genres.csv', import.meta.url),
);
let temporaryDirectory = '';
let originalWorkingDirectory = '';

afterEach(() => {
  if (originalWorkingDirectory) {
    process.chdir(originalWorkingDirectory);
    originalWorkingDirectory = '';
  }
  if (temporaryDirectory) {
    rmSync(temporaryDirectory, { recursive: true, force: true });
    temporaryDirectory = '';
  }
});

function expectSQLiteDatabase(path: string): void {
  const database = new DatabaseSync(path);

  try {
    const result = database.prepare('SELECT sqlite_version() AS version').get();
    const tables = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
      )
      .all()
      .map((row) => row.name);

    expect(result?.version).toBeTypeOf('string');
    expect(tables).toEqual(
      expect.arrayContaining([
        'movies',
        'genres',
        'countries',
        'movie_genres',
        'movie_production_countries',
      ]),
    );
  } finally {
    database.close();
  }
}

describe('backend CLI', () => {
  it('imports all genres from the example CSV file', () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'backend-cli-'));
    const databasePath = join(temporaryDirectory, 'movies.sqlite');

    expect(
      addGenresFromCsv(sampleGenresCsvPath, databasePath).importedCount,
    ).toBe(19);
    const database = new DatabaseSync(databasePath);
    try {
      expect(listGenres(database)).toHaveLength(19);
    } finally {
      database.close();
    }
  });

  it('imports genres into the default database and reports the count and path', () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'backend-cli-'));
    originalWorkingDirectory = process.cwd();
    process.chdir(temporaryDirectory);
    const csvPath = join(temporaryDirectory, 'genres.csv');
    writeFileSync(csvPath, 'id,name\n18,Drama\n35,Comedy\n18,Drame\n');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    try {
      createProgram().parse(['add-genres', csvPath], { from: 'user' });

      expect(log).toHaveBeenCalledWith(
        `Imported 2 genres into ${join(temporaryDirectory, 'data/database.sqlite')}`,
      );
      const database = new DatabaseSync(
        join(temporaryDirectory, 'data/database.sqlite'),
      );
      try {
        expect(listGenres(database)).toEqual([
          { id: 18, name: 'Drame' },
          { id: 35, name: 'Comedy' },
        ]);
      } finally {
        database.close();
      }
    } finally {
      log.mockRestore();
    }
  });

  it('imports genres into a custom database selected before the command', () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'backend-cli-'));
    const csvPath = join(temporaryDirectory, 'genres.csv');
    const databasePath = join(temporaryDirectory, 'custom', 'movies.sqlite');
    writeFileSync(csvPath, 'name,id\nAdventure,12\n');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    try {
      createProgram().parse(['--path', databasePath, 'add-genres', csvPath], {
        from: 'user',
      });

      expect(log).toHaveBeenCalledWith(
        `Imported 1 genres into ${databasePath}`,
      );
      const database = new DatabaseSync(databasePath);
      try {
        expect(listGenres(database)).toEqual([{ id: 12, name: 'Adventure' }]);
      } finally {
        database.close();
      }
    } finally {
      log.mockRestore();
    }
  });

  it('validates the CSV before creating or opening the selected database', () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'backend-cli-'));
    const csvPath = join(temporaryDirectory, 'invalid.csv');
    const databasePath = join(
      temporaryDirectory,
      'not-created',
      'movies.sqlite',
    );
    writeFileSync(csvPath, 'id,title\n18,Drama\n');

    expect(() =>
      createProgram().parse(['--path', databasePath, 'add-genres', csvPath], {
        from: 'user',
      }),
    ).toThrow('header must contain exactly id and name');
    expect(existsSync(databasePath)).toBe(false);
  });

  it('rolls back a failed CSV import and closes the database connection', () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'backend-cli-'));
    const csvPath = join(temporaryDirectory, 'genres.csv');
    const databasePath = join(temporaryDirectory, 'movies.sqlite');
    writeFileSync(csvPath, 'id,name\n18,Drama\n35,Comedy\n');
    initializeDatabase(databasePath);

    const setup = new DatabaseSync(databasePath);
    setup.exec(`
      CREATE TRIGGER reject_comedy
      BEFORE INSERT ON genres
      WHEN NEW.tmdb_id = 35
      BEGIN
        SELECT RAISE(ABORT, 'genre rejected');
      END;
    `);
    setup.close();

    expect(() => addGenresFromCsv(csvPath, databasePath)).toThrow(
      'genre rejected',
    );
    const database = new DatabaseSync(databasePath);
    try {
      expect(listGenres(database)).toEqual([]);
      database.exec('DROP TRIGGER reject_comedy');
      upsertGenres(database, [{ id: 18, name: 'Drama' }]);
      expect(listGenres(database)).toEqual([{ id: 18, name: 'Drama' }]);
    } finally {
      database.close();
    }
  });

  it('removes only unassociated genres and reports the custom database path', () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'backend-cli-'));
    const databasePath = join(temporaryDirectory, 'movies.sqlite');
    initializeDatabase(databasePath);

    const setup = new DatabaseSync(databasePath);
    try {
      upsertGenres(setup, [
        { id: 12, name: 'Adventure' },
        { id: 18, name: 'Drama' },
      ]);
      setup
        .prepare(
          `INSERT INTO movies (
            tmdb_id, title, original_title, first_imported_at, observed_at
          ) VALUES (101, 'Film', 'Movie', '2024-01-01', '2024-01-01')`,
        )
        .run();
      setup
        .prepare(
          'INSERT INTO movie_genres (movie_id, genre_id) VALUES (101, 18)',
        )
        .run();
    } finally {
      setup.close();
    }

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      createProgram().parse(['--path', databasePath, 'clean-genres'], {
        from: 'user',
      });

      expect(log).toHaveBeenCalledWith(
        `Removed 1 unused genres from ${databasePath}`,
      );
      const database = new DatabaseSync(databasePath);
      try {
        expect(listGenres(database)).toEqual([{ id: 18, name: 'Drama' }]);
      } finally {
        database.close();
      }
    } finally {
      log.mockRestore();
    }
  });

  it('reports zero deleted genres when cleaning an empty database', () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'backend-cli-'));
    const databasePath = join(temporaryDirectory, 'movies.sqlite');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    try {
      const result = cleanGenresFromDatabase(databasePath);

      expect(result).toEqual({ deletedCount: 0, databasePath });
      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it('initializes a database when called as a module function', () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'backend-cli-'));
    const databasePath = join(temporaryDirectory, 'function', 'movies.sqlite');

    expect(initializeDatabase(databasePath)).toBe(databasePath);
    expectSQLiteDatabase(databasePath);
  });

  it('runs the command action when the CLI module is the process entry point', async () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'backend-cli-'));
    const customPath = join(temporaryDirectory, 'entrypoint', 'movies.sqlite');
    const originalArgv = process.argv;
    process.argv = [process.execPath, cliPath, '--path', customPath];
    vi.resetModules();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    try {
      await import('./backend-cli.ts');
      expect(log).toHaveBeenCalledWith(`Database initialized at ${customPath}`);
      expectSQLiteDatabase(customPath);
    } finally {
      process.argv = originalArgv;
      log.mockRestore();
    }
  });

  it('creates the initialized database at the default path', () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'backend-cli-'));

    const output = execFileSync(process.execPath, [cliPath], {
      cwd: temporaryDirectory,
      encoding: 'utf8',
    });

    expect(output).toContain(
      `Database initialized at ${join(temporaryDirectory, 'data/database.sqlite')}`,
    );
    expectSQLiteDatabase(join(temporaryDirectory, 'data/database.sqlite'));
  });

  it('creates the initialized database at the path passed with --path', () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'backend-cli-'));
    const customPath = join(temporaryDirectory, 'custom', 'custom.sqlite');

    const output = execFileSync(
      process.execPath,
      [cliPath, '--path', customPath],
      { encoding: 'utf8' },
    );

    expect(output).toContain(`Database initialized at ${customPath}`);
    expectSQLiteDatabase(customPath);
  });
});
