// Optional local-only PostgreSQL engine. PGLITE_MODULE must be a file URL or path
// to @electric-sql/pglite's dist/index.js; no production credentials are used.
import { readFile, readdir } from 'node:fs/promises';
const modulePath = process.env.PGLITE_MODULE || '@electric-sql/pglite';
const { PGlite } = await import(modulePath);
const db = new PGlite();
const base = new URL('../', import.meta.url);
try {
  await db.exec(await readFile(new URL('tests/platform-fixture.sql', base), 'utf8'));
  for (const filename of (await readdir(new URL('migrations/', base))).filter(n => n.endsWith('.sql')).sort()) {
    await db.exec(await readFile(new URL(`migrations/${filename}`, base), 'utf8'));
    console.log(`Applied local migration: ${filename}`);
  }
  for (const file of ['security.sql','security-hq3.sql','security-drive.sql','security-registration.sql']) {
    const sql = await readFile(new URL(`tests/${file}`, base), 'utf8');
    const results = await db.exec(sql);
    console.log(results.at(-1).rows[0].result);
    console.log(`${file}: ${(sql.match(/select pg_temp\.(assert_true|expect_error)\(/g) ?? []).length} assertions executed`);
  }
  console.log('Engine:', (await db.query('select version()')).rows[0].version);
} catch (error) {
  console.error('SQL security check failed:', error.message, 'SQLSTATE:', error.code, 'position:', error.position);
  process.exitCode = 1;
} finally {
  await db.close();
}
