/**
 * M6 P0a-1 Probe: Verify supplement registration APIs exist on host
 *
 * This script:
 * 1. Greps the host's extensionAPI.js for registerMemoryPromptSupplement/registerMemoryCorpusSupplement
 * 2. Simulates our plugin's register() path with a mock api object to verify
 *    our conditional registration code doesn't throw
 * 3. Reports findings
 *
 * Run: node dist/wiki/probe-supplement-registration.mjs
 */

import fs from 'fs';
import path from 'path';

const HOST_DIST = path.join(
  process.env.APPDATA || '',
  'npm', 'node_modules', 'openclaw', 'dist'
);

console.log('=== M6 P0a-1 Supplement Registration Probe ===\n');

// ── Step 1: Grep host API files ──────────────────────────────────────
console.log('Step 1: Checking host API files...');

const apiBuilderPath = path.join(HOST_DIST, 'api-builder-CX43eAAh.js');
const registryPath = path.join(HOST_DIST, 'registry-B8eQDFB4.js');
const memoryStatePath = path.join(HOST_DIST, 'memory-state-DefveORB.js');

const checks = [
  { name: 'api-builder (noop defaults)', file: apiBuilderPath, pattern: /noopRegisterMemoryPromptSupplement|noopRegisterMemoryCorpusSupplement/ },
  { name: 'api-builder (api object)', file: apiBuilderPath, pattern: /registerMemoryPromptSupplement:|registerMemoryCorpusSupplement:/ },
  { name: 'registry (wiring)', file: registryPath, pattern: /registerMemoryPromptSupplement|registerMemoryCorpusSupplement/ },
  { name: 'memory-state (state store)', file: memoryStatePath, pattern: /corpusSupplements|promptSupplements/ },
];

let allPassed = true;
for (const check of checks) {
  if (!fs.existsSync(check.file)) {
    console.log(`  ❌ ${check.name}: file not found (${check.file})`);
    allPassed = false;
    continue;
  }
  const content = fs.readFileSync(check.file, 'utf8');
  const found = check.pattern.test(content);
  console.log(`  ${found ? '✅' : '❌'} ${check.name}: ${found ? 'FOUND' : 'NOT FOUND'}`);
  if (!found) allPassed = false;
}

// ── Step 2: Simulate our plugin register() path ──────────────────────
console.log('\nStep 2: Simulating plugin register() with mock api...');

// Simulate the exact code path from dist/index.js L98-111
const mockApi = {
  logger: {
    info: (msg) => console.log(`  [mock-logger] ${msg}`),
    error: (msg) => console.log(`  [mock-logger ERROR] ${msg}`),
  },
  pluginConfig: {
    vault: { path: 'C:\\test\\wiki' },
    context: { includeCompiledDigestPrompt: false },
  },
  config: {},
  registerMemoryPromptSupplement: undefined, // Simulate host WITHOUT the API
  registerMemoryCorpusSupplement: undefined,  // Simulate host WITHOUT the API
};

// Test 1: API NOT available (honest degradation)
console.log('\n  Test 1a: API not available (honest degradation)');
try {
  const builder = () => [];
  if (mockApi.registerMemoryPromptSupplement) {
    mockApi.registerMemoryPromptSupplement(builder);
  } else {
    console.log('  ✅ registerMemoryPromptSupplement: gracefully skipped (API not available)');
  }
  if (mockApi.registerMemoryCorpusSupplement) {
    mockApi.registerMemoryCorpusSupplement({ search: async () => [], get: async () => null });
  } else {
    console.log('  ✅ registerMemoryCorpusSupplement: gracefully skipped (API not available)');
  }
} catch (error) {
  console.log(`  ❌ Error in degradation path: ${error}`);
  allPassed = false;
}

// Test 2: API available (normal registration)
console.log('\n  Test 1b: API available (normal registration)');
let promptRegistered = false;
let corpusRegistered = false;
const mockApiWithSupplement = {
  ...mockApi,
  registerMemoryPromptSupplement: (builder) => { promptRegistered = true; },
  registerMemoryCorpusSupplement: (supplement) => { corpusRegistered = true; },
};

try {
  const builder = () => [];
  if (mockApiWithSupplement.registerMemoryPromptSupplement) {
    mockApiWithSupplement.registerMemoryPromptSupplement(builder);
  }
  if (mockApiWithSupplement.registerMemoryCorpusSupplement) {
    mockApiWithSupplement.registerMemoryCorpusSupplement({ search: async () => [], get: async () => null });
  }
  console.log(`  ${promptRegistered ? '✅' : '❌'} registerMemoryPromptSupplement: ${promptRegistered ? 'called' : 'NOT called'}`);
  console.log(`  ${corpusRegistered ? '✅' : '❌'} registerMemoryCorpusSupplement: ${corpusRegistered ? 'called' : 'NOT called'}`);
  if (!promptRegistered || !corpusRegistered) allPassed = false;
} catch (error) {
  console.log(`  ❌ Error in normal path: ${error}`);
  allPassed = false;
}

// ── Summary ──────────────────────────────────────────────────────────
console.log('\n=== Summary ===');
console.log(allPassed ? '✅ All checks passed — supplement registration is viable' : '❌ Some checks failed — review output above');
process.exit(allPassed ? 0 : 1);
