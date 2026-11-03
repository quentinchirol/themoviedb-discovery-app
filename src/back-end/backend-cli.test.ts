import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';

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
