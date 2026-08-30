import web from '@monorepo/eslint-config/web';
import reactTests from '@monorepo/eslint-config/react-tests';

const config = [...web, ...reactTests];

export default config;
