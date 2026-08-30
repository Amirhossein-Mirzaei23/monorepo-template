import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const builder = new DocumentBuilder()
    .setTitle('Monorepo Template API')
    .setDescription(
      'Reference API for the monorepo template. Auth: JWT bearer (access token); ' +
        'refresh tokens are rotated server-side via the httpOnly `refresh_token` cookie.',
    )
    .setVersion('0.1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .build();

  return SwaggerModule.createDocument(app, builder);
}
