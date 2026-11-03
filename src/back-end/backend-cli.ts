import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Command } from 'commander';
import { openMoviesDatabase } from './database/schema.ts';

const defaultDatabasePath = 'data/database.sqlite';

export function initializeDatabase(path: string): string {
  const databasePath = resolve(path);
  const database = openMoviesDatabase(databasePath);
  database.close();

  return databasePath;
}

const program = new Command();

program
  .name('backend-cli')
  .description('Initialize the SQLite movie database schema.')
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
