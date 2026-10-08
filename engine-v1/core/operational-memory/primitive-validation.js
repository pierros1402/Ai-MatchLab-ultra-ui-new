import { NORMATIVE_REGEX_PATTERNS } from "./contract-v1.js";

export function assertUnicodeScalarString(value, label = "string") {
  if (typeof value !== "string") throw new TypeError(`${label}:STRING_REQUIRED`);
  for (let i = 0; i < value.length; i++) {
    const cu = value.charCodeAt(i);
    if (cu >= 0xd800 && cu <= 0xdbff) {
      if (i + 1 >= value.length) throw new TypeError(`${label}:LONE_HIGH_SURROGATE`);
      const next = value.charCodeAt(i + 1);
      if (next < 0xdc00 || next > 0xdfff) throw new TypeError(`${label}:LONE_HIGH_SURROGATE`);
      i++;
    } else if (cu >= 0xdc00 && cu <= 0xdfff) throw new TypeError(`${label}:LONE_LOW_SURROGATE`);
  }
  return value;
}

export function assertNfcString(value, label = "string") {
  assertUnicodeScalarString(value, label);
  if (value.normalize("NFC") !== value) throw new TypeError(`${label}:NFC_REQUIRED`);
  return value;
}

export function unicodeScalarLength(value) {
  assertUnicodeScalarString(value);
  return Array.from(value.normalize("NFC")).length;
}

function assertPlainObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label}:OBJECT_REQUIRED`);
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) throw new TypeError(`${label}:PLAIN_OBJECT_REQUIRED`);
}

export function assertExactKeys(value, required = [], optional = [], label = "object") {
  assertPlainObject(value, label);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new TypeError(`${label}:UNKNOWN_KEY:${key}`);
  for (const key of required) if (!Object.prototype.hasOwnProperty.call(value, key)) throw new TypeError(`${label}:MISSING_KEY:${key}`);
  return value;
}

function parseQuantifier(body, index) {
  if (body[index] !== "{") return index;
  const end = body.indexOf("}", index + 1);
  if (end < 0) throw new TypeError("PORTABLE_REGEX:UNCLOSED_QUANTIFIER");
  const token = body.slice(index + 1, end);
  if (!/^(?:0|[1-9][0-9]*)(?:,(?:0|[1-9][0-9]*))?$/.test(token)) throw new TypeError("PORTABLE_REGEX:BAD_QUANTIFIER");
  const [a, b = a] = token.split(",").map(Number);
  if (a > b || a > 4096 || b > 4096) throw new TypeError("PORTABLE_REGEX:QUANTIFIER_RANGE");
  return end + 1;
}

function parseClass(body, start) {
  let i = start + 1;
  if (i >= body.length) throw new TypeError("PORTABLE_REGEX:UNCLOSED_CLASS");
  if (body[i] === "^") throw new TypeError("PORTABLE_REGEX:CLASS_NEGATION_FORBIDDEN");
  let members = 0;
  while (i < body.length && body[i] !== "]") {
    const three = body.slice(i, i + 3);
    if (three === "A-Z" || three === "a-z" || three === "0-9") { i += 3; members++; continue; }
    const ch = body[i];
    const code = ch.charCodeAt(0);
    if (code < 0x21 || code > 0x7e || ch === "[" || ch === "\\" || ch === "^") throw new TypeError("PORTABLE_REGEX:BAD_CLASS_LITERAL");
    if (ch === "-" && body[i + 1] !== "]") throw new TypeError("PORTABLE_REGEX:BAD_HYPHEN");
    i++; members++;
  }
  if (i >= body.length || body[i] !== "]") throw new TypeError("PORTABLE_REGEX:UNCLOSED_CLASS");
  if (members === 0) throw new TypeError("PORTABLE_REGEX:EMPTY_CLASS");
  return i + 1;
}

export function assertPortableRegexDefinition(pattern) {
  assertUnicodeScalarString(pattern, "pattern");
  if (!pattern.startsWith("^") || !pattern.endsWith("$")) throw new TypeError("PORTABLE_REGEX:ANCHORS_REQUIRED");
  if (pattern.indexOf("^", 1) !== -1 || pattern.slice(0, -1).includes("$")) throw new TypeError("PORTABLE_REGEX:ANCHORS_EXACTLY_ONCE");
  const body = pattern.slice(1, -1);
  if (body.length === 0) throw new TypeError("PORTABLE_REGEX:EMPTY_BODY");
  let i = 0;
  while (i < body.length) {
    const ch = body[i];
    if (ch === "[") i = parseClass(body, i);
    else {
      const code = ch.charCodeAt(0);
      const forbidden = "^$[]{}()|\\*+?.";
      if (code < 0x21 || code > 0x7e || forbidden.includes(ch)) throw new TypeError(`PORTABLE_REGEX:BAD_LITERAL:${ch}`);
      i++;
    }
    if (body[i] === "{") i = parseQuantifier(body, i);
    if (i < body.length && ["?", "*", "+", ".", "(", ")", "|", "\\"].includes(body[i])) throw new TypeError("PORTABLE_REGEX:FORBIDDEN_OPERATOR");
  }
  return pattern;
}

export function matchPortablePattern(value, pattern) {
  assertUnicodeScalarString(value, "value");
  assertPortableRegexDefinition(pattern);
  return new RegExp(pattern).test(value);
}

export function assertRawUtf8(raw) {
  if (!(raw instanceof Uint8Array)) throw new TypeError("RAW_UTF8_BYTES_REQUIRED");
  if (raw.length >= 3 && raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) throw new TypeError("UTF8_BOM_FORBIDDEN");
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  const text = decoder.decode(raw);
  assertUnicodeScalarString(text, "rawUtf8");
  return text;
}

function strictParse(text) {
  assertUnicodeScalarString(text, "json");
  let i = 0;
  const ws = () => { while (i < text.length && /[\u0009\u000a\u000d\u0020]/.test(text[i])) i++; };
  const parseString = () => {
    if (text[i] !== '"') throw new SyntaxError("JSON_STRING_REQUIRED");
    const start = i++;
    let escaped = false;
    while (i < text.length) {
      const ch = text[i++];
      if (escaped) { escaped = false; continue; }
      if (ch === "\\") { escaped = true; continue; }
      if (ch === '"') {
        const value = JSON.parse(text.slice(start, i));
        assertUnicodeScalarString(value, "jsonString");
        return value;
      }
      if (ch.charCodeAt(0) < 0x20) throw new SyntaxError("JSON_CONTROL_CHAR");
    }
    throw new SyntaxError("JSON_UNTERMINATED_STRING");
  };
  const parseNumber = () => {
    const m = text.slice(i).match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/);
    if (!m) throw new SyntaxError("JSON_BAD_NUMBER");
    i += m[0].length;
    const n = Number(m[0]);
    if (!Number.isFinite(n)) throw new SyntaxError("JSON_NON_FINITE");
    if (Number.isInteger(n) && !Number.isSafeInteger(n)) throw new SyntaxError("JSON_UNSAFE_INTEGER");
    return Object.is(n, -0) ? 0 : n;
  };
  const parseValue = () => {
    ws();
    if (i >= text.length) throw new SyntaxError("JSON_UNEXPECTED_EOF");
    const ch = text[i];
    if (ch === '"') return parseString();
    if (ch === "{") {
      i++; ws();
      const out = Object.create(null);
      const rawNames = new Set();
      const nfcNames = new Set();
      if (text[i] === "}") { i++; return out; }
      while (true) {
        ws();
        const rawKey = parseString();
        if (rawNames.has(rawKey)) throw new SyntaxError(`JSON_DUPLICATE_KEY:${rawKey}`);
        rawNames.add(rawKey);
        const key = rawKey.normalize("NFC");
        if (nfcNames.has(key)) throw new SyntaxError(`JSON_POST_NFC_DUPLICATE_KEY:${key}`);
        nfcNames.add(key);
        ws();
        if (text[i++] !== ":") throw new SyntaxError("JSON_COLON_REQUIRED");
        out[key] = parseValue();
        ws();
        if (text[i] === "}") { i++; break; }
        if (text[i++] !== ",") throw new SyntaxError("JSON_COMMA_REQUIRED");
      }
      return out;
    }
    if (ch === "[") {
      i++; ws();
      const out = [];
      if (text[i] === "]") { i++; return out; }
      while (true) {
        out.push(parseValue());
        ws();
        if (text[i] === "]") { i++; break; }
        if (text[i++] !== ",") throw new SyntaxError("JSON_COMMA_REQUIRED");
      }
      return out;
    }
    if (text.startsWith("true", i)) { i += 4; return true; }
    if (text.startsWith("false", i)) { i += 5; return false; }
    if (text.startsWith("null", i)) { i += 4; return null; }
    return parseNumber();
  };
  const result = parseValue(); ws();
  if (i !== text.length) throw new SyntaxError("JSON_TRAILING_DATA");
  const normalize = (value) => {
    if (typeof value === "string") return value.normalize("NFC");
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === "object") {
      const out = Object.create(null);
      for (const key of Object.keys(value)) out[key] = normalize(value[key]);
      return out;
    }
    return value;
  };
  return normalize(result);
}

export function parseStrictJson(raw) {
  const text = raw instanceof Uint8Array ? assertRawUtf8(raw) : raw;
  if (typeof text !== "string") throw new TypeError("JSON_STRING_OR_BYTES_REQUIRED");
  return strictParse(text);
}

for (const pattern of Object.values(NORMATIVE_REGEX_PATTERNS)) assertPortableRegexDefinition(pattern);
