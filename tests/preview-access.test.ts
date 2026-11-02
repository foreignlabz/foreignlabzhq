import {test} from 'node:test';
import assert from 'node:assert/strict';
import {previewTicket,validPreviewBasic,validPreviewTicket} from '../lib/preview-access';
test('private preview rejects missing, invalid and forged access',()=>{assert.equal(validPreviewBasic('','reviewer','test-only-password'),false);assert.equal(validPreviewBasic('Bearer token','reviewer','test-only-password'),false);assert.equal(validPreviewTicket('9999999999999.invalid','test-only-password'),false);});
test('preview session expires and rotates when credential changes',()=>{const now=10000000;const ticket=previewTicket('test-only-password',now+1000);assert.ok(validPreviewTicket(ticket,'test-only-password',now));assert.equal(validPreviewTicket(ticket,'changed-test-password',now),false);assert.equal(validPreviewTicket(ticket,'test-only-password',now+1001),false);assert.ok(validPreviewBasic('Basic '+Buffer.from('reviewer:test-only-password').toString('base64'),'reviewer','test-only-password'));});
