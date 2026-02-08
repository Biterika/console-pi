const request = require('supertest');
const app = require('../../../src/app');

describe('Auth API', () => {
  describe('POST /api/login', () => {
    test('returns 400 for missing credentials', async () => {
      const res = await request(app)
        .post('/api/login')
        .send({});
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    test('returns 401 for invalid credentials', async () => {
      const res = await request(app)
        .post('/api/login')
        .send({ username: 'nonexistent', password: 'wrong' });
      
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/me', () => {
    test('returns 401 without auth', async () => {
      const res = await request(app).get('/api/me');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/logout', () => {
    test('returns ok even without session', async () => {
      const res = await request(app).post('/api/logout');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });
});
