const { 
  hashPassword, 
  verifyPassword, 
  generateToken,
  generateSessionId 
} = require('../../../src/services/crypto');

describe('crypto', () => {
  describe('hashPassword', () => {
    test('hashes password with salt', async () => {
      const hash = await hashPassword('mypassword');
      expect(hash).toContain(':');
      expect(hash.length).toBeGreaterThan(100);
    });

    test('produces different hashes for same password', async () => {
      const hash1 = await hashPassword('mypassword');
      const hash2 = await hashPassword('mypassword');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifyPassword', () => {
    test('verifies correct password', async () => {
      const hash = await hashPassword('mypassword');
      const result = await verifyPassword('mypassword', hash);
      expect(result).toBe(true);
    });

    test('rejects incorrect password', async () => {
      const hash = await hashPassword('mypassword');
      const result = await verifyPassword('wrongpassword', hash);
      expect(result).toBe(false);
    });

    test('returns false for invalid hash format', async () => {
      const result = await verifyPassword('password', 'invalid-hash');
      expect(result).toBe(false);
    });
  });

  describe('generateToken', () => {
    test('generates hex string of correct length', () => {
      const token = generateToken(32);
      expect(token.length).toBe(64); // 32 bytes = 64 hex chars
      expect(/^[a-f0-9]+$/.test(token)).toBe(true);
    });

    test('generates unique tokens', () => {
      const token1 = generateToken();
      const token2 = generateToken();
      expect(token1).not.toBe(token2);
    });
  });

  describe('generateSessionId', () => {
    test('generates session ID starting with s', () => {
      const id = generateSessionId();
      expect(id.startsWith('s')).toBe(true);
    });

    test('generates unique IDs', () => {
      const id1 = generateSessionId();
      const id2 = generateSessionId();
      expect(id1).not.toBe(id2);
    });
  });
});
