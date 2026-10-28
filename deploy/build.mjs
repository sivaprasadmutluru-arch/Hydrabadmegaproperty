import { createRequire } from 'node:module';
import { realpathSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const require = createRequire(realpathSync('node_modules/drizzle-kit/package.json'));
const { build } = require('esbuild');
mkdirSync('deploy/build', {recursive:true});
await build({
  entryPoints:['deploy/server.ts'], outfile:'deploy/build/server.mjs',
  bundle:true, platform:'node', format:'esm', target:'node24',
  plugins:[{name:'standalone-database',setup(build){build.onResolve({filter:/\/db\/index$/},args=>resolve(args.resolveDir,args.path)===resolve('db/index')?{path:resolve('deploy/node-db.ts')}:undefined);}}],
  banner:{js:'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);'},
  logLevel:'info',
});
