import { describe, expect, it } from 'vitest';
import { parseGenresCsv } from './genre-csv-parser';

describe('parseGenresCsv', () => {
  it('parses exact headers case-insensitively in either order', () => {
    expect(parseGenresCsv('ID,Name\n18,Drama')).toEqual([
      { id: 18, name: 'Drama' },
    ]);
    expect(parseGenresCsv('name,Id\nDrama,18')).toEqual([
      { id: 18, name: 'Drama' },
    ]);
  });

  it('supports BOM, CRLF, quoted commas, escaped quotes, and empty lines', () => {
    const csv = '\uFEFFid,name\r\n\r\n16,"Sci-fi, ""Space"""\r\n';

    expect(parseGenresCsv(csv)).toEqual([{ id: 16, name: 'Sci-fi, "Space"' }]);
  });

  it('rejects empty input and headers other than exactly id and name', () => {
    expect(() => parseGenresCsv('')).toThrow('must contain an id,name header');
    expect(() => parseGenresCsv('id')).toThrow(
      'header must contain exactly id and name',
    );
    expect(() => parseGenresCsv('id,name,extra\n1,Drama,x')).toThrow(
      'header must contain exactly id and name',
    );
    expect(() => parseGenresCsv('id,ID\n1,Drama')).toThrow(
      'header must contain exactly id and name',
    );
    expect(() => parseGenresCsv('id,title\n1,Drama')).toThrow(
      'header must contain exactly id and name',
    );
  });

  it('rejects malformed rows and CSV syntax', () => {
    expect(() => parseGenresCsv('id,name\n1')).toThrow(
      'Invalid genres CSV syntax',
    );
    expect(() => parseGenresCsv('id,name\n1,Drama,extra')).toThrow(
      'Invalid genres CSV syntax',
    );
    expect(() => parseGenresCsv('id,name\n1,"unterminated')).toThrow(
      'Invalid genres CSV syntax',
    );
  });

  it('rejects invalid, non-positive, or unsafe identifiers', () => {
    for (const id of ['0', '-1', '+1', '1.2', '1e2', '9007199254740992']) {
      expect(() => parseGenresCsv(`id,name\n${id},Drama`)).toThrow(
        'positive safe integer',
      );
    }
  });

  it('rejects empty or whitespace-only names', () => {
    expect(() => parseGenresCsv('id,name\n1,')).toThrow(
      'name must not be empty',
    );
    expect(() => parseGenresCsv('id,name\n1,"   "')).toThrow(
      'name must not be empty',
    );
  });

  it('returns an empty genre list when the header has no data rows', () => {
    expect(parseGenresCsv('id,name\n\n')).toEqual([]);
  });
});
