import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { createGlobalValidationPipe } from '../../common/pipes/validation.pipe';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../prisma/prisma.service';
import { FakePrisma } from '../fakes/fake-prisma';

export interface TestApp {
  app: INestApplication;
  prisma: FakePrisma;
}

/**
 * Boots the full AppModule against an in-memory FakePrisma, mirroring the
 * production middleware that matters for cookie-based auth flows.
 */
export async function createTestApp(): Promise<TestApp> {
  const prisma = new FakePrisma();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .compile();

  const app = moduleRef.createNestApplication();
  // Mirror the production global middleware from main.ts.
  app.use(cookieParser());
  app.useGlobalPipes(createGlobalValidationPipe());
  await app.init();
  return { app, prisma };
}
