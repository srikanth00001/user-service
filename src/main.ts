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
  origin: [
    'http://localhost:3001',       // local frontend
    'http://localhost:3002',       // local admin
    'http://localhost:3003',
    'http://localhost:3004',

    'http://157.245.100.99',       // frontend via port 80
    'http://157.245.100.99:80',

    'http://157.245.100.99:81',    // admin panel
    'http://157.245.100.99:85',    // auth
    'http://157.245.100.99:86',    // user service
  ],

  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  credentials: true,
});




  await app.startAllMicroservices(); // Start microservice
  await app.listen(process.env.PORT || 3004, '0.0.0.0');// Start REST API
  console.log('REST API running on port 3004');
  console.log('TCP Microservice running on port 3005');
}

bootstrap();
