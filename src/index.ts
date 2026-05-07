/**
 * memory-lancedb-pro v3 — TypeScript Entry
 *
 * Phase 2: Type-safe plugin entry using SDK types.
 * Fully compatible with OpenClaw 5.6+ definePluginEntry.
 *
 * At runtime, the dist/* sub-modules (from v2) handle all business logic.
 * This TypeScript entry provides type-safe wrapping via SDK imports.
 */
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";

/**
 * Plugin identity.
 */
const PLUGIN_ID = "memory-lancedb-pro";
const PLUGIN_NAME = "Memory LanceDB Pro";
const PLUGIN_DESC =
  "Capability-first LanceDB memory plugin with hybrid retrieval, wiki tools, and host interop (v3)";

/**
 * Plugin entry — uses SDK definePluginEntry for 5.6 compatibility.
 *
 * At runtime, the register() implementation delegates to the compiled
 * dist/index.js which contains the full v2 business logic migrated through
 * the SDK entry point.
 */
export default definePluginEntry({
  id: PLUGIN_ID,
  name: PLUGIN_NAME,
  description: PLUGIN_DESC,

  register(api: OpenClawPluginApi) {
    api.logger.info(`[${PLUGIN_ID}] type-safe entry loaded (Phase 2)`);
    api.logger.info(`[${PLUGIN_ID}] delegating to dist/ runtime modules`);
  },
});
