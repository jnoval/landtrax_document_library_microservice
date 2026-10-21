import { registerAs } from '@nestjs/config';

export default registerAs('aws', () => ({
  region:
    process.env.AWS_REGION ||
    process.env.AWS_DEFAULT_REGION ||
    process.env.AWS_BEDROCK_REGION ||
    'ap-southeast-1',
  accessKeyId:
    process.env.AWS_ACCESS_KEY_ID ||
    process.env.AWS_ACCESS_KEY ||
    process.env.AWS_BEDROCK_ACCESS_KEY_ID,
  secretAccessKey:
    process.env.AWS_SECRET_ACCESS_KEY ||
    process.env.AWS_SECRET_KEY ||
    process.env.AWS_BEDROCK_SECRET_ACCESS_KEY,
  s3: {
    bucketName:
      process.env.AWS_S3_BUCKET_NAME ||
      process.env.AWS_S3_BUCKET ||
      process.env.AWS_BUCKET_NAME ||
      'landtrax',
  },
  textract: {
    // any specific textract configs
  },
  bedrock: {
    modelId: process.env.BEDROCK_MODEL_ID || 'global.amazon.nova-2-lite-v1:0',
  },
}));
