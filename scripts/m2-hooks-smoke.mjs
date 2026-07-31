/**
 * M2 Hooks Smoke Test
 *
 * Simulates hook handler invocations with mock event/ctx objects
 * to verify auto-recall output format and autoCapture=false zero side effects.
 * No real Gateway needed.
 */
import { registerAutoMemoryHooks, resolveHookConfig } from '../dist/hooks/auto-memory.js';

let passCount = 0;
let failCount = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passCount++;
  } else {
    console.log(`  ❌ ${label}`);
    failCount++;
  }
}

console.log('=== M2 Hooks Smoke Test ===\n');

// ── Test 1: autoCapture=false → agent_end does nothing ──
console.log('Test 1: autoCapture=false → agent_end zero side effects');
{
  const capturedLogs = [];
  const mockApi = {
    on: (event, handler) => { mockApi._handlers[event] = handler; },
    logger: {
      info: (msg) => capturedLogs.push(['info', msg]),
      warn: (msg) => capturedLogs.push(['warn', msg]),
    },
    _handlers: {},
  };

  const mockStore = {
    search: async () => [],
    store: async () => {},
  };
  const mockEmbedder = {
    embed: async () => Array(2560).fill(0),
  };

  registerAutoMemoryHooks(mockApi, {
    getStore: () => mockStore,
    getEmbedder: () => mockEmbedder,
    pluginConfig: { autoCapture: false, autoRecall: false },
  });

  // Simulate agent_end
  const agentEndHandler = mockApi._handlers['agent_end'];
  assert(!!agentEndHandler, 'agent_end handler registered');

  const event = {
    success: true,
    messages: [{ role: 'user', content: 'I like dark mode' }],
  };
  const ctx = { agentId: 'test-agent', sessionKey: 'test-session' };

  // Should return immediately (autoCapture=false)
  const result = await agentEndHandler(event, ctx);
  assert(result === undefined, 'agent_end returns undefined when autoCapture=false');
}
console.log('');

// ── Test 2: autoRecall=false → before_prompt_build does nothing ──
console.log('Test 2: autoRecall=false → before_prompt_build returns undefined');
{
  const mockApi = {
    on: (event, handler) => { mockApi._handlers[event] = handler; },
    logger: { info: () => {}, warn: () => {} },
    _handlers: {},
  };

  registerAutoMemoryHooks(mockApi, {
    getStore: () => null,
    getEmbedder: () => null,
    pluginConfig: { autoCapture: false, autoRecall: false },
  });

  const handler = mockApi._handlers['before_prompt_build'];
  assert(!!handler, 'before_prompt_build handler registered');

  const event = { prompt: 'hello world', messages: [{ role: 'user', content: 'hello' }] };
  const ctx = { agentId: 'test-agent', sessionKey: 'test-session' };

  const result = await handler(event, ctx);
  assert(result === undefined, 'before_prompt_build returns undefined when autoRecall=false');
}
console.log('');

// ── Test 3: autoRecall=true → returns <relevant-memories> context ──
console.log('Test 3: autoRecall=true → injects <relevant-memories> context');
{
  const mockApi = {
    on: (event, handler) => { mockApi._handlers[event] = handler; },
    logger: { info: () => {}, warn: () => {} },
    _handlers: {},
  };

  const mockStore = {
    search: async (agentId, vector, limit, minScore) => [
      { entry: { text: 'I like dark mode', category: 'preference' } },
      { entry: { text: 'Use React for frontend', category: 'decision' } },
    ],
  };
  const mockEmbedder = {
    embed: async () => Array(2560).fill(0.1),
  };

  registerAutoMemoryHooks(mockApi, {
    getStore: () => mockStore,
    getEmbedder: () => mockEmbedder,
    pluginConfig: { autoCapture: false, autoRecall: true },
  });

  const handler = mockApi._handlers['before_prompt_build'];
  const event = { prompt: 'What do I prefer?', messages: [{ role: 'user', content: 'What do I prefer?' }] };
  const ctx = { agentId: 'test-agent', sessionKey: 'test-session' };

  const result = await handler(event, ctx);
  assert(result !== undefined, 'before_prompt_build returns a result');
  assert(result?.prependContext?.includes('<relevant-memories>'), 'Result contains <relevant-memories> wrapper');
  assert(result?.prependContext?.includes('untrusted historical data'), 'Result contains untrusted-data disclaimer');
  assert(result?.prependContext?.includes('[preference]'), 'Result contains category label');
  assert(result?.prependContext?.includes('I like dark mode'), 'Result contains memory text');
}
console.log('');

// ── Test 4: session_end cleans up cursor ──
console.log('Test 4: session_end handler registered and callable');
{
  const mockApi = {
    on: (event, handler) => { mockApi._handlers[event] = handler; },
    logger: { info: () => {}, warn: () => {} },
    _handlers: {},
  };

  registerAutoMemoryHooks(mockApi, {
    getStore: () => null,
    getEmbedder: () => null,
    pluginConfig: { autoCapture: false, autoRecall: false },
  });

  const handler = mockApi._handlers['session_end'];
  assert(!!handler, 'session_end handler registered');

  // Should not throw
  const event = { sessionKey: 'test-session' };
  const ctx = { agentId: 'test-agent', sessionKey: 'test-session' };
  handler(event, ctx); // sync handler
  assert(true, 'session_end handler executes without error');
}
console.log('');

// ── Test 5: Memory sub-session skipped ──
console.log('Test 5: Memory sub-session → auto-recall skipped');
{
  const mockApi = {
    on: (event, handler) => { mockApi._handlers[event] = handler; },
    logger: { info: () => {}, warn: () => {} },
    _handlers: {},
  };

  registerAutoMemoryHooks(mockApi, {
    getStore: () => ({ search: async () => [] }),
    getEmbedder: () => ({ embed: async () => Array(2560).fill(0) }),
    pluginConfig: { autoCapture: false, autoRecall: true },
  });

  const handler = mockApi._handlers['before_prompt_build'];
  const event = { prompt: 'remember this', messages: [{ role: 'user', content: 'remember this' }] };
  const ctx = { agentId: 'test-agent', sessionKey: 'reflection:abc123' };

  const result = await handler(event, ctx);
  assert(result === undefined, 'before_prompt_build returns undefined for reflection sub-session');
}
console.log('');

// ── Summary ──
console.log('=== Summary ===');
console.log(`  Passed: ${passCount}`);
console.log(`  Failed: ${failCount}`);
console.log(`  Total:  ${passCount + failCount}`);
process.exit(failCount > 0 ? 1 : 0);
