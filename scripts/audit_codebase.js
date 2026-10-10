const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      results = results.concat(walk(full));
    } else if (file.endsWith('.js')) {
      results.push(full);
    }
  });
  return results;
}

const files = walk('src');
console.log('Scanning files in src/:', files.length);

const findings = [];

files.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  const lines = content.split(/\r?\n/);
  lines.forEach((line, idx) => {
    // Check for hardcoded dates
    const dateMatch = line.match(/\b(202[0-9]-\d{2}-\d{2})\b/);
    if (dateMatch) {
      findings.push({
        type: 'HARDCODED_DATE',
        file: f,
        lineNum: idx + 1,
        content: line.trim()
      });
    }
    // Check for mock keywords
    if (/(\bmock\b|\bfake\b|\bhardcoded\b|\bdummy\b)/i.test(line) && !line.trim().startsWith('//')) {
      findings.push({
        type: 'MOCK_KEYWORD',
        file: f,
        lineNum: idx + 1,
        content: line.trim()
      });
    }
  });
});

console.log(`Total findings: ${findings.length}`);
findings.forEach(f => {
  console.log(`[${f.type}] ${f.file}:${f.lineNum} -> ${f.content.slice(0, 100)}`);
});
