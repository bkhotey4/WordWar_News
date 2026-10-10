const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function briefingSlot(now = Date.now()) {
  const local = new Date(now + 8 * 60 * 60_000);
  const hour = local.getUTCHours();
  if (hour !== 8 && hour !== 20) return null;
  const date = local.toISOString().slice(0, 10);
  const type = hour === 8 ? 'MORNING' : 'EVENING';
  return { key: `${date}_${type}`, type };
}

class DeliveryLedger {
  constructor(file) { this.file = file; this.running = new Set(); }
  read() { try { return JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return {}; throw error; } }
  write(state) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temp = `${this.file}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(state, null, 2));
    fs.renameSync(temp, this.file);
  }
  async send(key, recipients, deliver, now = Date.now()) {
    if (this.running.has(key)) return;
    this.running.add(key);
    let delivered = 0;
    const uniqueRecipients = [...new Set(recipients)];
    try {
      for (const userId of uniqueRecipients) {
        const state = this.read();
        const recordKey = `${key}:${userId}`;
        const previous = state[recordKey];
        if (previous?.sentAt) { delivered++; continue; }
        if (previous?.attemptedAt && now - previous.attemptedAt < 60_000) continue;
        state[recordKey] = { attemptedAt: now };
        this.write(state);
        try {
          await deliver(userId);
          const latest = this.read();
          latest[recordKey] = { attemptedAt: now, sentAt: Date.now() };
          // Retain one week of delivery receipts.
          for (const [id, receipt] of Object.entries(latest)) if (now - receipt.attemptedAt > 7 * 24 * 60 * 60_000) delete latest[id];
          this.write(latest);
          delivered++;
        } catch (error) { console.error('[DELIVERY FAILED]', userId, error.message); }
      }
      return { delivered, total: uniqueRecipients.length, complete: uniqueRecipients.length > 0 && delivered === uniqueRecipients.length };
    } finally { this.running.delete(key); }
  }
}
module.exports = { DeliveryLedger, briefingSlot };
