import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Transport } from '@nestjs/microservices';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { Constants } from './common/constants';
import { join } from 'path';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const apiVersion = Constants.API_VERSION || '1';
  // Increase payload limit
  app.useBodyParser('json', { limit: '50mb' });
  app.useBodyParser('urlencoded', { extended: true, limit: '50mb' });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads/',
  });

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: apiVersion,
  });

  // Connect microservice (TCP)
  app.connectMicroservice({
    transport: Transport.TCP,
    options: { host: '0.0.0.0', port: 3005 },
  });

  app.enableCors({
    origin: '*', // allow all
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: false, // must be false
  });





  await app.startAllMicroservices(); // Start microservice
  await app.listen(process.env.PORT || 3004, '0.0.0.0');// Start REST API
  console.log('REST API running on port 3004');
  console.log('TCP Microservice running on port 3005');
}

bootstrap();
