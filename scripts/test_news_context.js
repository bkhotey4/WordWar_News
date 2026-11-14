const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validClaim,getNewsContext}=require('../src/news_context');
const now=Date.now(),publishedAt=new Date(now-1000).toISOString();
const doc={id:'source',contentHash:'a'.repeat(64),publishedAt,url:'https://example.org/report',publisher:'Original',sourceType:'REVIEWED_DATE_ONLY_ARTICLE_NOTES'};
const claim={id:'claim',theater:'sudan',parties:['甲方','乙方'],summary:'來源聲稱雙方參與事件，不能識別單一影像物件。',observedAt:publishedAt,evidence:[{id:doc.id,contentHash:doc.contentHash}],reviewed:true};
const theaters=new Set(['sudan']);
test('a source-backed regional actor claim disappears if the original text version changes',()=>{
 assert.equal(validClaim(claim,[doc],theaters,now),true);
 assert.equal(validClaim(claim,[{...doc,contentHash:'b'.repeat(64)}],theaters,now),false);
 assert.equal(validClaim({...claim,observedAt:new Date(now).toISOString()},[doc],theaters,now),false);
});
test('actor context cannot carry target coordinates or claim visual identification',()=>{
 for(const extra of [{latitude:15.5},{bbox:[1,2,3,4]},{imageIdentification:true}])assert.equal(validClaim({...claim,...extra},[doc],theaters,now),false);
 const out=getNewsContext(now,{sources:{documents:[doc]},registry:{theaters:[{id:'sudan'}]},claims:{claims:[claim]}});
 assert.equal(out[0].imageIdentification,false);
 assert.equal(out[0].references[0].url,doc.url);
});
test('dated news background expires without being refreshed by a new page visit',()=>{
 assert.equal(validClaim(claim,[doc],theaters,now+31*86400000),false);
});
