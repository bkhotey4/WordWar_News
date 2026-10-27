const fs=require('fs');
const path=require('path');
const {getStore}=require('../src/intel_store');
const {getResearchFeed}=require('../src/research_reports');
const file=path.join(__dirname,'../research/sources.json');
const source=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{documents:[]};
for(const doc of source.documents)getStore().putDocument(doc);
for(const report of getResearchFeed().reports)getStore().reviewDocuments(report.basis.map(ref=>ref.id));
console.log(JSON.stringify({registeredOriginalDocuments:source.documents.length,analysis:getStore().analysisHealth()}));
