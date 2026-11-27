const test=require('node:test');const assert=require('node:assert/strict');const {hashCode,verifyCode,allowed}=require('../src/security.cjs');
test('PBKDF2 verifies correct code and rejects wrong code',()=>{const h=hashCode('1234');assert.equal(verifyCode('1234',h),true);assert.equal(verifyCode('9999',h),false)});
test('role permissions are bounded',()=>{assert.equal(allowed({active:1,role:'viewer',permissions_json:'{}'},'donors:read'),true);assert.equal(allowed({active:1,role:'viewer',permissions_json:'{}'},'donors:delete'),false)});
test('expired user access is denied',()=>{assert.equal(allowed({active:1,role:'admin',permissions_json:'{}',allowed_until:'2000-01-01'},'anything'),false)});
test('malformed or excessive-cost credential hashes are rejected safely',()=>{
 assert.equal(verifyCode('1234','pbkdf2$999999999$'+'a'.repeat(32)+'$'+'b'.repeat(64)),false);
 assert.equal(verifyCode('1234','pbkdf2$210000$bad$bad'),false);
 assert.equal(verifyCode('1234',null),false);
});
test('invalid access dates and malformed permission documents deny access',()=>{
 assert.equal(allowed({active:1,role:'admin',permissions_json:'{}',allowed_until:'not-a-date'},'anything'),false);
 assert.equal(allowed({active:1,role:'admin',permissions_json:'{'},'anything'),false);
 assert.equal(allowed({active:1,role:'admin',permissions_json:'{"permissions":"*"}'},'anything'),false);
});
