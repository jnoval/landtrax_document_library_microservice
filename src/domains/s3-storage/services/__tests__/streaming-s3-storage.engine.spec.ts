import { PassThrough } from 'node:stream';
import { S3StreamingStorageEngine } from '../s3-streaming-storage.engine.js';

describe('S3StreamingStorageEngine', () => {
  const createFile = (content = 'document') => {
    const stream = new PassThrough();
    queueMicrotask(() => stream.end(Buffer.from(content)));
    return {
      stream,
      fieldname: 'files',
      originalname: 'deed of sale.pdf',
      encoding: '7bit',
      mimetype: 'application/pdf',
    } as any;
  };

  it('streams a file to S3 and never produces a memory buffer', async () => {
    const storageService = {
      uploadStream: jest.fn().mockResolvedValue({
        key: 'incoming/ocr/service-1/deed.pdf',
        publicURL: 'https://bucket.s3.amazonaws.com/incoming/ocr/service-1/deed.pdf',
      }),
      deleteFile: jest.fn(),
    } as any;
    const engine = new S3StreamingStorageEngine(storageService, () => 'incoming/ocr/service-1');

    const info = await new Promise<any>((resolve, reject) =>
      engine._handleFile({} as any, createFile(), (error, result) =>
        error ? reject(error) : resolve(result),
      ),
    );

    expect(storageService.uploadStream).toHaveBeenCalledWith(
      expect.objectContaining({ folder: 'incoming/ocr/service-1', mimeType: 'application/pdf' }),
    );
    expect(info).toEqual(expect.objectContaining({ key: expect.any(String), size: 8 }));
    expect(info.buffer).toBeUndefined();
  });

  it('removes a previously streamed object when Multer rolls the request back', async () => {
    const storageService = {
      uploadStream: jest.fn(),
      deleteFile: jest.fn().mockResolvedValue(undefined),
    } as any;
    const engine = new S3StreamingStorageEngine(storageService, () => 'incoming/ocr/service-1');

    await new Promise<void>((resolve, reject) =>
      engine._removeFile(
        {} as any,
        { key: 'incoming/ocr/service-1/deed.pdf' } as any,
        (error) => (error ? reject(error) : resolve()),
      ),
    );

    expect(storageService.deleteFile).toHaveBeenCalledWith('incoming/ocr/service-1/deed.pdf');
  });
});
