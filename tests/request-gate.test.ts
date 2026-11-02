import {test} from 'node:test';
import assert from 'node:assert/strict';
import {HQRequestGate} from '../lib/use-hq';

test('logout invalidates initial loads and blocks refreshes started after logout',()=>{
  const gate=new HQRequestGate();const session=gate.open();const initial=gate.beginLoad()!;
  assert.equal(gate.accepts(initial),true);
  gate.close();
  assert.equal(gate.accepts(initial),false);
  assert.equal(gate.active(session),false);
  assert.equal(gate.beginLoad(),null);
});
test('only the newest refresh may update data or display its error',()=>{
  const gate=new HQRequestGate();gate.open();
  const older=gate.beginLoad()!;const newer=gate.beginLoad()!;
  assert.equal(gate.accepts(older),false);
  assert.equal(gate.accepts(newer),true);
});
test('explicit sign-in reopens loading without accepting stale pre-logout requests',()=>{
  const gate=new HQRequestGate();const oldSession=gate.open();const oldLoad=gate.beginLoad()!;
  const logoutSession=gate.close();const nextSession=gate.open();const nextLoad=gate.beginLoad()!;
  assert.equal(gate.matches(logoutSession),false);
  assert.equal(gate.active(oldSession),false);
  assert.equal(gate.active(nextSession),true);
  assert.equal(gate.accepts(oldLoad),false);
  assert.equal(gate.accepts(nextLoad),true);
});
test('a write completed after logout cannot start another refresh',async()=>{
  const gate=new HQRequestGate();gate.open();
  let finishWrite:()=>void=()=>{};
  const write=new Promise<void>(resolve=>{finishWrite=resolve;});
  const operationEpoch=gate.current();
  const outcome=(async()=>{await write;return gate.active(operationEpoch);})();
  gate.close();finishWrite();
  assert.equal(await outcome,false);
  assert.equal(gate.beginLoad(),null);
});
