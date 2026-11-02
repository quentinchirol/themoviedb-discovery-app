import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../backend-cli.ts';

let temporaryDirectory = '';

afterEach(() => {
  if (temporaryDirectory) {
    rmSync(temporaryDirectory, { recursive: true, force: true });
    temporaryDirectory = '';
  }
});

describe('empty SQLite database', () => {
  it('opens successfully without creating application tables', () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'sqlite-schema-'));
    const databasePath = join(temporaryDirectory, 'database.sqlite');
    initializeDatabase(databasePath);
    const database = new DatabaseSync(databasePath);

    try {
      const version = database
        .prepare('SELECT sqlite_version() AS version')
        .get();
      const tables = database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
        )
        .all();

      expect(version?.version).toBeTypeOf('string');
      expect(tables).toEqual([]);
    } finally {
      database.close();
    }
  });
});
