import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  importCountries,
  initializeDatabase,
  removeUnusedCountries,
} from './backend-cli.ts';

const cliPath = fileURLToPath(new URL('./backend-cli.ts', import.meta.url));
let temporaryDirectory = '';

afterEach(() => {
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

  it('does not parse CLI arguments when imported without an entry-point path', async () => {
    const originalArgv = process.argv;
    process.argv = [process.execPath];
    vi.resetModules();

    try {
      await import('./backend-cli.ts');
    } finally {
      process.argv = originalArgv;
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

  it('imports countries from a CSV into the selected database and reports the count', () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'backend-cli-'));
    const csvPath = join(temporaryDirectory, 'countries.csv');
    const databasePath = join(temporaryDirectory, 'custom', 'movies.sqlite');
    writeFileSync(
      csvPath,
      'code,name\nFR,French Republic\nUS,United States\nFR,France\n',
    );

    const output = execFileSync(
      process.execPath,
      [cliPath, '--path', databasePath, 'add-countries', csvPath],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    writeFileSync(csvPath, 'code,name\nFR,Updated France\n');
    const updateOutput = execFileSync(
      process.execPath,
      [cliPath, '--path', databasePath, 'add-countries', csvPath],
      { encoding: 'utf8' },
    );
    const database = new DatabaseSync(databasePath);

    try {
      expect(output).toContain(`Imported 2 countries into ${databasePath}`);
      expect(updateOutput).toContain(`Imported 1 country into ${databasePath}`);
      expect(
        database
          .prepare('SELECT iso_3166_1, name FROM countries ORDER BY iso_3166_1')
          .all(),
      ).toEqual([
        { iso_3166_1: 'FR', name: 'Updated France' },
        { iso_3166_1: 'US', name: 'United States' },
      ]);
    } finally {
      database.close();
    }
  });

  it('validates the CSV before creating the database', () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'backend-cli-'));
    const csvPath = join(temporaryDirectory, 'invalid.csv');
    const databasePath = join(temporaryDirectory, 'not-created.sqlite');
    writeFileSync(csvPath, 'code,name\nfr,France\n');

    expect(() =>
      execFileSync(
        process.execPath,
        [cliPath, '--path', databasePath, 'add-countries', csvPath],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      ),
    ).toThrow();
    expect(existsSync(databasePath)).toBe(false);
  });

  it('reports the number of removed countries and preserves countries used by movies', () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'backend-cli-'));
    const databasePath = join(temporaryDirectory, 'movies.sqlite');
    initializeDatabase(databasePath);
    const database = new DatabaseSync(databasePath);

    try {
      database
        .prepare(
          "INSERT INTO countries (iso_3166_1, name) VALUES ('FR', 'France'), ('BE', 'Belgium')",
        )
        .run();
      database
        .prepare(
          `INSERT INTO movies (
            tmdb_id, title, original_title, first_imported_at, observed_at
          ) VALUES (1, 'Film', 'Film', 'now', 'now')`,
        )
        .run();
      database
        .prepare(
          'INSERT INTO movie_production_countries (movie_id, country_code) VALUES (1, ?)',
        )
        .run('FR');
    } finally {
      database.close();
    }

    const output = execFileSync(
      process.execPath,
      [cliPath, '--path', databasePath, 'clean-countries'],
      { encoding: 'utf8' },
    );
    const resultDatabase = new DatabaseSync(databasePath);

    try {
      expect(output).toContain(`Removed 1 unused country from ${databasePath}`);
      expect(
        resultDatabase.prepare('SELECT iso_3166_1 FROM countries').all(),
      ).toEqual([{ iso_3166_1: 'FR' }]);
    } finally {
      resultDatabase.close();
    }
  });

  it('rolls back the import and closes the database when an upsert fails', () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'backend-cli-'));
    const csvPath = join(temporaryDirectory, 'countries.csv');
    const databasePath = join(temporaryDirectory, 'movies.sqlite');
    initializeDatabase(databasePath);
    const database = new DatabaseSync(databasePath);

    try {
      database
        .prepare(
          "CREATE TRIGGER reject_us BEFORE INSERT ON countries WHEN NEW.iso_3166_1 = 'US' BEGIN SELECT RAISE(ABORT, 'rejected country'); END",
        )
        .run();
    } finally {
      database.close();
    }
    writeFileSync(csvPath, 'code,name\nFR,France\nUS,United States\n');

    expect(() =>
      execFileSync(
        process.execPath,
        [cliPath, '--path', databasePath, 'add-countries', csvPath],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      ),
    ).toThrow();

    const resultDatabase = new DatabaseSync(databasePath);
    try {
      expect(
        resultDatabase.prepare('SELECT iso_3166_1 FROM countries').all(),
      ).toEqual([]);
    } finally {
      resultDatabase.close();
    }
  });

  it('imports countries through the module function and closes the database after a failed import', () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'backend-cli-'));
    const csvPath = join(temporaryDirectory, 'countries.csv');
    const databasePath = join(temporaryDirectory, 'movies.sqlite');
    initializeDatabase(databasePath);
    writeFileSync(csvPath, 'code,name\nFR,France\nUS,United States\n');

    expect(importCountries(csvPath, databasePath)).toEqual({
      databasePath,
      countryCount: 2,
    });

    const database = new DatabaseSync(databasePath);
    try {
      database
        .prepare(
          "CREATE TRIGGER reject_gb BEFORE INSERT ON countries WHEN NEW.iso_3166_1 = 'GB' BEGIN SELECT RAISE(ABORT, 'rejected country'); END",
        )
        .run();
    } finally {
      database.close();
    }

    writeFileSync(csvPath, 'code,name\nGB,United Kingdom\n');
    expect(() => importCountries(csvPath, databasePath)).toThrow(
      'rejected country',
    );

    const resultDatabase = new DatabaseSync(databasePath);
    try {
      expect(
        resultDatabase
          .prepare('SELECT iso_3166_1 FROM countries ORDER BY iso_3166_1')
          .all(),
      ).toEqual([{ iso_3166_1: 'FR' }, { iso_3166_1: 'US' }]);
    } finally {
      resultDatabase.close();
    }
  });

  it('removes unused countries through the module function', () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'backend-cli-'));
    const databasePath = join(temporaryDirectory, 'movies.sqlite');
    initializeDatabase(databasePath);
    const database = new DatabaseSync(databasePath);

    try {
      database
        .prepare(
          "INSERT INTO countries (iso_3166_1, name) VALUES ('FR', 'France')",
        )
        .run();
    } finally {
      database.close();
    }

    expect(removeUnusedCountries(databasePath)).toEqual({
      databasePath,
      countryCount: 1,
    });
  });

  it('runs the country subcommands as CLI entry points and reports singular and plural counts', async () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'backend-cli-'));
    const csvPath = join(temporaryDirectory, 'countries.csv');
    const databasePath = join(temporaryDirectory, 'movies.sqlite');
    const originalArgv = process.argv;
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    try {
      writeFileSync(csvPath, 'code,name\nFR,France\nBE,Belgium\n');
      process.argv = [
        process.execPath,
        cliPath,
        '--path',
        databasePath,
        'add-countries',
        csvPath,
      ];
      vi.resetModules();
      await import('./backend-cli.ts');
      expect(log).toHaveBeenLastCalledWith(
        `Imported 2 countries into ${databasePath}`,
      );

      writeFileSync(csvPath, 'code,name\nFR,France\n');
      process.argv = [
        process.execPath,
        cliPath,
        '--path',
        databasePath,
        'add-countries',
        csvPath,
      ];
      vi.resetModules();
      await import('./backend-cli.ts');
      expect(log).toHaveBeenLastCalledWith(
        `Imported 1 country into ${databasePath}`,
      );

      const database = new DatabaseSync(databasePath);
      try {
        database
          .prepare(
            `INSERT INTO movies (
              tmdb_id, title, original_title, first_imported_at, observed_at
            ) VALUES (1, 'Film', 'Film', 'now', 'now')`,
          )
          .run();
        database
          .prepare(
            'INSERT INTO movie_production_countries (movie_id, country_code) VALUES (1, ?)',
          )
          .run('FR');
      } finally {
        database.close();
      }

      process.argv = [
        process.execPath,
        cliPath,
        '--path',
        databasePath,
        'clean-countries',
      ];
      vi.resetModules();
      await import('./backend-cli.ts');
      expect(log).toHaveBeenLastCalledWith(
        `Removed 1 unused country from ${databasePath}`,
      );

      process.argv = [
        process.execPath,
        cliPath,
        '--path',
        databasePath,
        'clean-countries',
      ];
      vi.resetModules();
      await import('./backend-cli.ts');
      expect(log).toHaveBeenLastCalledWith(
        `Removed 0 unused countries from ${databasePath}`,
      );
    } finally {
      process.argv = originalArgv;
      log.mockRestore();
    }
  });
});
