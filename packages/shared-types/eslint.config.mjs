import node from '@monorepo/eslint-config/node';
import reactTests from '@monorepo/eslint-config/react-tests';

const config = [...node, ...reactTests];

export default config;
