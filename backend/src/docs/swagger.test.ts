import { describe, it, expect } from 'vitest';
import { swaggerDocument } from './swagger';

describe('Swagger / OpenAPI Specification', () => {
  it('has valid OpenAPI 3.0 basic metadata', () => {
    expect(swaggerDocument.openapi).toBe('3.0.3');
    expect(swaggerDocument.info.title).toContain('Ministry of Agriculture');
    expect(swaggerDocument.paths).toBeDefined();
  });

  it('documents critical API endpoints', () => {
    const paths = Object.keys(swaggerDocument.paths);
    expect(paths).toContain('/api/health');
    expect(paths).toContain('/api/auth/login');
    expect(paths).toContain('/api/items');
    expect(paths).toContain('/api/items/stock-out');
    expect(paths).toContain('/api/items/transfer');
    expect(paths).toContain('/api/roles');
    expect(paths).toContain('/api/settings');
  });

  it('declares BearerAuth security scheme', () => {
    expect(swaggerDocument.components.securitySchemes.BearerAuth).toBeDefined();
    expect(swaggerDocument.components.securitySchemes.BearerAuth.type).toBe('http');
    expect(swaggerDocument.components.securitySchemes.BearerAuth.scheme).toBe('bearer');
  });
});
