// Pure plugin-package validation at the installation boundary: schema and size limits, GLSL tokens,
// CUBE dry runs, and envelope ranges. Browser-side compilation stays in install.ts; npm test runs this file through tsx.
import { parseCube } from "../gl/fx/cube.js";
import {
  ITEM_ID_RE,
  PACK_ID_RE,
  PLUGIN_FORMAT,
  PLUGIN_LIMITS,
  PROP_KEY_RE,
  type PluginNumberProp,
  type PluginPack,
} from "./types.js";

export type ValidateResult =
  { ok: true; pack: PluginPack } | { ok: false; errors: string[] };

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const bytes = (s: string): number => new TextEncoder().encode(s).length;

function checkName(errors: string[], at: string, v: unknown): void {
  if (!isStr(v) || !v.trim() || v.length > PLUGIN_LIMITS.maxNameLen) {
    errors.push(
      `${at}: name must be a string of 1..${PLUGIN_LIMITS.maxNameLen} characters`,
    );
  }
}

function checkProps(
  errors: string[],
  at: string,
  v: unknown,
): PluginNumberProp[] | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.length > PLUGIN_LIMITS.maxProps) {
    errors.push(`${at}: props must be an array of ≤${PLUGIN_LIMITS.maxProps} items`);
    return undefined;
  }
  const seen = new Set<string>();
  for (const [i, p] of v.entries()) {
    const where = `${at}.props[${i}]`;
    if (!isObj(p)) {
      errors.push(`${where}: must be an object`);
      continue;
    }
    if (!isStr(p.key) || !PROP_KEY_RE.test(p.key))
      errors.push(`${where}: invalid key (${PROP_KEY_RE})`);
    else if (seen.has(p.key)) errors.push(`${where}: duplicate key ${p.key}`);
    else seen.add(p.key);
    if (!isStr(p.label) || !p.label.trim()) errors.push(`${where}: label is missing`);
    if (!isNum(p.default) || !isNum(p.min) || !isNum(p.max) || p.min > p.max) {
      errors.push(`${where}: default/min/max must be finite numbers with min≤max`);
    }
    if (p.step !== undefined && (!isNum(p.step) || p.step <= 0))
      errors.push(`${where}: step must be >0`);
  }
  return v as PluginNumberProp[];
}

function checkFrag(
  errors: string[],
  at: string,
  frag: unknown,
  requiredTokens: string[],
): void {
  if (!isStr(frag) || !frag.trim()) {
    errors.push(`${at}: frag is missing`);
    return;
  }
  if (bytes(frag) > PLUGIN_LIMITS.maxFragBytes)
    errors.push(`${at}: frag is over ${PLUGIN_LIMITS.maxFragBytes / 1024}KB`);
  for (const token of requiredTokens) {
    if (!frag.includes(token)) errors.push(`${at}: frag must reference ${token}`);
  }
}

// data:image/* inline (limited length) or origin path/https; other schemes (javascript:, etc.) are rejected
function checkThumb(errors: string[], at: string, v: unknown): void {
  if (v === undefined) return;
  if (!isStr(v) || !v.trim()) {
    errors.push(`${at}: thumb must be a non-empty string`);
    return;
  }
  if (v.startsWith("data:image/")) {
    if (bytes(v) > PLUGIN_LIMITS.maxThumbBytes)
      errors.push(`${at}: thumb is over ${PLUGIN_LIMITS.maxThumbBytes / 1024}KB`);
    return;
  }
  if (
    !v.startsWith("/") &&
    !v.startsWith("https://") &&
    !v.startsWith("http://")
  ) {
    errors.push(`${at}: thumb must be data:image/* or a URL (/… | https://…)`);
  }
}

function checkItem(errors: string[], item: unknown, index: number): void {
  const at = `items[${index}]`;
  if (!isObj(item)) {
    errors.push(`${at}: must be an object`);
    return;
  }
  if (!isStr(item.id) || !ITEM_ID_RE.test(item.id))
    errors.push(`${at}: invalid id (${ITEM_ID_RE})`);
  checkName(errors, at, item.name);
  if (
    item.desc !== undefined &&
    (!isStr(item.desc) || item.desc.length > PLUGIN_LIMITS.maxDescLen)
  ) {
    errors.push(`${at}: desc is too long (≤${PLUGIN_LIMITS.maxDescLen})`);
  }
  checkThumb(errors, at, item.thumb);
  switch (item.type) {
    case "mg-template": {
      if (!isStr(item.code) || !item.code.trim())
        errors.push(`${at}: code is missing`);
      else if (bytes(item.code) > PLUGIN_LIMITS.maxCodeBytes)
        errors.push(`${at}: code is over ${PLUGIN_LIMITS.maxCodeBytes / 1024}KB`);
      for (const dim of ["width", "height"] as const) {
        const v = item[dim];
        if (v !== undefined && (!isNum(v) || v < 16 || v > 8192))
          errors.push(`${at}: ${dim} must be in [16, 8192]`);
      }
      const duration = item.durationInFrames;
      if (duration !== undefined && (!isNum(duration) || duration < 1 || duration > 216_000))
        errors.push(`${at}: durationInFrames must be in [1, 216000]`);
      if (item.props !== undefined && !isObj(item.props))
        errors.push(`${at}: props must be an object`);
      if (item.propSchema !== undefined) {
        if (!Array.isArray(item.propSchema) || item.propSchema.length > 32) {
          errors.push(`${at}: propSchema must be an array of ≤32 items`);
        } else {
          for (const [i, s] of item.propSchema.entries()) {
            if (!isObj(s) || !isStr(s.key) || !isStr(s.type)) {
              errors.push(`${at}.propSchema[${i}]: key/type strings are required`);
            }
          }
        }
      }
      return;
    }
    case "transition": {
      checkFrag(errors, at, item.frag, [
        "u_outgoing",
        "u_incoming",
        "u_progress",
      ]);
      checkProps(errors, at, item.props);
      const d = item.defaultDurationFrames;
      if (d !== undefined && (!isNum(d) || d < 2 || d > 300))
        errors.push(`${at}: defaultDurationFrames must be in [2, 300]`);
      return;
    }
    case "fx": {
      checkFrag(errors, at, item.frag, ["u_input"]);
      checkProps(errors, at, item.props);
      if (item.passes !== undefined) {
        if (
          !Array.isArray(item.passes) ||
          item.passes.length < 1 ||
          item.passes.length > 4
        ) {
          errors.push(`${at}: passes must be an array of 1..4 passes`);
        } else {
          for (const [i, pass] of item.passes.entries())
            checkFrag(errors, `${at}.passes[${i}]`, pass, []);
        }
      }
      return;
    }
    case "lut": {
      const hasCube = isStr(item.cube) && !!item.cube.trim();
      const hasFrag = isStr(item.frag) && !!item.frag.trim();
      if (hasCube === hasFrag) {
        errors.push(`${at}: provide exactly one of cube or frag`);
        return;
      }
      if (hasFrag) {
        checkFrag(errors, at, item.frag, ["u_input"]);
        checkProps(errors, at, item.props);
        return;
      }
      if (bytes(item.cube as string) > PLUGIN_LIMITS.maxCubeBytes) {
        errors.push(
          `${at}: cube is over ${PLUGIN_LIMITS.maxCubeBytes / 1024 / 1024}MB`,
        );
        return;
      }
      try {
        parseCube(item.cube as string);
      } catch (e) {
        errors.push(
          `${at}: cube could not be parsed — ${e instanceof Error ? e.message : String(e)}`,
        );
      }
      return;
    }
    case "zoom": {
      const env = item.envelope;
      const shapes = new Set([
        "hold", "punch", "slow-push", "instant", "zoom-out", "ease-in",
        "bounce", "snap", "pulse", "whip-in",
      ]);
      if (env === undefined && item.shape === undefined) {
        errors.push(`${at}: provide envelope or shape (or both)`);
      } else if (env !== undefined && (
        !Array.isArray(env)
        || env.length < PLUGIN_LIMITS.minEnvelopePoints
        || env.length > PLUGIN_LIMITS.maxEnvelopePoints
      )) {
        errors.push(
          `${at}: envelope must have ${PLUGIN_LIMITS.minEnvelopePoints}..${PLUGIN_LIMITS.maxEnvelopePoints} points`,
        );
      } else if (Array.isArray(env) &&
        !env.every(
          (v) => isNum(v) && v >= 0 && v <= PLUGIN_LIMITS.maxEnvelopeValue,
        )
      ) {
        errors.push(
          `${at}: envelope values must be in [0, ${PLUGIN_LIMITS.maxEnvelopeValue}]`,
        );
      }
      if (item.shape !== undefined && (!isStr(item.shape) || !shapes.has(item.shape)))
        errors.push(`${at}: invalid shape`);
      const mag = item.magnification;
      if (mag !== undefined && (!isNum(mag) || mag < 1 || mag > 16))
        errors.push(`${at}: magnification must be in [1, 16]`);
      for (const key of ["focalPointX", "focalPointY"] as const) {
        const value = item[key];
        if (value !== undefined && (!isNum(value) || value < 0 || value > 1))
          errors.push(`${at}: ${key} must be in [0, 1]`);
      }
      for (const key of ["easeInFrames", "easeOutFrames"] as const) {
        const value = item[key];
        if (value !== undefined && (!isNum(value) || value < 0 || value > 300))
          errors.push(`${at}: ${key} must be in [0, 300]`);
      }
      return;
    }
    default:
      errors.push(`${at}: unknown type ${String(item.type)}`);
  }
}

/** Verify a plugin package JSON (untrusted input). Returns ok only after all pass. */
export function validatePack(v: unknown): ValidateResult {
  const errors: string[] = [];
  if (!isObj(v)) return { ok: false, errors: ["The plugin pack must be a JSON object"] };
  if (v.format !== PLUGIN_FORMAT) {
    errors.push(
      `format must be "${PLUGIN_FORMAT}" (the only supported version; unknown formats are rejected)`,
    );
  }
  if (!isStr(v.id) || !PACK_ID_RE.test(v.id))
    errors.push(`Invalid pack id (${PACK_ID_RE})`);
  checkName(errors, "pack", v.name);
  if (!isStr(v.version) || !/^\d+\.\d+\.\d+$/.test(v.version))
    errors.push("version must be x.y.z");
  if (
    v.author !== undefined &&
    (!isStr(v.author) || v.author.length > PLUGIN_LIMITS.maxNameLen)
  )
    errors.push("author is too long");
  if (
    v.description !== undefined &&
    (!isStr(v.description) || v.description.length > PLUGIN_LIMITS.maxDescLen)
  )
    errors.push("description is too long");
  if (
    !Array.isArray(v.items) ||
    v.items.length < 1 ||
    v.items.length > PLUGIN_LIMITS.maxItems
  ) {
    errors.push(`items must have 1..${PLUGIN_LIMITS.maxItems} entries`);
  } else {
    const ids = new Set<string>();
    for (const [i, item] of v.items.entries()) {
      checkItem(errors, item, i);
      const id = isObj(item) && isStr(item.id) ? item.id : null;
      if (id) {
        if (ids.has(id)) errors.push(`items[${i}]: duplicate id ${id}`);
        ids.add(id);
      }
    }
  }
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    pack: { ...v, format: PLUGIN_FORMAT } as unknown as PluginPack,
  };
}

/** Verification of a single piece of content (for use by "Export as plugin"/editor built-in stream)*/
export function validateItem(item: unknown): string[] {
  const errors: string[] = [];
  checkItem(errors, item, 0);
  return errors;
}
