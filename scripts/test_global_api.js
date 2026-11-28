const {test}=require('node:test');
const assert=require('node:assert/strict');
const app=require('../src/server');
test('global API and static page read the shared report and theater registry',async t=>{
 const server=app.listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
 const base=`http://127.0.0.1:${server.address().port}`;
 const [brief,registry,page]=await Promise.all([
  fetch(base+'/api/global-brief').then(r=>r.json()),fetch(base+'/data/global_theaters.json').then(r=>r.json()),fetch(base+'/global.html').then(r=>r.text())]);
 assert.deepEqual(brief.theaters.map(t=>t.id),registry.theaters.map(t=>t.id));
 assert.equal(brief.completeGlobalCoverage,false);
 assert.match(page,/全球戰況與情境推演/);
 assert.ok(brief.theaters.every(t=>t.updates.every(u=>u.status==='RECENT_REPORT'||u.status==='DATED_CONTEXT')));
});
