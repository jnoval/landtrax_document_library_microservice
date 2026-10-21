import { GetObjectCommandOutput } from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';

// Global AWS SDK mocks
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({})),
  PutObjectCommand: jest.fn(),
  GetObjectCommand: jest.fn(),
  DeleteObjectCommand: jest.fn(),
  HeadObjectCommand: jest.fn(),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://signed-url.example.com'),
}));

// Mock data constants
const TEST_AWS_ACCESS_KEY_ID = 'test-access-key-id';
const TEST_AWS_SECRET_ACCESS_KEY = 'test-secret-access-key';
const TEST_AWS_REGION = 'us-east-1';
const TEST_AWS_S3_BUCKET = 'test-bucket';
export const TEST_S3_KEY = 'test-folder/test-file.pdf';
const TEST_PUBLIC_URL = `https://${TEST_AWS_S3_BUCKET}.s3.${TEST_AWS_REGION}.amazonaws.com/${TEST_S3_KEY}`;
const TEST_SIGNED_URL = 'https://signed-url.example.com';
const MAX_FILE_SIZE = 40 * 1024 * 1024; // 40MB

// Mock Express.Multer.File factory
export const createMockMulterFile = (
  overrides: Partial<Express.Multer.File> = {},
): Express.Multer.File => ({
  fieldname: 'file',
  originalname: 'test-document.pdf',
  encoding: '7bit',
  mimetype: 'application/pdf',
  buffer: Buffer.from('test file content'),
  size: 1024,
  stream: {} as any,
  destination: '',
  filename: '',
  path: '',
  ...overrides,
});

// Mock ConfigService factory
export const createMockConfigService = (overrides: Record<string, any> = {}) => ({
  get: jest.fn((key: string) => {
    const defaultValues: Record<string, string | undefined> = {
      AWS_ACCESS_KEY_ID: TEST_AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: TEST_AWS_SECRET_ACCESS_KEY,
      AWS_REGION: TEST_AWS_REGION,
      AWS_S3_BUCKET: TEST_AWS_S3_BUCKET,
      ...overrides,
    };
    return defaultValues[key];
  }),
});

// Mock S3Client factory
export const createMockS3Client = () => ({
  send: jest.fn(),
  config: {
    region: 'us-east-1',
    credentials: {
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
    },
  },
  middlewareStack: {
    add: jest.fn(),
    clone: jest.fn(),
    remove: jest.fn(),
    removeByTag: jest.fn(),
    use: jest.fn(),
    concat: jest.fn(),
  },
  endpointProvider: jest.fn(),
  region: 'us-east-1',
});

// Mock AWS SDK commands
const createMockPutObjectCommand = () => ({
  constructor: jest.fn(),
});

const createMockGetObjectCommand = () => ({
  constructor: jest.fn(),
});

const createMockDeleteObjectCommand = () => ({
  constructor: jest.fn(),
});

const createMockHeadObjectCommand = () => ({
  constructor: jest.fn(),
});

// Mock getSignedUrl function
const mockGetSignedUrl = jest.fn();

// AWS SDK Error mocks
export const createAWSError = (name: string, message: string, statusCode?: number) => ({
  name,
  message,
  $metadata: {
    httpStatusCode: statusCode || 500,
  },
});

export const createS3PermanentRedirectError = () =>
  createAWSError(
    'PermanentRedirect',
    'The bucket you are attempting to access must be addressed using the specified endpoint',
  );

export const createS3NotFoundError = () => createAWSError('NotFound', 'Not Found', 404);

// Mock S3 responses
export const createMockS3UploadResponse = () => ({
  $metadata: { httpStatusCode: 200 },
});

export const createMockS3GetResponse = (): GetObjectCommandOutput => ({
  $metadata: { httpStatusCode: 200 },
  Body: Readable.from([
    Buffer.from('test file content'),
  ]) as unknown as GetObjectCommandOutput['Body'],
  ContentType: 'application/pdf',
  ContentLength: 1024,
});

export const createMockS3DeleteResponse = () => ({
  $metadata: { httpStatusCode: 200 },
});

export const createMockS3HeadResponse = () => ({
  $metadata: { httpStatusCode: 200 },
});

// Test data factories
export const createTestUploadParams = (overrides: any = {}) => ({
  file: createMockMulterFile(),
  folder: 'test-folder',
  fileName: undefined,
  ...overrides,
});

const createTestUploadResponse = (overrides: any = {}) => ({
  key: TEST_S3_KEY,
  publicURL: TEST_PUBLIC_URL,
  fileSize: 1024,
  mimeType: 'application/pdf',
  ...overrides,
});

// Environment variable test scenarios
const createIncompleteConfigScenarios = () => [
  { AWS_ACCESS_KEY_ID: undefined, description: 'missing access key' },
  { AWS_SECRET_ACCESS_KEY: undefined, description: 'missing secret key' },
  { AWS_S3_BUCKET: undefined, description: 'missing bucket' },
  { AWS_REGION: undefined, description: 'missing region' },
];

const createInvalidConfigScenarios = () => [
  { AWS_ACCESS_KEY_ID: '', description: 'empty access key' },
  { AWS_SECRET_ACCESS_KEY: '', description: 'empty secret key' },
  { AWS_S3_BUCKET: '', description: 'empty bucket' },
  { AWS_REGION: '', description: 'empty region' },
];

// File size test scenarios
const createFileSizeScenarios = () => [
  { size: 1024, description: 'small file (1KB)' },
  { size: MAX_FILE_SIZE, description: 'maximum file (40MB)' },
  { size: MAX_FILE_SIZE + 1, description: 'oversized file (40MB + 1)', shouldFail: true },
];

// URL parsing test scenarios
const createUrlParsingScenarios = () => [
  {
    input: 'https://test-bucket.s3.us-east-1.amazonaws.com/folder/file.pdf',
    expected: 'folder/file.pdf',
    description: 'virtual hosted style URL',
  },
  {
    input: 'https://s3.us-east-1.amazonaws.com/test-bucket/folder/file.pdf',
    expected: 'folder/file.pdf',
    description: 'path style URL',
  },
  {
    input: 'folder/file.pdf',
    expected: 'folder/file.pdf',
    description: 'already a key',
  },
  {
    input: 'invalid-url',
    expected: 'invalid-url',
    description: 'malformed URL fallback',
  },
];
