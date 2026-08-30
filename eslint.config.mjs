// Root config for root-invoked lint runs (lint-staged, editors). Canonical
// per-workspace configs live in apps/* and packages/* — `npm run lint` uses those.
import node from '@monorepo/eslint-config/node';

export default node;
