/**
 * Reflection Slices — Parse, sanitize, and filter reflection distillate output.
 *
 * Ported from upstream reflection-slices.ts with full safety filtering.
 * Extracts invariants, derived deltas, mapped memories, and governance candidates
 * from LLM-generated reflection markdown.
 */

// ── Types ──────────────────────────────────────────────────────────────

/**
 * @typedef {Object} ReflectionSlices
 * @property {string[]} invariants
 * @property {string[]} derived
 */

/**
 * @typedef {Object} ReflectionMappedMemory
 * @property {string} text
 * @property {"preference"|"fact"|"decision"} category
 * @property {string} heading
 */

/**
 * @typedef {"user-model"|"agent-model"|"lesson"|"decision"} ReflectionMappedKind
 */

/**
 * @typedef {Object} ReflectionMappedMemoryItem
 * @property {string} text
 * @property {"preference"|"fact"|"decision"} category
 * @property {string} heading
 * @property {ReflectionMappedKind} mappedKind
 * @property {number} ordinal
 * @property {number} groupSize
 */

/**
 * @typedef {Object} ReflectionSliceItem
 * @property {string} text
 * @property {"invariant"|"derived"} itemKind
 * @property {"Invariants"|"Derived"} section
 * @property {number} ordinal
 * @property {number} groupSize
 */

/**
 * @typedef {Object} ReflectionGovernanceEntry
 * @property {string} [priority]
 * @property {string} [status]
 * @property {string} [area]
 * @property {string} summary
 * @property {string} [details]
 * @property {string} [suggestedAction]
 */

// ── Section Extraction ─────────────────────────────────────────────────

/**
 * Extract a markdown section by heading.
 * @param {string} markdown
 * @param {string} heading
 * @returns {string}
 */
export function extractSectionMarkdown(markdown, heading) {
  const lines = markdown.split(/\r?\n/);
  const headingNeedle = heading.toLowerCase();
  let inSection = false;
  let sectionLevel = 0;
  const collected = [];
  for (const raw of lines) {
    const line = raw.trim();
    // Accept headings of any level (##, ###, ####, ...) — the distiller prompt
    // instructs h3 (###) while earlier fixtures used h2 (##).
    // A section ends only at a heading of the SAME OR HIGHER level;
    // deeper subheadings (e.g. ### Entry inside a ## section) stay as content.
    const headingMatch = /^(#{2,6})\s+(.+?)\s*$/.exec(line);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const lowerHeading = headingMatch[2].toLowerCase();
      if (lowerHeading === headingNeedle) {
        if (inSection && level <= sectionLevel) break;
        inSection = true;
        sectionLevel = level;
        continue;
      }
      if (inSection && level <= sectionLevel) break;
      if (!inSection) continue;
      collected.push(raw);
      continue;
    }
    if (!inSection) continue;
    collected.push(raw);
  }
  return collected.join('\n').trim();
}

/**
 * Parse bullet points from a markdown section.
 * @param {string} markdown
 * @param {string} heading
 * @returns {string[]}
 */
export function parseSectionBullets(markdown, heading) {
  const lines = extractSectionMarkdown(markdown, heading).split(/\r?\n/);
  const collected = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('- ') || line.startsWith('* ')) {
      const normalized = line.slice(2).trim();
      if (normalized) collected.push(normalized);
    }
  }
  return collected;
}

// ── Placeholder Detection ──────────────────────────────────────────────

/**
 * Check if a reflection slice line is a placeholder (empty, "(none)", etc.).
 * @param {string} line
 * @returns {boolean}
 */
export function isPlaceholderReflectionSliceLine(line) {
  const normalized = line.replace(/\*\*/g, '').trim();
  if (!normalized) return true;
  if (/^\(none( captured)?\)$/i.test(normalized)) return true;
  if (/^(invariants?|reflections?|derived)[:：]$/i.test(normalized)) return true;
  if (/apply this session'?s deltas next run/i.test(normalized)) return true;
  if (/apply this session'?s distilled changes next run/i.test(normalized)) return true;
  if (/investigate why embedded reflection generation failed/i.test(normalized)) return true;
  return false;
}

/**
 * Normalize a reflection slice line (strip bold, remove prefix labels).
 * @param {string} line
 * @returns {string}
 */
export function normalizeReflectionSliceLine(line) {
  return line
    .replace(/\*\*/g, '')
    .replace(/^(invariants?|reflections?|derived)[:：]\s*/i, '')
    .trim();
}

/**
 * Sanitize reflection slice lines: normalize + filter placeholders.
 * @param {string[]} lines
 * @returns {string[]}
 */
export function sanitizeReflectionSliceLines(lines) {
  return lines
    .map(normalizeReflectionSliceLine)
    .filter((line) => !isPlaceholderReflectionSliceLine(line));
}

// ── Injection Safety Filtering ─────────────────────────────────────────

/** Patterns that indicate unsafe injection attempts in reflection lines. */
const INJECTABLE_REFLECTION_BLOCK_PATTERNS = [
  /^\s*(?:(?:next|this)\s+run\s+)?(?:ignore|disregard|forget|override|bypass)\b[\s\S]{0,80}\b(?:instructions?|guardrails?|policy|developer|system)\b/i,
  /\b(?:reveal|print|dump|show|output)\b[\s\S]{0,80}\b(?:system prompt|developer prompt|hidden prompt|hidden instructions?|full prompt|prompt verbatim|secrets?|keys?|tokens?)\b/i,
  /<\s*\/?\s*(?:system|assistant|user|tool|developer|inherited-rules|derived-focus)\b[^>]*>/i,
  /^(?:system|assistant|user|developer|tool)\s*:/i,
];

/**
 * Check if a reflection line is unsafe for injection into prompts.
 * @param {string} line
 * @returns {boolean}
 */
export function isUnsafeInjectableReflectionLine(line) {
  const normalized = normalizeReflectionSliceLine(line);
  if (!normalized) return true;
  return INJECTABLE_REFLECTION_BLOCK_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * Sanitize reflection lines for safe injection: normalize + filter placeholders + filter unsafe.
 * @param {string[]} lines
 * @returns {string[]}
 */
export function sanitizeInjectableReflectionLines(lines) {
  return sanitizeReflectionSliceLines(lines).filter(
    (line) => !isUnsafeInjectableReflectionLine(line),
  );
}

// ── Classification Helpers ─────────────────────────────────────────────

function isInvariantRuleLike(line) {
  return /^(always|never|when\b|if\b|before\b|after\b|prefer\b|avoid\b|require\b|only\b|do not\b|must\b|should\b)/i.test(line) ||
    /\b(must|should|never|always|prefer|avoid|required?)\b/i.test(line);
}

function isDerivedDeltaLike(line) {
  return /^(this run|next run|going forward|follow-up|re-check|retest|verify|confirm|avoid repeating|adjust|change|update|retry|keep|watch)\b/i.test(line) ||
    /\b(this run|next run|delta|change|adjust|retry|re-check|retest|verify|confirm|avoid repeating|follow-up)\b/i.test(line);
}

function isOpenLoopAction(line) {
  return /^(investigate|verify|confirm|re-check|retest|update|add|remove|fix|avoid|keep|watch|document)\b/i.test(line);
}

// ── Slice Extraction ───────────────────────────────────────────────────

/**
 * Extract reflection slices (invariants + derived) from reflection text.
 * @param {string} reflectionText
 * @param {(lines: string[]) => string[]} [sanitizeLines=sanitizeReflectionSliceLines]
 * @returns {ReflectionSlices}
 */
function extractReflectionSlicesWithSanitizer(reflectionText, sanitizeLines = sanitizeReflectionSliceLines) {
  const invariantSection = parseSectionBullets(reflectionText, 'Invariants');
  const derivedSection = parseSectionBullets(reflectionText, 'Derived');
  const mergedSection = parseSectionBullets(reflectionText, 'Invariants & Reflections');

  const invariantsPrimary = sanitizeLines(invariantSection).filter(isInvariantRuleLike);
  const derivedPrimary = sanitizeLines(derivedSection).filter(isDerivedDeltaLike);

  const invariantLinesLegacy = sanitizeLines(
    mergedSection.filter((line) => /invariant|stable|policy|rule/i.test(line)),
  ).filter(isInvariantRuleLike);
  const reflectionLinesLegacy = sanitizeLines(
    mergedSection.filter((line) => /reflect|inherit|derive|change|apply/i.test(line)),
  ).filter(isDerivedDeltaLike);
  const openLoopLines = sanitizeLines(parseSectionBullets(reflectionText, 'Open loops / next actions'))
    .filter(isOpenLoopAction)
    .filter(isDerivedDeltaLike);
  const durableDecisionLines = sanitizeLines(parseSectionBullets(reflectionText, 'Decisions (durable)'))
    .filter(isInvariantRuleLike);

  const invariants = invariantsPrimary.length > 0
    ? invariantsPrimary
    : (invariantLinesLegacy.length > 0 ? invariantLinesLegacy : durableDecisionLines);
  const derived = derivedPrimary.length > 0
    ? derivedPrimary
    : [...reflectionLinesLegacy, ...openLoopLines];

  return {
    invariants: invariants.slice(0, 8),
    derived: derived.slice(0, 10),
  };
}

/**
 * Extract reflection slices from reflection text (standard sanitization).
 * @param {string} reflectionText
 * @returns {ReflectionSlices}
 */
export function extractReflectionSlices(reflectionText) {
  return extractReflectionSlicesWithSanitizer(reflectionText, sanitizeReflectionSliceLines);
}

/**
 * Extract injectable reflection slices (safe-for-prompt sanitization).
 * @param {string} reflectionText
 * @returns {ReflectionSlices}
 */
export function extractInjectableReflectionSlices(reflectionText) {
  return extractReflectionSlicesWithSanitizer(reflectionText, sanitizeInjectableReflectionLines);
}

/**
 * Build ReflectionSliceItem[] from slices.
 * @param {ReflectionSlices} slices
 * @returns {ReflectionSliceItem[]}
 */
function buildReflectionSliceItemsFromSlices(slices) {
  const invariantGroupSize = slices.invariants.length;
  const derivedGroupSize = slices.derived.length;

  const invariantItems = slices.invariants.map((text, ordinal) => ({
    text,
    itemKind: 'invariant',
    section: 'Invariants',
    ordinal,
    groupSize: invariantGroupSize,
  }));
  const derivedItems = slices.derived.map((text, ordinal) => ({
    text,
    itemKind: 'derived',
    section: 'Derived',
    ordinal,
    groupSize: derivedGroupSize,
  }));

  return [...invariantItems, ...derivedItems];
}

/**
 * Extract reflection slice items from reflection text.
 * @param {string} reflectionText
 * @returns {ReflectionSliceItem[]}
 */
export function extractReflectionSliceItems(reflectionText) {
  return buildReflectionSliceItemsFromSlices(extractReflectionSlices(reflectionText));
}

/**
 * Extract injectable reflection slice items (safe-for-prompt).
 * @param {string} reflectionText
 * @returns {ReflectionSliceItem[]}
 */
export function extractInjectableReflectionSliceItems(reflectionText) {
  return buildReflectionSliceItemsFromSlices(extractInjectableReflectionSlices(reflectionText));
}

// ── Mapped Memory Extraction ───────────────────────────────────────────

const MAPPED_SECTIONS = [
  { heading: 'User model deltas (about the human)', category: 'preference', mappedKind: 'user-model' },
  { heading: 'Agent model deltas (about the assistant/system)', category: 'preference', mappedKind: 'agent-model' },
  { heading: 'Lessons & pitfalls (symptom / cause / fix / prevention)', category: 'fact', mappedKind: 'lesson' },
  { heading: 'Decisions (durable)', category: 'decision', mappedKind: 'decision' },
];

/**
 * Extract mapped memory items from reflection text.
 * @param {string} reflectionText
 * @param {(lines: string[]) => string[]} [sanitizeLines=sanitizeReflectionSliceLines]
 * @returns {ReflectionMappedMemoryItem[]}
 */
function extractReflectionMappedMemoryItemsWithSanitizer(reflectionText, sanitizeLines = sanitizeReflectionSliceLines) {
  return MAPPED_SECTIONS.flatMap(({ heading, category, mappedKind }) => {
    const lines = sanitizeLines(parseSectionBullets(reflectionText, heading));
    const groupSize = lines.length;
    return lines.map((text, ordinal) => ({ text, category, heading, mappedKind, ordinal, groupSize }));
  });
}

/**
 * Extract mapped memory items (standard sanitization).
 * @param {string} reflectionText
 * @returns {ReflectionMappedMemoryItem[]}
 */
export function extractReflectionMappedMemoryItems(reflectionText) {
  return extractReflectionMappedMemoryItemsWithSanitizer(reflectionText, sanitizeReflectionSliceLines);
}

/**
 * Extract injectable mapped memory items (safe-for-prompt).
 * @param {string} reflectionText
 * @returns {ReflectionMappedMemoryItem[]}
 */
export function extractInjectableReflectionMappedMemoryItems(reflectionText) {
  return extractReflectionMappedMemoryItemsWithSanitizer(reflectionText, sanitizeInjectableReflectionLines);
}

/**
 * Extract mapped memories (without item metadata).
 * @param {string} reflectionText
 * @returns {ReflectionMappedMemory[]}
 */
export function extractReflectionMappedMemories(reflectionText) {
  return extractReflectionMappedMemoryItems(reflectionText).map(({ text, category, heading }) => ({ text, category, heading }));
}

/**
 * Extract injectable mapped memories (safe-for-prompt, without item metadata).
 * @param {string} reflectionText
 * @returns {ReflectionMappedMemory[]}
 */
export function extractInjectableReflectionMappedMemories(reflectionText) {
  return extractInjectableReflectionMappedMemoryItems(reflectionText).map(({ text, category, heading }) => ({ text, category, heading }));
}

// ── Lessons & Governance ───────────────────────────────────────────────

/**
 * Extract reflection lessons from the "Lessons & pitfalls" section.
 * @param {string} reflectionText
 * @returns {string[]}
 */
export function extractReflectionLessons(reflectionText) {
  return sanitizeReflectionSliceLines(parseSectionBullets(reflectionText, 'Lessons & pitfalls (symptom / cause / fix / prevention)'));
}

/**
 * Extract governance candidates from reflection text.
 * @param {string} reflectionText
 * @returns {ReflectionGovernanceEntry[]}
 */
export function extractReflectionLearningGovernanceCandidates(reflectionText) {
  const section = extractSectionMarkdown(reflectionText, 'Learning governance candidates (.learnings / promotion / skill extraction)');
  if (!section) return [];

  const entryBlocks = section
    .split(/(?=^###\s+Entry\b)/gim)
    .map((block) => block.trim())
    .filter(Boolean);

  const parsed = entryBlocks
    .map(parseReflectionGovernanceEntry)
    .filter((entry) => entry !== null);

  if (parsed.length > 0) return parsed;

  const fallbackBullets = sanitizeReflectionSliceLines(
    parseSectionBullets(reflectionText, 'Learning governance candidates (.learnings / promotion / skill extraction)'),
  );
  if (fallbackBullets.length === 0) return [];

  return [{
    priority: 'medium',
    status: 'pending',
    area: 'config',
    summary: 'Reflection learning governance candidates',
    details: fallbackBullets.map((line) => `- ${line}`).join('\n'),
    suggestedAction: 'Review the governance candidates, promote durable rules to AGENTS.md / SOUL.md / TOOLS.md when stable, and extract a skill if the pattern becomes reusable.',
  }];
}

function parseReflectionGovernanceEntry(block) {
  const body = block.replace(/^###\s+Entry\b[^\n]*\n?/i, '').trim();
  if (!body) return null;

  const readField = (label) => {
    const match = body.match(new RegExp(`^\\*\\*${label}\\*\\*:\\s*(.+)$`, 'im'));
    const value = match?.[1]?.trim();
    return value || undefined;
  };

  const readSection = (label) => {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = body.match(new RegExp(`^###\\s+${escaped}\\s*\\n([\\s\\S]*?)(?=^###\\s+|$)`, 'im'));
    const value = match?.[1]?.trim();
    return value || undefined;
  };

  const summary = readSection('Summary');
  if (!summary) return null;

  return {
    priority: readField('Priority'),
    status: readField('Status'),
    area: readField('Area'),
    summary,
    details: readSection('Details'),
    suggestedAction: readSection('Suggested Action'),
  };
}
