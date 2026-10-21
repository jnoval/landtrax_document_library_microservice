import { config } from 'dotenv';
process.env.TZ = 'Asia/Manila';
config({ path: ['.env'] });

import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
  );
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  const httpPort = Number(process.env.PORT) || 5022;
  const tcpPort = Number(process.env.TCP_PORT) || 5023;

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.TCP,
    options: {
      host: '0.0.0.0',
      port: tcpPort,
    },
  });

  const isKafkaEnabled = process.env.KAFKA_ENABLED === 'true';

  if (isKafkaEnabled) {
    const kafkaBrokers = (process.env.KAFKA_BROKERS || 'localhost:9092')
      .split(',')
      .map((b) => b.trim())
      .filter(Boolean);

    app.connectMicroservice<MicroserviceOptions>({
      transport: Transport.KAFKA,
      options: {
        client: {
          brokers: kafkaBrokers,
          clientId: process.env.KAFKA_CLIENT_ID || 'document-lib-microservice',
          retry: {
            retries: 10,
            initialRetryTime: 300,
            maxRetryTime: 5000,
          },
        },
        consumer: {
          groupId: process.env.KAFKA_GROUP_ID || 'document-lib-consumer',
          allowAutoTopicCreation: true,
        },
        subscribe: {
          fromBeginning: false,
        },
      },
    });
  }

  // Swagger Documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Document Library Microservice')
    .setDescription('APIs for Document, Tag, and S3 Storage management')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT',
    )
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('swagger', app, swaggerDocument);

  try {
    await app.startAllMicroservices();
  } catch (error: unknown) {
    console.warn(
      `Warning: Failed to start one or more microservice transports: ${(error as Error)?.message}`,
    );
  }

  await app.listen(httpPort);

  console.log(
    `Document Library Microservice running on HTTP port ${httpPort} and TCP port ${tcpPort}`,
  );
}

void bootstrap();
