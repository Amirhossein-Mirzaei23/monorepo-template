import path from 'node:path';
import prettierConfig from 'eslint-config-prettier';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';
import base, { commonIgnores } from './base.js';

const ALIAS_FEATURE_PREFIX = '@/features/';
const FEATURES_DIR_NAME = 'features';

/**
 * Enforces the feature-boundary rules from doc/ARCHITECTURE.md:
 * - A feature may only be imported through its public barrel (`@/features/<name>`).
 * - Deep imports into another feature's internals are errors.
 * - Relative imports that resolve into a *different* feature are errors.
 * - Relative self-imports inside the same feature are always fine.
 */
const noCrossFeatureImports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Forbid imports that cross feature boundaries (barrel-only access)',
    },
    schema: [],
    messages: {
      barrelOnly:
        "Deep import into feature '{{name}}' is not allowed — import from its barrel '@/features/{{name}}' instead.",
      relativeCrossFeature:
        "Relative import into feature '{{name}}' is not allowed — import from its barrel '@/features/{{name}}' instead.",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (!filename || path.basename(filename) === path.sep) return {};

    const currentFeature = featureNameFromPath(filename);

    /** Resolves `<feature>` for a path inside `src/features/<feature>/…`, else null. */
    function featureNameFromPath(p) {
      const parts = p.split(path.sep);
      const idx = parts.lastIndexOf(FEATURES_DIR_NAME);
      if (idx === -1 || idx + 1 >= parts.length) return null;
      const name = parts[idx + 1];
      return name.length > 0 ? name : null;
    }

    function checkSource(node, raw) {
      if (typeof raw !== 'string' || raw.length === 0) return;

      // Alias imports: only the exact barrel path is allowed.
      if (raw.startsWith(ALIAS_FEATURE_PREFIX)) {
        const rest = raw.slice(ALIAS_FEATURE_PREFIX.length);
        const name = rest.split('/')[0];
        if (rest !== name && rest !== `${name}/index`) {
          context.report({ node, messageId: 'barrelOnly', data: { name } });
        }
        return;
      }

      // Relative imports: resolve, and if they land inside another feature (or deep
      // inside any feature from outside `features/`), they must point at the barrel.
      if (raw.startsWith('.')) {
        const resolved = path.resolve(path.dirname(filename), raw);
        const targetFeature = featureNameFromPath(resolved);
        if (!targetFeature) return;

        if (currentFeature === targetFeature) return; // self-import inside own feature

        const featuresRootIdx = resolved.lastIndexOf(`${path.sep}${FEATURES_DIR_NAME}${path.sep}`);
        const relativeToFeaturesRoot = resolved.substring(
          featuresRootIdx + FEATURES_DIR_NAME.length + 2,
        );
        const isBarrel =
          relativeToFeaturesRoot === targetFeature ||
          relativeToFeaturesRoot === `${targetFeature}${path.sep}index`;

        if (!isBarrel) {
          context.report({
            node,
            messageId: 'relativeCrossFeature',
            data: { name: targetFeature },
          });
        }
      }
    }

    return {
      ImportDeclaration: (node) => checkSource(node, node.source?.value),
      ExportNamedDeclaration: (node) => checkSource(node, node.source?.value),
      ExportAllDeclaration: (node) => checkSource(node, node.source?.value),
      ImportExpression: (node) => checkSource(node, node.source?.value),
    };
  },
};

const monorepoPlugin = {
  rules: {
    'no-cross-feature-imports': noCrossFeatureImports,
  },
};

/** Web preset: base + Next.js core-web-vitals + jsx-a11y + feature boundaries. */
export default [
  {
    ignores: commonIgnores,
  },
  ...base,
  ...nextCoreWebVitals,
  {
    files: ['**/*.{js,jsx,mjs,cjs,ts,tsx}'],
    // jsx-a11y itself is registered by eslint-config-next (same instance for all
    // web files) — re-registering it here would be a config error. We only layer
    // the full recommended a11y rule set on top (task 3.11).
    plugins: {
      monorepo: monorepoPlugin,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      'monorepo/no-cross-feature-imports': 'error',
      ...jsxA11y.flatConfigs.recommended.rules,
    },
  },
  // Node-context files inside the web app (route handlers, config, middleware, scripts)
  {
    files: [
      'next.config.*',
      'jest.config.*',
      'jest.setup.*',
      'src/middleware.ts',
      'src/instrumentation.ts',
      'src/app/api/**/*.ts',
      'src/lib/logger.ts',
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  // Prettier last again: next's preset must not fight the formatter.
  prettierConfig,
];
