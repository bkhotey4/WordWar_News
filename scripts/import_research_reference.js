const fs=require('fs');
const {importResearchReference}=require('../src/research_reports');
if(!process.argv[2])throw Error('Provide a reviewed source reference JSON path');
const doc=importResearchReference(JSON.parse(fs.readFileSync(process.argv[2],'utf8')));
console.log(JSON.stringify({id:doc.id,url:doc.url,publishedAt:doc.publishedAt}));
