import test from 'node:test';import assert from 'node:assert/strict';
import {imageType,saveImage} from '../server/agent-media.mjs';
const jpeg=Buffer.from([255,216,255,224]);
test('image upload type rejects executable text and detects JPEG/PNG',()=>{assert.equal(imageType(jpeg).mime,'image/jpeg');assert.equal(imageType(Buffer.from([137,80,78,71,13,10,26,10])).mime,'image/png');assert.throws(()=>imageType(Buffer.from('<script>bad</script>')));});
test('unsupported bytes are rejected before any storage operation',async()=>{
 await assert.rejects(()=>saveImage(Buffer.from('not an image'),'owner',{FIREBASE_STORAGE_BUCKET:'test'}),/PNG বা JPEG/);
});

test('video files are identified by their container without changing the bytes',async()=>{
 const {mediaType}=await import('../server/agent-media.mjs');
 const mp4=Buffer.concat([Buffer.from([0,0,0,20]),Buffer.from('ftypisom'),Buffer.alloc(8)]);
 const mov=Buffer.concat([Buffer.from([0,0,0,20]),Buffer.from('ftypqt  '),Buffer.alloc(8)]);
 assert.equal(mediaType(mp4).mime,'video/mp4');assert.equal(mediaType(mov).mime,'video/quicktime');
 assert.equal(mediaType(mp4).kind,'video');assert.throws(()=>mediaType(Buffer.from('not a video')));
});
