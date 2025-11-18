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

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  app.useStaticAssets(join(__dirname, '..', 'Uploads'), {
    prefix: '/v1/uploads/',
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
  origin: ['http://localhost:3002','http://localhost:3003'],
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  credentials: true,
});



  await app.startAllMicroservices(); // Start microservice
  await app.listen(3004); // Start REST API
  console.log('REST API running on port 3004');
  console.log('TCP Microservice running on port 3005');
}

bootstrap();
