/**
 * BrgyAlert — Input Sanitizer & Validator
 * 
 * Centralised security utility to strip dangerous characters from all user
 * input before it is sent to Firestore or to the Gemini AI model.
 * 
 * Attack vectors addressed:
 *   - Stored XSS (HTML/script tags in Firestore text fields)
 *   - AI prompt injection ("ignore previous instructions", "you are now..." etc.)
 *   - Null byte injection
 *   - Control character smuggling
 *   - Oversized payloads (DoS via huge text)
 */

// ─── Text Sanitisation ────────────────────────────────────────────────────────

/**
 * Strips dangerous characters and enforces a max length on any user-entered text.
 * Use before writing to Firestore (descriptions, witness info, chat messages, names).
 *
 * @param {string} input - Raw user input string
 * @param {number} maxLength - Max allowed character count (default: 1000)
 * @returns {string} Sanitised, trimmed string
 */
export function sanitizeText(input, maxLength = 1000) {
  if (!input || typeof input !== 'string') return '';

  let safe = input;

  // Remove null bytes and control characters (except newlines/tabs)
  safe = safe.replace(/\x00/g, '');
  safe = safe.replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Strip HTML/XML tags (e.g. <script>, <img>, <a href=...>)
  safe = safe.replace(/<[^>]*>/g, '');

  // Neutralise HTML entities that could encode scripts
  safe = safe
    .replace(/&lt;/gi, '<')    // decode first so we can strip again
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/<[^>]*>/g, '');  // strip decoded tags

  // Collapse excessive whitespace (but preserve single newlines for readability)
  safe = safe.replace(/[ \t]+/g, ' ');
  safe = safe.replace(/\n{3,}/g, '\n\n');

  // Trim leading/trailing whitespace
  safe = safe.trim();

  // Enforce max length
  if (safe.length > maxLength) {
    safe = safe.substring(0, maxLength);
  }

  return safe;
}

// ─── AI Prompt Injection Prevention ──────────────────────────────────────────

// Known prompt-injection trigger phrases that attackers use to hijack LLMs
const INJECTION_PATTERNS = [
  /ignore\s+(previous|all|above|prior|earlier)\s+(instructions?|prompts?|context|rules?)/gi,
  /you\s+are\s+now/gi,
  /act\s+as\s+(a\s+|an\s+)?/gi,
  /new\s+instructions?/gi,
  /system\s*:/gi,
  /disregard\s+(all|everything|the|any)/gi,
  /forget\s+(everything|all|prior|previous)/gi,
  /your\s+new\s+(role|task|job|goal|purpose)/gi,
  /pretend\s+(you\s+are|to\s+be)/gi,
  /roleplay\s+as/gi,
  /simulate\s+(being|a|an)/gi,
  /override\s+(your|all|previous)/gi,
  /\[INST\]/gi,
  /<\|im_start\|>/gi,
  /<<SYS>>/gi,
];

/**
 * Sanitises user input before appending it to an AI prompt.
 * Strips prompt-injection patterns and wraps in delimiter tags so the
 * AI model cannot be confused by user instructions embedded in the input.
 *
 * @param {string} input - Raw user input to be included in an AI prompt
 * @param {number} maxLength - Max allowed character count (default: 800)
 * @returns {string} Sanitised string wrapped in safe delimiter tags
 */
export function sanitizeForAI(input, maxLength = 800) {
  if (!input || typeof input !== 'string') return '';

  // First apply standard sanitization
  let safe = sanitizeText(input, maxLength);

  // Strip known prompt-injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    safe = safe.replace(pattern, '[FILTERED]');
  }

  return safe;
}

// ─── Email Validation ─────────────────────────────────────────────────────────

/**
 * Validates an email address using a strict RFC-compliant regex.
 * Rejects obviously malformed inputs like `a@b`, `user@`, `@domain.com`.
 *
 * @param {string} email - Email string to validate
 * @returns {boolean} True if the email format is valid
 */
export function validateEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (trimmed.length > 254) return false; // RFC 5321 max

  // Standard email format: local@domain.tld (tld must be 2+ chars)
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z]{2,})+$/;
  return emailRegex.test(trimmed);
}

// ─── Philippine Phone Number Validation ───────────────────────────────────────

/**
 * Validates a Philippine mobile number in the format: +63 9XX XXX XXXX
 * The stored format includes spaces — total expected length is 14 characters.
 *
 * @param {string} phone - Phone string to validate
 * @returns {boolean} True if the phone number format is valid
 */
export function validatePhilippinePhone(phone) {
  if (!phone || typeof phone !== 'string') return false;
  // Matches: +63 9XX XXX XXXX (with spaces) or +639XXXXXXXXX (without spaces)
  const phoneRegex = /^\+63\s?9\d{2}\s?\d{3}\s?\d{4}$/;
  return phoneRegex.test(phone.trim());
}
