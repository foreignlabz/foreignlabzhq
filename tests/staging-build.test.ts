import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

test('staging build refuses production and absent protection without echoing credentials',()=>{
  const password='test-only-password-not-a-real-credential';
  for(const overrides of [{VERCEL_ENV:'production'},{NETLIFY:'true',CONTEXT:'production'},{HQ_STAGING_DEMO:'false'},{HQ_PREVIEW_PASSWORD:''},{HQ_DRIVE_ENABLED:'true'}]){
    const result=spawnSync(process.execPath,['scripts/build-staging.mjs'],{encoding:'utf8',env:{...process.env,VERCEL:'1',VERCEL_ENV:'preview',HQ_STAGING_DEMO:'true',HQ_DRIVE_ENABLED:'false',HQ_PREVIEW_USERNAME:'qa',HQ_PREVIEW_PASSWORD:password,...overrides}});
    assert.equal(result.status,1);assert.match(result.stderr,/Staging build refused/);assert.ok(!result.stderr.includes(password));assert.ok(!result.stdout.includes('next build'));
  }
});
