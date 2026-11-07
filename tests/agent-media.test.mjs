import test from 'node:test';import assert from 'node:assert/strict';
import {imageType,saveImage} from '../server/agent-media.mjs';
const jpeg=Buffer.from([255,216,255,224]);
test('image upload type rejects executable text and detects JPEG/PNG',()=>{assert.equal(imageType(jpeg).mime,'image/jpeg');assert.equal(imageType(Buffer.from([137,80,78,71,13,10,26,10])).mime,'image/png');assert.throws(()=>imageType(Buffer.from('<script>bad</script>')));});
test('unsupported bytes are rejected before any storage operation',async()=>{
 await assert.rejects(()=>saveImage(Buffer.from('not an image'),'owner',{FIREBASE_STORAGE_BUCKET:'test'}),/PNG বা JPEG/);
});
