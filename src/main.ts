import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import fastifyCookie from '@fastify/cookie';
import fastifyFormbody from '@fastify/formbody';
import { AppModule } from './app.module';
import { env } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  // Cookies httpOnly pour le JWT (un seul modèle d'auth)
  await app.register(fastifyCookie as never, { secret: env.JWT_SECRET });

  // Parse application/x-www-form-urlencoded (webhooks CinetPay)
  await app.register(fastifyFormbody as never);

  // CORS : origines depuis l'env (zéro hardcode)
  app.enableCors({
    origin: env.CORS_ORIGINS.split(',').map((o) => o.trim()),
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Swagger (docs API pour l'UI Lovable)
  const config = new DocumentBuilder()
    .setTitle('Kalamon API')
    .setDescription('Backend tuteur IA éducatif — auth, élève, parent, Kalamon (RAG), quiz')
    .setVersion('0.1.0')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));

  await app.listen({ port: env.PORT, host: '0.0.0.0' });
  // eslint-disable-next-line no-console
  console.log(`🚀 Kalamon API sur le port ${env.PORT} — docs: /docs`);
}

void bootstrap();
