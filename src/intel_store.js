const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
class IntelStore {
  constructor(filename = path.join(__dirname, '../research/intelligence.sqlite')) {
    if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true });
    this.db = new Database(filename);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(`CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY, url TEXT NOT NULL, hash TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS versions (
      document_id TEXT NOT NULL, hash TEXT NOT NULL, data TEXT NOT NULL, recorded_at TEXT NOT NULL,
      PRIMARY KEY(document_id, hash));
      CREATE TABLE IF NOT EXISTS changes (
      id INTEGER PRIMARY KEY, document_id TEXT NOT NULL, previous_hash TEXT, new_hash TEXT NOT NULL,
      kind TEXT NOT NULL, recorded_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS source_health (name TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS imagery (id TEXT PRIMARY KEY, region TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS analysis_runs (id INTEGER PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS analysis_queue(document_id TEXT NOT NULL, hash TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(document_id,hash));
      PRAGMA user_version = 2;`);
  }
  putDocument(document, now = new Date().toISOString()) {
    if (!document.id || !document.url || !document.body || !document.publishedAt) throw new Error('Incomplete source document');
    const hash = digest(JSON.stringify({ title: document.title, body: document.body, publishedAt: document.publishedAt, observation: document.observation, imageUrl: document.imageUrl }));
    return this.db.transaction(() => {
      const previous = this.db.prepare('SELECT * FROM documents WHERE id=?').get(document.id);
      if (previous?.hash === hash) return { changed: false, hash };
      const data = JSON.stringify({ ...document, contentHash: hash });
      this.db.prepare('INSERT OR IGNORE INTO versions VALUES(?,?,?,?)').run(document.id, hash, data, now);
      this.db.prepare('INSERT INTO documents VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET hash=excluded.hash,data=excluded.data,updated_at=excluded.updated_at').run(document.id, document.url, hash, data, now);
      this.db.prepare('INSERT INTO changes(document_id,previous_hash,new_hash,kind,recorded_at) VALUES(?,?,?,?,?)').run(document.id, previous?.hash || null, hash, previous ? 'CORRECTION' : 'NEW_DOCUMENT', now);
      if(document.originGroup!=='TAIWAN_MND')this.db.prepare('INSERT OR IGNORE INTO analysis_queue VALUES(?,?,?,?)').run(document.id,hash,'WAITING_REVIEW',now);
      return { changed: true, hash, correction: Boolean(previous) };
    })();
  }
  documents(group) {
    const docs = this.db.prepare('SELECT data FROM documents').all().map(row => JSON.parse(row.data));
    return docs.filter(doc => !group || doc.originGroup === group).sort((a,b) => Date.parse(b.observation?.periodEnd || b.publishedAt) - Date.parse(a.observation?.periodEnd || a.publishedAt));
  }
  changes(limit = 30) {
    return this.db.prepare('SELECT c.*,d.data FROM changes c JOIN documents d ON d.id=c.document_id ORDER BY c.id DESC LIMIT ?').all(limit).map(row => {
      const current = JSON.parse(row.data);
      const prior = row.previous_hash ? JSON.parse(this.db.prepare('SELECT data FROM versions WHERE document_id=? AND hash=?').get(row.document_id,row.previous_hash).data) : null;
      const version = JSON.parse(this.db.prepare('SELECT data FROM versions WHERE document_id=? AND hash=?').get(row.document_id,row.new_hash).data);
      return { id: row.id, documentId: row.document_id, kind: row.kind, recordedAt: row.recorded_at, title: version.title, url: current.url, publishedAt: version.publishedAt, observation: version.observation || null,
        previousObservation: prior?.observation || null, originGroup: version.originGroup, evidenceStatus: version.sourceType === 'OFFICIAL_NOTICE' ? 'OFFICIAL_REPORT' : 'SOURCE_CLAIM',
        currentVersion: row.new_hash === current.contentHash };
    });
  }
  health(name, value) { this.db.prepare('INSERT INTO source_health VALUES(?,?) ON CONFLICT(name) DO UPDATE SET data=excluded.data').run(name,JSON.stringify(value)); }
  getHealth(name) { const row=this.db.prepare('SELECT data FROM source_health WHERE name=?').get(name); return row ? JSON.parse(row.data) : null; }
  putImagery(asset) { this.db.prepare('INSERT INTO imagery VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(`${asset.region}:${asset.productId}`,asset.region,JSON.stringify(asset)); }
  deleteImagery(region, productId) { return this.db.prepare('DELETE FROM imagery WHERE id=?').run(`${region}:${productId}`).changes; }
  imagery(region) { return this.db.prepare('SELECT data FROM imagery').all().map(row=>JSON.parse(row.data)).filter(a=>!region||a.region===region).sort((a,b)=>Date.parse(b.acquiredAt)-Date.parse(a.acquiredAt)); }
  analysis(data) { this.db.prepare('INSERT INTO analysis_runs(data) VALUES(?)').run(JSON.stringify(data)); }
  reviewDocuments(ids) { this.db.transaction(()=>{for(const id of ids)this.db.prepare("UPDATE analysis_queue SET status='REVIEWED' WHERE document_id=? AND hash=(SELECT hash FROM documents WHERE id=?)").run(id,id);})(); }
  recordRunStatus(statusData) {
    const statusFile = path.join(__dirname, '../research/research_run_status.json');
    const tmp = `${statusFile}.${crypto.randomUUID()}.tmp`;
    fs.mkdirSync(path.dirname(statusFile), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify({ ...statusData, recordedAt: new Date().toISOString() }, null, 2));
    fs.renameSync(tmp, statusFile);
  }
  analysisHealth() {
    const waiting=this.db.prepare("SELECT count(*) AS count FROM analysis_queue q JOIN documents d ON d.id=q.document_id AND d.hash=q.hash WHERE q.status='WAITING_REVIEW'").get().count;
    let schedule=null;
    const directory=path.join(process.env.CODEX_HOME || path.join(os.homedir(),'.codex'),'automations');
    try {
      for(const entry of fs.readdirSync(directory,{withFileTypes:true})) {
        if(!entry.isDirectory())continue;
        const config=fs.readFileSync(path.join(directory,entry.name,'automation.toml'),'utf8');
        if(!config.includes('RESEARCH_WORKFLOW.md') || !config.includes('WordWar_News'))continue;
        const field=name=>config.match(new RegExp('^'+name+'\\s*=\\s*"([^"\\r\\n]*)"','m'))?.[1] || null;
        if(field('kind')==='heartbeat' && field('status')==='ACTIVE') {
          schedule={id:field('id'),rule:field('rrule'),status:'ACTIVE'};break;
        }
      }
    }catch(error){ /* Missing local scheduler configuration means unconfirmed. */ }

    // Check research_run_status.json for failures or quota exhaustion
    let runStatus = null;
    try {
      const statusFile = path.join(__dirname, '../research/research_run_status.json');
      if (fs.existsSync(statusFile)) {
        runStatus = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
      }
    } catch (_) {}

    let runnerState = schedule ? 'CODEX_SCHEDULED_RESEARCH' : 'NOT_CONFIGURED';
    let runnerNote = schedule
      ? '已設定 Codex 定時研究；須本機與 app 在線及帳號有額度。排程設定不代表本次研究已執行成功。'
      : '尚未確認可用的定時研究排程；採集結果不等於已完成分析。';

    if (runStatus?.quotaExhausted === true || runStatus?.error?.includes('insufficient_quota') || runStatus?.error?.includes('429')) {
      runnerState = 'QUOTA_EXHAUSTED';
      runnerNote = `⚠️ 研究排程額度耗盡或請求超速 (429/Quota Exhausted)：研究無法產出新稿 (${runStatus.error || '額度不足'})。`;
    } else if (runStatus?.success === false) {
      runnerState = 'RUNNER_FAILED';
      runnerNote = `⚠️ 研究排程最近執行失敗：${runStatus.error || '未知錯誤'}，請檢查日誌。`;
    }

    return {
      mode: 'REVIEW_REQUIRED',
      automaticResearchRunner: runnerState,
      schedule,
      nextScheduledAnalysis: null,
      pendingOriginalDocuments: waiting,
      lastRunStatus: runStatus,
      note: runnerNote
    };
  }
  close() { this.db.close(); }
}

let shared;
function getStore() { return shared || (shared = new IntelStore()); }
module.exports = { IntelStore, getStore, digest };
