/**
 * Metro configuration for a monorepo.
 *
 * Two adjustments are required because the app lives in `apps/mobile` while
 * its dependencies are hoisted to the repository root:
 *
 *   watchFolders     - lets Metro see (and hot-reload) the shared `packages/*`
 *                      sources, which ship TypeScript rather than build output.
 *   nodeModulesPaths - resolves modules from both the app's own node_modules
 *                      and the hoisted root one.
 *
 * `disableHierarchicalLookup` keeps resolution to exactly those two roots so a
 * stray nested node_modules cannot introduce a second copy of React.
 */
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

config.resolver.disableHierarchicalLookup = true;

module.exports = config;
