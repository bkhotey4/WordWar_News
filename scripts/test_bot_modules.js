// src/bot/ 模組：載入不連線、指令註冊名單、選單名稱、私訊與指令處理不會因單一錯誤崩潰
const { test } = require('node:test');
const assert = require('node:assert/strict');

test('bot modules load without connecting, and every imported name resolves', () => {
  const fs = require('fs'), path = require('path');
  const dir = path.join(__dirname, '../src/bot');
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    require(path.join(dir, f));
    for (const m of src.matchAll(/^const \{ ([^}]+) \} = require\('(\.\.?\/[^']+)'\);/gm)) {
      const target = require(path.resolve(dir, m[2]));
      for (const name of m[1].split(',').map(s => s.trim())) assert.notEqual(target[name], undefined, `${f}: ${name} from ${m[2]}`);
    }
  }
});

test('registered commands: unique names, no placeholder labels, every intel command is registered', () => {
  const { commands, INTEL_COMMAND_NAMES, REGISTERED_COMMAND_NAMES } = require('../src/bot/commands');
  const registered = commands.filter(c => REGISTERED_COMMAND_NAMES.has(c.name));
  const names = registered.map(c => c.name);
  assert.equal(new Set(names).size, names.length, 'no duplicate command names');
  for (const n of INTEL_COMMAND_NAMES) assert.ok(names.includes(n), `intel command ${n} is registered`);
  const labels = registered.flatMap(c => (c.options || []).flatMap(o => (o.choices || []).map(ch => `${c.name}:${ch.name}`)));
  assert.deepEqual(labels.filter(l => /未知/.test(l)), [], 'menu choices have real names');
  assert.ok(registered.every(c => c.description.length >= 1 && c.description.length <= 100), 'Discord limits descriptions to 100 characters');
  const sat = registered.find(c => c.name === 'satellite').options[0].choices.map(c => c.value);
  assert.ok(sat.includes('ukraine_civil') && sat.includes('hormuz_bandar_abbas'));
});

test('payload builders return text; stale airspace explains instead of saying 未知', () => {
  const p = require('../src/bot/payloads');
  for (const fn of ['createHelpPayload', 'createLimitationsPayload', 'createSentryStatusPayload']) assert.ok(p[fn]().content.length > 20, fn);
  const stale = p.createSkyScanPayload({ liveAirspace: { success: false } });
  assert.match(stale.content, /OpenSky/); assert.doesNotMatch(stale.content, /^未知$/);
});

test('interaction handler: an error inside a command and a failing error-reply do not throw', async () => {
  const { handleInteraction } = require('../src/bot/interaction_handler');
  const replies = [];
  const interaction = {
    isButton: () => false, isChatInputCommand: () => true, commandName: 'help', user: { id: 'u1' },
    deferred: false, replied: false,
    deferReply: async () => { throw new Error('Unknown interaction'); },
    reply: async r => { replies.push(r); throw new Error('expired'); },
    followUp: async r => { replies.push(r); },
    editReply: async r => { replies.push(r); }
  };
  await assert.doesNotReject(handleInteraction({}, interaction));
  assert.match(replies[0].content, /發生錯誤/);
});
