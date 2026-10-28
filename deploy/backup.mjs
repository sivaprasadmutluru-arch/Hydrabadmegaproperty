import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
const db = new DatabaseSync(process.env.DATABASE_PATH || '/data/expo.sqlite', {readOnly:true});
mkdirSync('/data/backups',{recursive:true});
const file='/data/backups/expo-'+new Date().toISOString().replaceAll(':','-')+'.sqlite';
db.prepare('VACUUM INTO ?').run(file);
db.close();
console.log(file);
