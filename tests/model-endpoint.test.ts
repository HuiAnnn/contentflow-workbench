import assert from 'node:assert/strict';
import {normalizeModelEndpoint,needsNewModelKey} from '../lib/model-endpoint';
import {checkedModelEndpoint,isPublicModelAddress} from '../lib/model-endpoint-server';

assert.equal(normalizeModelEndpoint('https://models.example.com'),'https://models.example.com/v1/chat/completions');
assert.equal(normalizeModelEndpoint(' https://MODELS.example.com/v1/ '),'https://models.example.com/v1/chat/completions');
assert.equal(normalizeModelEndpoint('https://models.example.com/api/chat/completions/'),'https://models.example.com/api/chat/completions');
for(const url of ['http://models.example.com/v1','https://localhost/v1','https://127.1/v1','https://2130706433/v1','https://[::1]/v1','https://metadata.google.internal','https://user:pass@models.example.com/v1','https://models.example.com/v1?key=secret','https://models.example.com/v1#fragment'])assert.throws(()=>normalizeModelEndpoint(url));
for(const address of ['127.0.0.1','10.0.0.1','172.16.1.2','192.168.0.1','169.254.169.254','100.64.0.1','198.18.0.1','203.0.113.1','::1','::ffff:127.0.0.1','fc00::1','fe80::1','2001:db8::1','2001:0000::1','2002:7f00:1::1','999.1.1.1'])assert.equal(isPublicModelAddress(address),false,address);
for(const address of ['8.8.8.8','1.1.1.1','2001:4860:4860::8888','2606:4700:4700::1111'])assert.equal(isPublicModelAddress(address),true,address);
const endpoint='https://models.example.com/v1/chat/completions';
assert.equal(await checkedModelEndpoint(endpoint,async()=>['8.8.8.8']),endpoint);
for(const records of [[],['127.0.0.1'],['8.8.8.8','fe80::1']])await assert.rejects(()=>checkedModelEndpoint(endpoint,async()=>records),/公网地址/);
await assert.rejects(()=>checkedModelEndpoint(endpoint,async()=>{throw new Error('private resolver detail')}),error=>error instanceof Error&&!error.message.includes('private resolver detail'));
assert.equal(needsNewModelKey({provider:'custom',endpoint},'custom',endpoint),false);
assert.equal(needsNewModelKey({provider:'custom',endpoint},'custom','https://other.example.com/v1/chat/completions'),true);
assert.equal(needsNewModelKey({provider:'zhipu'},'custom',endpoint),true);
assert.equal(needsNewModelKey({provider:'zhipu'},'zhipu',null),false);
console.log('Passed: custom URL normalization, public destination validation, and key reuse bound to saved destination.');
