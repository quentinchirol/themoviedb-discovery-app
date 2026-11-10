import { parse } from 'csv-parse/sync';
import type { Country } from './country-repository.ts';

export function parseCountriesCsv(content: string): Country[] {
  const records = parse(content, {
    bom: true,
    relax_column_count: true,
    skip_empty_lines: true,
    trim: true,
  });
  const [header, ...rows] = records;

  if (!header) {
    throw new Error('CSV must contain the code and name headers');
  }

  const normalizedHeader = header.map((value: string) => value.toLowerCase());
  if (
    normalizedHeader.length !== 2 ||
    normalizedHeader.filter((value: string) => value === 'code').length !== 1 ||
    normalizedHeader.filter((value: string) => value === 'name').length !== 1
  ) {
    throw new Error('CSV headers must be exactly code and name');
  }

  const codeIndex = normalizedHeader.indexOf('code');
  const nameIndex = normalizedHeader.indexOf('name');

  return rows.flatMap((row: string[], index: number) => {
    if (row.every((value) => value === '')) return [];
    if (row.length !== 2) {
      throw new Error(`CSV row ${index + 2} must contain exactly two values`);
    }

    const code = row[codeIndex];
    const name = row[nameIndex];
    if (!/^[A-Z]{2}$/.test(code)) {
      throw new Error(`CSV row ${index + 2} has an invalid country code`);
    }
    if (!name) {
      throw new Error(`CSV row ${index + 2} has an empty country name`);
    }

    return [{ code, name }];
  });
}
