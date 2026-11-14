const fs = require('fs');
const { publishResearchDraft } = require('../src/research_reports');
const file = process.argv[2];
if (!file) throw new Error('Provide a reviewed Chinese research draft JSON file');
const report = publishResearchDraft(JSON.parse(fs.readFileSync(file, 'utf8')));
console.log(JSON.stringify({ id: report.id, asOf: report.asOf, generatedAt: report.generatedAt, evidenceSources: report.basis.length }));
