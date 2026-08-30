import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const templates = (...parts) => join(here, 'templates', ...parts);

const kebab = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const kebabError = 'Use kebab-case, e.g. "orders" or "payment-intents"';

/** Plop generators: `npm run gen:module` (api) and `npm run gen:feature` (web). */
export default function plop(plop) {
  plop.setGenerator('module', {
    description: 'Scaffold a NestJS domain module (mirror of modules/users)',
    prompts: [
      {
        type: 'input',
        name: 'name',
        message: 'domain name (kebab-case):',
        validate: (value) => (kebab.test(value) ? true : kebabError),
      },
    ],
    actions: [
      {
        type: 'add',
        path: 'apps/api/src/modules/{{name}}/{{name}}.module.ts',
        templateFile: templates('module', 'module.ts.hbs'),
      },
      {
        type: 'add',
        path: 'apps/api/src/modules/{{name}}/{{name}}.controller.ts',
        templateFile: templates('module', 'controller.ts.hbs'),
      },
      {
        type: 'add',
        path: 'apps/api/src/modules/{{name}}/{{name}}.service.ts',
        templateFile: templates('module', 'service.ts.hbs'),
      },
      {
        type: 'add',
        path: 'apps/api/src/modules/{{name}}/{{name}}.repository.ts',
        templateFile: templates('module', 'repository.ts.hbs'),
      },
      {
        type: 'add',
        path: 'apps/api/src/modules/{{name}}/dto/create-{{name}}.dto.ts',
        templateFile: templates('module', 'create-dto.ts.hbs'),
      },
      {
        type: 'add',
        path: 'apps/api/src/modules/{{name}}/dto/update-{{name}}.dto.ts',
        templateFile: templates('module', 'update-dto.ts.hbs'),
      },
      {
        type: 'add',
        path: 'apps/api/src/modules/{{name}}/dto/{{name}}-response.dto.ts',
        templateFile: templates('module', 'response-dto.ts.hbs'),
      },
      {
        type: 'add',
        path: 'apps/api/src/modules/{{name}}/__tests__/{{name}}.service.spec.ts',
        templateFile: templates('module', 'service.spec.ts.hbs'),
      },
      {
        type: 'add',
        path: 'apps/api/src/modules/{{name}}/README.md',
        templateFile: templates('module', 'README.md.hbs'),
      },
      `Module created. Register it in apps/api/src/app.module.ts, then run \`npm run gen:types\` if you added public DTOs.`,
    ],
  });

  plop.setGenerator('feature', {
    description: 'Scaffold a web feature (mirror of features/auth)',
    prompts: [
      {
        type: 'input',
        name: 'name',
        message: 'feature name (kebab-case):',
        validate: (value) => (kebab.test(value) ? true : kebabError),
      },
    ],
    actions: [
      {
        type: 'add',
        path: 'apps/web/src/features/{{name}}/index.ts',
        templateFile: templates('feature', 'index.ts.hbs'),
      },
      {
        type: 'add',
        path: 'apps/web/src/features/{{name}}/components/{{name}}-panel.tsx',
        templateFile: templates('feature', 'panel.tsx.hbs'),
      },
      {
        type: 'add',
        path: 'apps/web/src/features/{{name}}/hooks/use-{{name}}.ts',
        templateFile: templates('feature', 'hook.ts.hbs'),
      },
      {
        type: 'add',
        path: 'apps/web/src/features/{{name}}/api/{{name}}-api.ts',
        templateFile: templates('feature', 'api.ts.hbs'),
      },
      {
        type: 'add',
        path: 'apps/web/src/features/{{name}}/api/keys.ts',
        templateFile: templates('feature', 'keys.ts.hbs'),
      },
      {
        type: 'add',
        path: 'apps/web/src/features/{{name}}/schemas/{{name}}-schema.ts',
        templateFile: templates('feature', 'schema.ts.hbs'),
      },
      {
        type: 'add',
        path: 'apps/web/src/features/{{name}}/types.ts',
        templateFile: templates('feature', 'types.ts.hbs'),
      },
      {
        type: 'add',
        path: 'apps/web/src/features/{{name}}/__tests__/{{name}}-panel.test.tsx',
        templateFile: templates('feature', 'panel.test.tsx.hbs'),
      },
      {
        type: 'add',
        path: 'apps/web/src/features/{{name}}/README.md',
        templateFile: templates('feature', 'README.md.hbs'),
      },
      `Feature created. Compose it from a route in apps/web/src/app — import only via '@/features/{{name}}'.`,
    ],
  });
}
