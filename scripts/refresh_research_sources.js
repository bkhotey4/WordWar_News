const { refreshResearchSources } = require('../src/research_reports');
refreshResearchSources({ force: process.argv.includes('--force') }).then(result => {
  console.log(JSON.stringify({ checkedAt: result.lastCheckedAt, sources: result.sources,
    documents: result.documents.map(doc => ({ id: doc.id, title: doc.title, url: doc.url, publishedAt: doc.publishedAt, publisher: doc.publisher })) }, null, 2));
}).catch(error => { console.error(error.message); process.exitCode = 1; });
