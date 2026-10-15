import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boundedJson } from '../src/server/http';
import { RequestSchema } from '../src/core/control-api';
test('body parser enforces actual byte limit and rejects invalid JSON',async()=>{await assert.rejects(()=>boundedJson(new Request('http://localhost',{method:'POST',body:'x'.repeat(32769)})),/too large/);await assert.rejects(()=>boundedJson(new Request('http://localhost',{method:'POST',body:'{'})),/Invalid JSON/);assert.deepEqual(await boundedJson(new Request('http://localhost',{method:'POST',body:'{"action":"run"}'})),{action:'run'});});
test('control API never accepts client-provided identity or role',()=>{assert.equal(RequestSchema.safeParse({action:'run',role:'owner',tenantId:crypto.randomUUID()}).success,false);});
