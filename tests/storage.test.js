import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readReviews,saveReview,STORAGE_KEY} from '../src/metrics.js';
const review=id=>({id,vendor:'Demo',start:'2026-10-01',end:'2026-10-31',notes:'Evidence',updatedAt:'2026-11-05T12:00:00Z',metrics:[{name:'Quality',raw:'78',actual:999,unit:'percent',target:'85',direction:'max',assess:false,row:2}]});
function memory(){let data=null;return {getItem:()=>data,setItem:(k,v)=>data=v};}
test('save and reopen preserve targets, skipped state, direction and notes; actual recomputed',()=>{const storage=memory();saveReview(storage,review('a'));const [r]=readReviews(storage);assert.equal(r.notes,'Evidence');assert.equal(r.metrics[0].actual,78);assert.equal(r.metrics[0].assess,false);assert.equal(r.metrics[0].target,'85');assert.equal(r.metrics[0].direction,'max');});
test('updating a review keeps other reviews and does not duplicate it',()=>{const storage=memory();saveReview(storage,review('a'));saveReview(storage,review('b'));saveReview(storage,{...review('a'),notes:'Updated'});const list=readReviews(storage);assert.equal(list.length,2);assert.equal(list[0].notes,'Updated');assert.equal(list[1].id,'b');});
test('corrupt storage is never silently overwritten',()=>{let written=false;const storage={getItem:()=>'{bad',setItem:()=>written=true};assert.throws(()=>saveReview(storage,review('a')));assert.equal(written,false);});
test('storage quota and access errors propagate',()=>{assert.throws(()=>saveReview({getItem:()=>null,setItem:()=>{throw Error('quota');}},review('a')),/quota/);assert.throws(()=>readReviews({getItem:()=>{throw Error('blocked');}}),/blocked/);});
test('invalid saved data is rejected',()=>{assert.throws(()=>readReviews({getItem:()=>JSON.stringify([{id:'a'}])}));});
