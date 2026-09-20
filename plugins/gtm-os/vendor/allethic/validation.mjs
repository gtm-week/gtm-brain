// Deliberately bounded JSON Schema support. Unsupported keywords fail at model load,
// rather than advertising constraints the runtime silently ignores. No coercion.
import { isDeepStrictEqual } from "node:util";

const TYPES = new Set(["object", "array", "string", "number", "integer", "boolean", "null"]);
const KEYS = new Set(["type", "properties", "required", "additionalProperties", "items", "enum", "minimum", "maximum", "minItems", "maxItems", "minLength", "maxLength", "anyOf", "oneOf", "description", "title"]);
const object = v => v !== null && typeof v === "object" && !Array.isArray(v);

export function checkSchema(schema, path = "schema") {
  if (!object(schema)) throw new Error(`${path}: expected a schema object`);
  for (const key of Object.keys(schema)) if (!KEYS.has(key)) throw new Error(`${path}: unsupported schema keyword ${key}`);
  if (schema.type !== undefined && !TYPES.has(schema.type)) throw new Error(`${path}: unsupported type ${schema.type}`);
  for (const key of ["description", "title"]) if (schema[key] !== undefined && typeof schema[key] !== "string") throw new Error(`${path}.${key}: expected text`);
  if (schema.properties !== undefined) {
    if (!object(schema.properties)) throw new Error(`${path}.properties: expected an object`);
    for (const [key, child] of Object.entries(schema.properties)) checkSchema(child, `${path}.${key}`);
  }
  if (schema.required !== undefined && (!Array.isArray(schema.required) || schema.required.some(k => typeof k !== "string") || new Set(schema.required).size !== schema.required.length)) throw new Error(`${path}.required: expected unique field names`);
  if (schema.additionalProperties !== undefined && typeof schema.additionalProperties !== "boolean") checkSchema(schema.additionalProperties, `${path}.additionalProperties`);
  if (schema.items !== undefined) checkSchema(schema.items, `${path}.items`);
  if (schema.enum !== undefined && (!Array.isArray(schema.enum) || !schema.enum.length)) throw new Error(`${path}.enum: expected nonempty choices`);
  for (const key of ["minimum", "maximum", "minItems", "maxItems", "minLength", "maxLength"]) {
    if (schema[key] !== undefined && (!Number.isFinite(schema[key]) || (!key.endsWith("imum") && (!Number.isInteger(schema[key]) || schema[key] < 0)))) throw new Error(`${path}.${key}: invalid bound`);
  }
  for (const key of ["anyOf", "oneOf"]) if (schema[key] !== undefined) {
    if (!Array.isArray(schema[key]) || !schema[key].length) throw new Error(`${path}.${key}: expected nonempty schemas`);
    schema[key].forEach((s, i) => checkSchema(s, `${path}.${key}[${i}]`));
  }
  return schema;
}

export function validateValue(schema, value, path = "arguments") {
  const matches = type => type === "object" ? object(value) : type === "array" ? Array.isArray(value) : type === "null" ? value === null : type === "integer" ? Number.isInteger(value) : type === "number" ? typeof value === "number" && Number.isFinite(value) : typeof value === type;
  if (schema.type && !matches(schema.type)) return `${path} must be ${schema.type}`;
  if (schema.enum && !schema.enum.some(v => isDeepStrictEqual(v, value))) return `${path} must be one of ${JSON.stringify(schema.enum)}`;
  for (const key of ["anyOf", "oneOf"]) if (schema[key]) {
    const errors = schema[key].map(s => validateValue(s, value, path));
    const count = errors.filter(e => !e).length;
    if (key === "anyOf" ? count === 0 : count !== 1) return `${path} must match ${key === "anyOf" ? "at least one" : "exactly one"} input shape (${errors.filter(Boolean).join("; ")})`;
  }
  if (object(value)) {
    for (const key of schema.required || []) if (!Object.hasOwn(value, key)) return `${path} needs ${key}`;
    for (const [key, v] of Object.entries(value)) {
      let child;
      if (Object.hasOwn(schema.properties || {}, key)) child = schema.properties[key];
      else if (schema.additionalProperties === false) return `${path}.${key} is not allowed`;
      else if (object(schema.additionalProperties)) child = schema.additionalProperties;
      if (child) { const error = validateValue(child, v, `${path}.${key}`); if (error) return error; }
    }
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) return `${path} needs at least ${schema.minItems} items`;
    if (schema.maxItems !== undefined && value.length > schema.maxItems) return `${path} allows at most ${schema.maxItems} items`;
    if (schema.items) for (let i = 0; i < value.length; i++) { const error = validateValue(schema.items, value[i], `${path}[${i}]`); if (error) return error; }
  }
  if (typeof value === "string") {
    const length = [...value].length;
    if (schema.minLength !== undefined && length < schema.minLength) return `${path} needs at least ${schema.minLength} characters`;
    if (schema.maxLength !== undefined && length > schema.maxLength) return `${path} allows at most ${schema.maxLength} characters`;
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) return `${path} must be at least ${schema.minimum}`;
    if (schema.maximum !== undefined && value > schema.maximum) return `${path} must be at most ${schema.maximum}`;
  }
  return null;
}
