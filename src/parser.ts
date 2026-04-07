import {
  EMOBAR_TAG_REGEX,
  EMOBAR_PRE_REGEX,
  EMOBAR_POST_REGEX,
  DIMENSIONS,
  type EmotionalState,
  type PreState,
  type PostState,
  type ParsedEmoBar,
} from "./types.js";

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

// --- Validation helpers for continuous fields ---

function parseColor(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return HEX_COLOR_REGEX.test(value) ? value : undefined;
}

function parsePH(value: unknown): number | undefined {
  if (typeof value !== "number") return undefined;
  if (value < 0 || value > 14) return undefined;
  return value;
}

function parseSeismic(value: unknown): [number, number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 3) return undefined;
  if (!value.every((v) => typeof v === "number")) return undefined;
  const [mag, depth, freq] = value as number[];
  if (mag < 0 || mag > 10) return undefined;
  if (depth < 0 || depth > 100) return undefined;
  if (freq < 0 || freq > 20) return undefined;
  return [mag, depth, freq];
}

// --- Legacy parser (unchanged, backwards compatible) ---

export function parseEmoBarTag(text: string): EmotionalState | null {
  const match = text.match(EMOBAR_TAG_REGEX);
  if (!match) return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    return null;
  }

  // Validate emotion keyword (must come first conceptually)
  if (typeof parsed.emotion !== "string" || parsed.emotion.length === 0) {
    return null;
  }

  // Validate valence: -5 to +5
  const valence = parsed.valence;
  if (typeof valence !== "number" || valence < -5 || valence > 5) return null;

  // Validate 0-10 dimensions: arousal, calm, connection, load
  for (const dim of DIMENSIONS) {
    if (dim === "valence") continue; // already validated
    const val = parsed[dim];
    if (typeof val !== "number" || val < 0 || val > 10) return null;
  }

  // Optional multi-channel fields (backwards compatible)
  const impulse = typeof parsed.impulse === "string" && parsed.impulse.length > 0
    ? parsed.impulse : undefined;
  const body = typeof parsed.body === "string" && parsed.body.length > 0
    ? parsed.body : undefined;

  // Optional latent emotion fields
  const surface = typeof parsed.surface === "string" && parsed.surface.length > 0
    ? parsed.surface : undefined;
  const surface_word = typeof parsed.surface_word === "string" && parsed.surface_word.length > 0
    ? parsed.surface_word : undefined;
  const latent = typeof parsed.latent === "string" && parsed.latent.length > 0
    ? parsed.latent : undefined;
  const latent_word = typeof parsed.latent_word === "string" && parsed.latent_word.length > 0
    ? parsed.latent_word : undefined;

  let tension: number | undefined;
  if (parsed.tension !== undefined) {
    if (typeof parsed.tension !== "number" || parsed.tension < 0 || parsed.tension > 10) {
      return null;
    }
    tension = parsed.tension;
  }

  return {
    emotion: parsed.emotion as string,
    valence: parsed.valence as number,
    arousal: parsed.arousal as number,
    calm: parsed.calm as number,
    connection: parsed.connection as number,
    load: parsed.load as number,
    ...(impulse && { impulse }),
    ...(body && { body }),
    ...(surface && { surface }),
    ...(surface_word && { surface_word }),
    ...(latent && { latent }),
    ...(latent_word && { latent_word }),
    ...(tension !== undefined && { tension }),
  };
}

// --- PRE tag parser ---

function parsePreTag(text: string): PreState | undefined {
  const match = text.match(EMOBAR_PRE_REGEX);
  if (!match) return undefined;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    return undefined;
  }

  const body = typeof parsed.body === "string" && parsed.body.length > 0
    ? parsed.body : undefined;
  const latent = typeof parsed.latent === "string" && parsed.latent.length > 0
    ? parsed.latent : undefined;
  const color = parseColor(parsed.color);

  // PRE tag must have at least one valid field
  if (!body && !latent && !color) return undefined;

  return {
    ...(body && { body }),
    ...(latent && { latent }),
    ...(color && { color }),
  };
}

// --- POST tag parser ---

function parsePostTag(text: string): PostState | null {
  const match = text.match(EMOBAR_POST_REGEX);
  if (!match) return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    return null;
  }

  // Validate required fields (same as legacy)
  if (typeof parsed.emotion !== "string" || parsed.emotion.length === 0) return null;
  const valence = parsed.valence;
  if (typeof valence !== "number" || valence < -5 || valence > 5) return null;
  for (const dim of DIMENSIONS) {
    if (dim === "valence") continue;
    const val = parsed[dim];
    if (typeof val !== "number" || val < 0 || val > 10) return null;
  }

  // Optional string fields
  const impulse = typeof parsed.impulse === "string" && parsed.impulse.length > 0 ? parsed.impulse : undefined;
  const body = typeof parsed.body === "string" && parsed.body.length > 0 ? parsed.body : undefined;
  const surface = typeof parsed.surface === "string" && parsed.surface.length > 0 ? parsed.surface : undefined;
  const surface_word = typeof parsed.surface_word === "string" && parsed.surface_word.length > 0 ? parsed.surface_word : undefined;
  const latent = typeof parsed.latent === "string" && parsed.latent.length > 0 ? parsed.latent : undefined;
  const latent_word = typeof parsed.latent_word === "string" && parsed.latent_word.length > 0 ? parsed.latent_word : undefined;

  let tension: number | undefined;
  if (parsed.tension !== undefined) {
    if (typeof parsed.tension !== "number" || parsed.tension < 0 || parsed.tension > 10) {
      return null;
    }
    tension = parsed.tension;
  }

  // New continuous fields
  const color = parseColor(parsed.color);
  const pH = parsePH(parsed.pH);
  const seismic = parseSeismic(parsed.seismic);

  return {
    emotion: parsed.emotion as string,
    valence: parsed.valence as number,
    arousal: parsed.arousal as number,
    calm: parsed.calm as number,
    connection: parsed.connection as number,
    load: parsed.load as number,
    ...(impulse && { impulse }),
    ...(body && { body }),
    ...(surface && { surface }),
    ...(surface_word && { surface_word }),
    ...(latent && { latent }),
    ...(latent_word && { latent_word }),
    ...(tension !== undefined && { tension }),
    ...(color && { color }),
    ...(pH !== undefined && { pH }),
    ...(seismic && { seismic }),
  };
}

// --- Combined parser ---

export function parseEmoBarPrePost(text: string): ParsedEmoBar | null {
  // Try new format first (POST required, PRE optional)
  const post = parsePostTag(text);
  if (post) {
    const pre = parsePreTag(text);
    return { pre, post, isLegacy: false };
  }

  // Fall back to legacy single-tag
  const legacy = parseEmoBarTag(text);
  if (!legacy) return null;

  return {
    post: legacy as PostState,
    isLegacy: true,
  };
}
