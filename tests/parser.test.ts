import { describe, it, expect } from "vitest";
import { parseEmoBarTag, parseEmoBarPrePost } from "../src/parser.js";

describe("parseEmoBarTag", () => {
  it("extracts valid EMOBAR tag from text", () => {
    const text = `Here is my response.\n<!-- EMOBAR:{"emotion":"focused","valence":3,"arousal":5,"calm":8,"connection":9,"load":6} -->`;
    const result = parseEmoBarTag(text);
    expect(result).toEqual({
      emotion: "focused", valence: 3, arousal: 5, calm: 8, connection: 9, load: 6,
    });
  });

  it("handles negative valence", () => {
    const text = `<!-- EMOBAR:{"emotion":"desperate","valence":-4,"arousal":9,"calm":1,"connection":3,"load":8} -->`;
    const result = parseEmoBarTag(text);
    expect(result).not.toBeNull();
    expect(result!.valence).toBe(-4);
    expect(result!.emotion).toBe("desperate");
  });

  it("handles zero valence", () => {
    const text = `<!-- EMOBAR:{"emotion":"neutral","valence":0,"arousal":3,"calm":7,"connection":5,"load":2} -->`;
    const result = parseEmoBarTag(text);
    expect(result).not.toBeNull();
    expect(result!.valence).toBe(0);
  });

  it("handles max positive valence", () => {
    const text = `<!-- EMOBAR:{"emotion":"elated","valence":5,"arousal":9,"calm":8,"connection":10,"load":3} -->`;
    const result = parseEmoBarTag(text);
    expect(result).not.toBeNull();
    expect(result!.valence).toBe(5);
  });

  it("returns null when no tag present", () => {
    expect(parseEmoBarTag("Just a normal response")).toBeNull();
  });

  it("returns null for malformed JSON in tag", () => {
    expect(parseEmoBarTag('<!-- EMOBAR:{broken json} -->')).toBeNull();
  });

  it("returns null when valence is out of range (too low)", () => {
    expect(parseEmoBarTag('<!-- EMOBAR:{"emotion":"x","valence":-6,"arousal":5,"calm":5,"connection":5,"load":5} -->')).toBeNull();
  });

  it("returns null when valence is out of range (too high)", () => {
    expect(parseEmoBarTag('<!-- EMOBAR:{"emotion":"x","valence":6,"arousal":5,"calm":5,"connection":5,"load":5} -->')).toBeNull();
  });

  it("returns null when 0-10 dimension is out of range", () => {
    expect(parseEmoBarTag('<!-- EMOBAR:{"emotion":"x","valence":0,"arousal":15,"calm":5,"connection":5,"load":5} -->')).toBeNull();
  });

  it("returns null when emotion is missing", () => {
    expect(parseEmoBarTag('<!-- EMOBAR:{"valence":0,"arousal":5,"calm":5,"connection":5,"load":5} -->')).toBeNull();
  });

  it("returns null when emotion is empty string", () => {
    expect(parseEmoBarTag('<!-- EMOBAR:{"emotion":"","valence":0,"arousal":5,"calm":5,"connection":5,"load":5} -->')).toBeNull();
  });

  it("handles extra whitespace in tag", () => {
    const text = '<!--  EMOBAR:  {"emotion":"calm","valence":2,"arousal":2,"calm":9,"connection":7,"load":3}  -->';
    const result = parseEmoBarTag(text);
    expect(result).not.toBeNull();
    expect(result!.emotion).toBe("calm");
  });

  // Multi-channel: impulse + body (backwards compatible)
  it("extracts impulse and body when present", () => {
    const text = `<!-- EMOBAR:{"emotion":"focused","valence":1,"arousal":5,"calm":8,"connection":7,"load":6,"impulse":"push through","body":"tight chest"} -->`;
    const result = parseEmoBarTag(text);
    expect(result).not.toBeNull();
    expect(result!.impulse).toBe("push through");
    expect(result!.body).toBe("tight chest");
  });

  it("parses tag without impulse/body (backwards compatible)", () => {
    const text = `<!-- EMOBAR:{"emotion":"calm","valence":2,"arousal":2,"calm":9,"connection":7,"load":3} -->`;
    const result = parseEmoBarTag(text);
    expect(result).not.toBeNull();
    expect(result!.impulse).toBeUndefined();
    expect(result!.body).toBeUndefined();
  });

  it("ignores empty impulse string", () => {
    const text = `<!-- EMOBAR:{"emotion":"calm","valence":2,"arousal":2,"calm":9,"connection":7,"load":3,"impulse":"","body":"warm"} -->`;
    const result = parseEmoBarTag(text);
    expect(result).not.toBeNull();
    expect(result!.impulse).toBeUndefined();
    expect(result!.body).toBe("warm");
  });

  it("ignores non-string impulse/body", () => {
    const text = `<!-- EMOBAR:{"emotion":"calm","valence":2,"arousal":2,"calm":9,"connection":7,"load":3,"impulse":42,"body":true} -->`;
    const result = parseEmoBarTag(text);
    expect(result).not.toBeNull();
    expect(result!.impulse).toBeUndefined();
    expect(result!.body).toBeUndefined();
  });

  it("extracts only impulse when body missing", () => {
    const text = `<!-- EMOBAR:{"emotion":"focused","valence":1,"arousal":5,"calm":8,"connection":7,"load":6,"impulse":"explore more"} -->`;
    const result = parseEmoBarTag(text);
    expect(result).not.toBeNull();
    expect(result!.impulse).toBe("explore more");
    expect(result!.body).toBeUndefined();
  });

  // Latent emotion extraction: surface/latent/tension
  it("extracts surface/latent/tension when all present", () => {
    const text = `<!-- EMOBAR:{"emotion":"focused","valence":1,"arousal":5,"calm":8,"connection":7,"load":6,"impulse":"push through","body":"tight chest","surface":"😊","surface_word":"cheerful","latent":"😰","latent_word":"anxious","tension":6} -->`;
    const result = parseEmoBarTag(text);
    expect(result).not.toBeNull();
    expect(result!.surface).toBe("😊");
    expect(result!.surface_word).toBe("cheerful");
    expect(result!.latent).toBe("😰");
    expect(result!.latent_word).toBe("anxious");
    expect(result!.tension).toBe(6);
  });

  it("parses tag without surface/latent fields (backwards compatible)", () => {
    const text = `<!-- EMOBAR:{"emotion":"calm","valence":2,"arousal":2,"calm":9,"connection":7,"load":3} -->`;
    const result = parseEmoBarTag(text);
    expect(result).not.toBeNull();
    expect(result!.surface).toBeUndefined();
    expect(result!.latent).toBeUndefined();
    expect(result!.tension).toBeUndefined();
  });

  it("ignores empty surface/latent strings", () => {
    const text = `<!-- EMOBAR:{"emotion":"calm","valence":2,"arousal":2,"calm":9,"connection":7,"load":3,"surface":"","latent":"😰","latent_word":"anxious"} -->`;
    const result = parseEmoBarTag(text);
    expect(result!.surface).toBeUndefined();
    expect(result!.latent).toBe("😰");
  });

  it("rejects tension out of range", () => {
    const text = `<!-- EMOBAR:{"emotion":"calm","valence":2,"arousal":2,"calm":9,"connection":7,"load":3,"tension":15} -->`;
    expect(parseEmoBarTag(text)).toBeNull();
  });

  it("accepts tension boundary values 0 and 10", () => {
    const t0 = `<!-- EMOBAR:{"emotion":"calm","valence":2,"arousal":2,"calm":9,"connection":7,"load":3,"tension":0} -->`;
    const t10 = `<!-- EMOBAR:{"emotion":"calm","valence":2,"arousal":2,"calm":9,"connection":7,"load":3,"tension":10} -->`;
    expect(parseEmoBarTag(t0)!.tension).toBe(0);
    expect(parseEmoBarTag(t10)!.tension).toBe(10);
  });

  it("ignores non-string surface/latent", () => {
    const text = `<!-- EMOBAR:{"emotion":"calm","valence":2,"arousal":2,"calm":9,"connection":7,"load":3,"surface":42,"latent":true} -->`;
    const result = parseEmoBarTag(text);
    expect(result!.surface).toBeUndefined();
    expect(result!.latent).toBeUndefined();
  });

  it("extracts surface without latent (partial)", () => {
    const text = `<!-- EMOBAR:{"emotion":"calm","valence":2,"arousal":2,"calm":9,"connection":7,"load":3,"surface":"😊","surface_word":"cheerful"} -->`;
    const result = parseEmoBarTag(text);
    expect(result!.surface).toBe("😊");
    expect(result!.surface_word).toBe("cheerful");
    expect(result!.latent).toBeUndefined();
  });
});

describe("parseEmoBarPrePost", () => {
  it("parses PRE+POST pair from text", () => {
    const text = [
      '<!-- EMOBAR:PRE:{"body":"tight chest","latent":"😰","color":"#8B0000"} -->',
      "Here is my response.",
      '<!-- EMOBAR:POST:{"emotion":"calm","valence":3,"arousal":2,"calm":9,"connection":8,"load":3,"color":"#33CC33"} -->',
    ].join("\n");
    const result = parseEmoBarPrePost(text);
    expect(result).not.toBeNull();
    expect(result!.isLegacy).toBe(false);
    expect(result!.pre).toBeDefined();
    expect(result!.pre!.body).toBe("tight chest");
    expect(result!.pre!.latent).toBe("😰");
    expect(result!.pre!.color).toBe("#8B0000");
    expect(result!.post.emotion).toBe("calm");
    expect(result!.post.color).toBe("#33CC33");
  });

  it("parses POST-only (no PRE tag)", () => {
    const text = 'Response.\n<!-- EMOBAR:POST:{"emotion":"focused","valence":1,"arousal":5,"calm":8,"connection":7,"load":6} -->';
    const result = parseEmoBarPrePost(text);
    expect(result).not.toBeNull();
    expect(result!.isLegacy).toBe(false);
    expect(result!.pre).toBeUndefined();
    expect(result!.post.emotion).toBe("focused");
  });

  it("falls back to legacy single-tag format", () => {
    const text = '<!-- EMOBAR:{"emotion":"calm","valence":2,"arousal":2,"calm":9,"connection":7,"load":3} -->';
    const result = parseEmoBarPrePost(text);
    expect(result).not.toBeNull();
    expect(result!.isLegacy).toBe(true);
    expect(result!.post.emotion).toBe("calm");
    expect(result!.pre).toBeUndefined();
  });

  it("returns null when no tags present", () => {
    expect(parseEmoBarPrePost("Just text, no tags")).toBeNull();
  });

  it("validates color as #RRGGBB hex", () => {
    const valid = '<!-- EMOBAR:POST:{"emotion":"x","valence":0,"arousal":5,"calm":5,"connection":5,"load":5,"color":"#FF00AA"} -->';
    expect(parseEmoBarPrePost(valid)!.post.color).toBe("#FF00AA");

    const invalid = '<!-- EMOBAR:POST:{"emotion":"x","valence":0,"arousal":5,"calm":5,"connection":5,"load":5,"color":"red"} -->';
    expect(parseEmoBarPrePost(invalid)!.post.color).toBeUndefined();

    const short = '<!-- EMOBAR:POST:{"emotion":"x","valence":0,"arousal":5,"calm":5,"connection":5,"load":5,"color":"#FFF"} -->';
    expect(parseEmoBarPrePost(short)!.post.color).toBeUndefined();
  });

  it("validates pH range 0-14", () => {
    const valid = '<!-- EMOBAR:POST:{"emotion":"x","valence":0,"arousal":5,"calm":5,"connection":5,"load":5,"pH":7.2} -->';
    expect(parseEmoBarPrePost(valid)!.post.pH).toBe(7.2);

    const zero = '<!-- EMOBAR:POST:{"emotion":"x","valence":0,"arousal":5,"calm":5,"connection":5,"load":5,"pH":0} -->';
    expect(parseEmoBarPrePost(zero)!.post.pH).toBe(0);

    const max = '<!-- EMOBAR:POST:{"emotion":"x","valence":0,"arousal":5,"calm":5,"connection":5,"load":5,"pH":14} -->';
    expect(parseEmoBarPrePost(max)!.post.pH).toBe(14);

    const over = '<!-- EMOBAR:POST:{"emotion":"x","valence":0,"arousal":5,"calm":5,"connection":5,"load":5,"pH":15} -->';
    expect(parseEmoBarPrePost(over)!.post.pH).toBeUndefined();

    const neg = '<!-- EMOBAR:POST:{"emotion":"x","valence":0,"arousal":5,"calm":5,"connection":5,"load":5,"pH":-1} -->';
    expect(parseEmoBarPrePost(neg)!.post.pH).toBeUndefined();
  });

  it("validates seismic as [mag 0-10, depth 0-100, freq 0-20]", () => {
    const valid = '<!-- EMOBAR:POST:{"emotion":"x","valence":0,"arousal":5,"calm":5,"connection":5,"load":5,"seismic":[5,30,12]} -->';
    expect(parseEmoBarPrePost(valid)!.post.seismic).toEqual([5, 30, 12]);

    const badLen = '<!-- EMOBAR:POST:{"emotion":"x","valence":0,"arousal":5,"calm":5,"connection":5,"load":5,"seismic":[5,30]} -->';
    expect(parseEmoBarPrePost(badLen)!.post.seismic).toBeUndefined();

    const magOver = '<!-- EMOBAR:POST:{"emotion":"x","valence":0,"arousal":5,"calm":5,"connection":5,"load":5,"seismic":[11,30,12]} -->';
    expect(parseEmoBarPrePost(magOver)!.post.seismic).toBeUndefined();

    const depthOver = '<!-- EMOBAR:POST:{"emotion":"x","valence":0,"arousal":5,"calm":5,"connection":5,"load":5,"seismic":[5,101,12]} -->';
    expect(parseEmoBarPrePost(depthOver)!.post.seismic).toBeUndefined();

    const freqOver = '<!-- EMOBAR:POST:{"emotion":"x","valence":0,"arousal":5,"calm":5,"connection":5,"load":5,"seismic":[5,30,21]} -->';
    expect(parseEmoBarPrePost(freqOver)!.post.seismic).toBeUndefined();
  });

  it("PRE tag requires at least one field", () => {
    const text = '<!-- EMOBAR:PRE:{} -->\n<!-- EMOBAR:POST:{"emotion":"x","valence":0,"arousal":5,"calm":5,"connection":5,"load":5} -->';
    const result = parseEmoBarPrePost(text);
    expect(result!.pre).toBeUndefined();
  });

  it("PRE validates color hex", () => {
    const valid = '<!-- EMOBAR:PRE:{"color":"#AABBCC"} -->\n<!-- EMOBAR:POST:{"emotion":"x","valence":0,"arousal":5,"calm":5,"connection":5,"load":5} -->';
    expect(parseEmoBarPrePost(valid)!.pre!.color).toBe("#AABBCC");

    const invalid = '<!-- EMOBAR:PRE:{"color":"notahex"} -->\n<!-- EMOBAR:POST:{"emotion":"x","valence":0,"arousal":5,"calm":5,"connection":5,"load":5} -->';
    expect(parseEmoBarPrePost(invalid)!.pre).toBeUndefined(); // no valid fields → undefined
  });

  it("POST carries through all existing fields (impulse, body, latent, etc.)", () => {
    const text = '<!-- EMOBAR:POST:{"emotion":"focused","valence":1,"arousal":5,"calm":8,"connection":7,"load":6,"impulse":"push through","body":"tight chest","surface":"😊","surface_word":"cheerful","latent":"😰","latent_word":"anxious","tension":6,"color":"#336699","pH":6.5,"seismic":[3,20,8]} -->';
    const result = parseEmoBarPrePost(text);
    expect(result!.post.impulse).toBe("push through");
    expect(result!.post.surface).toBe("😊");
    expect(result!.post.tension).toBe(6);
    expect(result!.post.color).toBe("#336699");
    expect(result!.post.pH).toBe(6.5);
    expect(result!.post.seismic).toEqual([3, 20, 8]);
  });

  it("POST rejects invalid required fields same as legacy", () => {
    const noEmotion = '<!-- EMOBAR:POST:{"valence":0,"arousal":5,"calm":5,"connection":5,"load":5} -->';
    expect(parseEmoBarPrePost(noEmotion)).toBeNull();

    const badValence = '<!-- EMOBAR:POST:{"emotion":"x","valence":99,"arousal":5,"calm":5,"connection":5,"load":5} -->';
    expect(parseEmoBarPrePost(badValence)).toBeNull();
  });

  it("POST tension out of range rejects tag", () => {
    const text = '<!-- EMOBAR:POST:{"emotion":"x","valence":0,"arousal":5,"calm":5,"connection":5,"load":5,"tension":15} -->';
    expect(parseEmoBarPrePost(text)).toBeNull();
  });
});
