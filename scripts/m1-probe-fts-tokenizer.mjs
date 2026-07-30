import lancedb from '@lancedb/lancedb';
import { rmSync } from 'node:fs';
const P = 'C:\\Users\\Administrator\\.openclaw\\memory\\tmp-fts-tokenizer-probe';
rmSync(P, { recursive: true, force: true });
const db = await lancedb.connect(P, { readConsistencyInterval: 1 });
const t = await db.createTable('t', [
  { id: '1', content: '沧溟剑诀第三式断水流，小千的验证记忆' },
  { id: '2', content: 'OpenClaw memory plugin upgrade with LanceDB' },
  { id: '3', content: '我喜欢用 tabs 缩进，永远记得加错误处理' },
]);
for (const tok of ['icu', 'icu/split', 'ngram']) {
  try {
    await t.createIndex('content', { config: lancedb.Index.fts({ withPosition: true, baseTokenizer: tok, lowercase: true, stem: false, removeStopWords: false, asciiFolding: false }), replace: true });
    const zh = await t.search('沧溟剑诀', 'fts').limit(3).toArray();
    const en = await t.search('LanceDB', 'fts').limit(3).toArray();
    console.log(`${tok}: 中文 hits=${zh.length} (top=${zh[0]?.id ?? '-'}) | 英文 hits=${en.length} (top=${en[0]?.id ?? '-'})`);
  } catch (e) { console.log(`${tok}: ERR ${e.message.slice(0, 120)}`); }
}
rmSync(P, { recursive: true, force: true });
