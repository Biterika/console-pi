const { 
  parseCookies, 
  formatBytes, 
  isValidUsername, 
  isValidPassword,
  sanitizePath 
} = require('../../../src/utils/helpers');

describe('helpers', () => {
  describe('parseCookies', () => {
    test('parses valid cookie string', () => {
      const result = parseCookies('session=abc123; theme=dark');
      expect(result).toEqual({ session: 'abc123', theme: 'dark' });
    });

    test('returns empty object for empty string', () => {
      expect(parseCookies('')).toEqual({});
    });

    test('returns empty object for null/undefined', () => {
      expect(parseCookies(null)).toEqual({});
      expect(parseCookies(undefined)).toEqual({});
    });

    test('handles whitespace', () => {
      const result = parseCookies('  session=abc  ;  theme=dark  ');
      expect(result).toEqual({ session: 'abc', theme: 'dark' });
    });
  });

  describe('formatBytes', () => {
    test('formats bytes', () => {
      expect(formatBytes(500)).toBe('500 B');
    });

    test('formats kilobytes', () => {
      expect(formatBytes(1536)).toBe('1.5 KB');
    });

    test('formats megabytes', () => {
      expect(formatBytes(1572864)).toBe('1.5 MB');
    });

    test('formats gigabytes', () => {
      expect(formatBytes(1610612736)).toBe('1.5 GB');
    });
  });

  describe('isValidUsername', () => {
    test('accepts valid usernames', () => {
      expect(isValidUsername('john')).toBe(true);
      expect(isValidUsername('john_doe')).toBe(true);
      expect(isValidUsername('john-doe')).toBe(true);
      expect(isValidUsername('john123')).toBe(true);
    });

    test('rejects invalid usernames', () => {
      expect(isValidUsername('jo')).toBe(false); // too short
      expect(isValidUsername('a'.repeat(33))).toBe(false); // too long
      expect(isValidUsername('john doe')).toBe(false); // space
      expect(isValidUsername('john@doe')).toBe(false); // special char
      expect(isValidUsername('')).toBe(false);
    });
  });

  describe('isValidPassword', () => {
    test('accepts valid passwords', () => {
      expect(isValidPassword('1234')).toBe(true);
      expect(isValidPassword('password123')).toBe(true);
    });

    test('rejects invalid passwords', () => {
      expect(isValidPassword('123')).toBe(false); // too short
      expect(isValidPassword('')).toBe(false);
      expect(isValidPassword(null)).toBe(false);
      expect(isValidPassword(123)).toBe(false); // not string
    });
  });

  describe('sanitizePath', () => {
    test('keeps valid paths', () => {
      expect(sanitizePath('/root')).toBe('/root');
      expect(sanitizePath('/root/projects')).toBe('/root/projects');
    });

    test('removes directory traversal', () => {
      expect(sanitizePath('/root/../etc/passwd')).toBe('/root/etc/passwd');
      expect(sanitizePath('../../etc/passwd')).toBe('/etc/passwd');
    });

    test('removes null bytes', () => {
      expect(sanitizePath('/root\0/test')).toBe('/root/test');
    });

    test('normalizes path', () => {
      expect(sanitizePath('/root//projects///test')).toBe('/root/projects/test');
    });
  });
});
