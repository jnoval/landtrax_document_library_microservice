import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { InternalHttpModule } from '../internal-http.module.js';
import { EmailHttpClient } from '../email-http.client.js';
import { HttpService } from '@nestjs/axios';

describe('InternalHttpModule & axios peer dependency resolution', () => {
  it('declares axios in package.json dependencies so --legacy-peer-deps in Docker installs it', () => {
    const pkgPath = join(process.cwd(), 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

    expect(pkg.dependencies).toBeDefined();
    expect(pkg.dependencies['@nestjs/axios']).toBeDefined();
    expect(pkg.dependencies['axios']).toBeDefined();
  });

  it('resolves the axios package at runtime when loading @nestjs/axios', () => {
    expect(() => require.resolve('axios')).not.toThrow();
    expect(InternalHttpModule).toBeDefined();
  });

  it('sends audit export ready email via EmailHttpClient using HttpService', async () => {
    const prevUrl = process.env.MONOLITH_BASE_URL;
    process.env.MONOLITH_BASE_URL = 'http://monolith:5000';
    try {
      const httpService = new HttpService();
      const client = new EmailHttpClient(httpService);

      await client.sendAuditExportReadyEmail(
        { id: 'user-1' } as any,
        'https://example.com/export.csv',
        42,
      );

      expect(httpService.post).toHaveBeenCalledWith(
        'http://monolith:5000/internal/notify/audit-export-ready',
        { userId: 'user-1', downloadUrl: 'https://example.com/export.csv', recordCount: 42 },
        expect.any(Object),
      );
    } finally {
      process.env.MONOLITH_BASE_URL = prevUrl;
    }
  });
});
