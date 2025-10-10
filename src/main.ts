import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Transport } from '@nestjs/microservices';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule); // REST API

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  // Connect microservice (TCP)
  app.connectMicroservice({
    transport: Transport.TCP,
    options: { host: '0.0.0.0', port: 3005 },
  });

  await app.startAllMicroservices(); // Start microservice
  await app.listen(3004); // Start REST API
  console.log('REST API running on port 3004');
  console.log('TCP Microservice running on port 3005');
}

bootstrap();
