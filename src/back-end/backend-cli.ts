import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { Command } from 'commander';

const defaultDatabasePath = 'data/database.sqlite';

export function initializeDatabase(path: string): string {
  const databasePath = resolve(path);
  mkdirSync(dirname(databasePath), { recursive: true });

  const database = new DatabaseSync(databasePath);

  database.close();

  return databasePath;
}

const program = new Command();

program
  .name('backend-cli')
  .description('Create an empty SQLite database.')
  .option('-p, --path <path>', 'SQLite database file path', defaultDatabasePath)
  .action(() => {
    const { path } = program.opts<{ path: string }>();
    const databasePath = initializeDatabase(path);
    console.log(`Database initialized at ${databasePath}`);
  });

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  program.parse(process.argv);
}
