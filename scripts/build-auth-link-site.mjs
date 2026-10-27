export * from '../link-host/build.mjs';

import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { runBuildFromEnvironment } from '../link-host/build.mjs';

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) await runBuildFromEnvironment();
