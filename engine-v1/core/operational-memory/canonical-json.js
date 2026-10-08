import { createHash } from "node:crypto";

function assertScalarString(value, label = "string") {
  if (typeof value !== "string") throw new TypeError(`${label}:STRING_REQUIRED`);
  for (let i = 0; i < value.length; i++) {
    const cu = value.charCodeAt(i);
    if (cu >= 0xd800 && cu <= 0xdbff) {
      if (i + 1 >= value.length) throw new TypeError(`${label}:LONE_HIGH_SURROGATE`);
      const next = value.charCodeAt(i + 1);
      if (next < 0xdc00 || next > 0xdfff) throw new TypeError(`${label}:LONE_HIGH_SURROGATE`);
      i++;
    } else if (cu >= 0xdc00 && cu <= 0xdfff) {
      throw new TypeError(`${label}:LONE_LOW_SURROGATE`);
    }
  }
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function normalizeJsonDomain(value, seen = new WeakSet(), label = "$") {
  if (value === null) return null;
  if (typeof value === "string") {
    assertScalarString(value, label);
    return value.normalize("NFC");
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${label}:NON_FINITE_NUMBER`);
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) throw new TypeError(`${label}:UNSAFE_INTEGER`);
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value === "boolean") return value;
  if (["undefined", "function", "symbol", "bigint"].includes(typeof value)) throw new TypeError(`${label}:UNSUPPORTED_JSON_VALUE`);
  if (typeof value !== "object") throw new TypeError(`${label}:UNSUPPORTED_JSON_VALUE`);
  if (seen.has(value)) throw new TypeError(`${label}:CYCLE`);
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const out = new Array(value.length);
      for (let i = 0; i < value.length; i++) {
        if (!Object.prototype.hasOwnProperty.call(value, i)) throw new TypeError(`${label}:SPARSE_ARRAY`);
        out[i] = normalizeJsonDomain(value[i], seen, `${label}[${i}]`);
      }
      return out;
    }
    if (!isPlainObject(value)) throw new TypeError(`${label}:PLAIN_OBJECT_REQUIRED`);
    const normalizedEntries = [];
    const names = new Set();
    for (const rawKey of Object.keys(value)) {
      assertScalarString(rawKey, `${label}:key`);
      const key = rawKey.normalize("NFC");
      if (names.has(key)) throw new TypeError(`${label}:POST_NFC_DUPLICATE_KEY:${key}`);
      names.add(key);
      normalizedEntries.push([key, normalizeJsonDomain(value[rawKey], seen, `${label}.${key}`)]);
    }
    normalizedEntries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const out = Object.create(null);
    for (const [key, child] of normalizedEntries) out[key] = child;
    return out;
  } finally {
    seen.delete(value);
  }
}

function serializeCanonical(value) {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return Object.is(value, -0) ? "0" : JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return `[${value.map(serializeCanonical).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${serializeCanonical(value[key])}`).join(",")}}`;
}

export function canonicalJson(value) { return serializeCanonical(normalizeJsonDomain(value)); }
export function canonicalUtf8Bytes(value) { return Buffer.from(canonicalJson(value), "utf8"); }
export function sha256HexBytes(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError("SHA256_BYTES_REQUIRED");
  return createHash("sha256").update(bytes).digest("hex");
}
export function sha256Canonical(value) { return sha256HexBytes(canonicalUtf8Bytes(value)); }
