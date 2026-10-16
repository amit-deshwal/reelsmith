// Generated from reelsmith-docs/plan/schemas/recipe.schema.json. Edit the JSON, then re-run: npx tsx src/reelsmith/sync-recipe-schema.mts
export const RECIPE_SCHEMA = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://reelsmith.local/schemas/recipe.schema.json",
  "title": "Reelsmith recipe manifest v1",
  "description": "Declarative, code-free recipe. A recipe declares inputs, user-tunable params, style tokens and a structure. A versioned, built-in assembler strategy turns them into timeline ops. Recipes cannot contain executable code, URLs to fetch or file paths; template strings support only {{inputs.X}} / {{params.X}} substitution.",
  "type": "object",
  "required": ["schemaVersion", "id", "version", "name", "category", "canvas", "inputs", "params", "assembler", "structure", "styles"],
  "additionalProperties": false,
  "properties": {
    "$schema": { "type": "string" },
    "schemaVersion": { "const": 1 },
    "id": { "type": "string", "pattern": "^[a-z0-9][a-z0-9-]{2,63}$" },
    "version": { "type": "string", "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$" },
    "name": { "type": "string", "minLength": 1, "maxLength": 60 },
    "category": { "enum": ["travel", "vlog", "beat-cut", "captioned-story", "collage", "other"] },
    "description": { "type": "string", "maxLength": 400 },
    "tags": { "type": "array", "maxItems": 12, "items": { "type": "string", "maxLength": 24 } },
    "preview": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "poster": { "type": "string", "pattern": "^previews/[a-z0-9-]+\\.(jpg|png|webp)$" },
        "loop": { "type": "string", "pattern": "^previews/[a-z0-9-]+\\.(mp4|webm)$" },
        "generatedFrom": { "enum": ["synthetic-sample", "user-footage"], "description": "Built-in previews are rendered from procedurally generated sample media, so no third-party assets are shipped." }
      }
    },
    "canvas": {
      "type": "object",
      "required": ["width", "height", "fps"],
      "additionalProperties": false,
      "properties": {
        "width": { "type": "integer", "minimum": 16, "multipleOf": 2 },
        "height": { "type": "integer", "minimum": 16, "multipleOf": 2 },
        "fps": { "type": "object", "required": ["num", "den"], "additionalProperties": false, "properties": { "num": { "type": "integer", "minimum": 1 }, "den": { "type": "integer", "minimum": 1 } } }
      }
    },
    "duration": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "mode": { "enum": ["fitMusic", "fixed", "fitContent"] },
        "minSec": { "type": "number", "minimum": 1, "maximum": 900 },
        "targetSec": { "type": "number", "minimum": 1, "maximum": 900 },
        "maxSec": { "type": "number", "minimum": 1, "maximum": 900 }
      }
    },
    "inputs": {
      "type": "array",
      "minItems": 1,
      "maxItems": 12,
      "items": {
        "oneOf": [
          {
            "type": "object",
            "required": ["id", "kind", "accept", "min", "max", "label"],
            "additionalProperties": false,
            "properties": {
              "id": { "$ref": "#/$defs/key" },
              "kind": { "const": "media" },
              "accept": { "type": "array", "minItems": 1, "uniqueItems": true, "items": { "enum": ["video", "image", "audio"] } },
              "min": { "type": "integer", "minimum": 0, "maximum": 200 },
              "max": { "type": "integer", "minimum": 1, "maximum": 200 },
              "label": { "type": "string", "maxLength": 80 },
              "hint": { "type": "string", "maxLength": 200 },
              "constraints": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "minClipSec": { "type": "number", "minimum": 0 },
                  "preferOrientation": { "enum": ["portrait", "landscape", "any"] },
                  "requiresSpeech": { "type": "boolean" }
                }
              }
            }
          },
          {
            "type": "object",
            "required": ["id", "kind", "label"],
            "additionalProperties": false,
            "properties": {
              "id": { "$ref": "#/$defs/key" },
              "kind": { "const": "text" },
              "label": { "type": "string", "maxLength": 80 },
              "placeholder": { "type": "string", "maxLength": 120 },
              "default": { "type": "string", "maxLength": 500, "description": "Pre-filled text in the setup form." },
              "optional": { "type": "boolean", "default": false },
              "maxLength": { "type": "integer", "minimum": 1, "maximum": 500 }
            }
          }
        ]
      }
    },
    "params": {
      "type": "array",
      "maxItems": 24,
      "items": {
        "type": "object",
        "required": ["id", "type", "label", "default"],
        "additionalProperties": false,
        "properties": {
          "id": { "$ref": "#/$defs/key" },
          "type": { "enum": ["number", "integer", "boolean", "enum", "color", "font", "seconds"] },
          "label": { "type": "string", "maxLength": 80 },
          "default": {},
          "min": { "type": "number" },
          "max": { "type": "number" },
          "step": { "type": "number", "exclusiveMinimum": 0 },
          "options": { "type": "array", "minItems": 1, "maxItems": 20, "items": { "type": ["string", "number"] } },
          "agentEditable": { "type": "boolean", "default": true }
        },
        "allOf": [
          { "if": { "properties": { "type": { "const": "enum" } } }, "then": { "required": ["options"] } },
          { "if": { "properties": { "type": { "enum": ["number", "integer", "seconds"] } } }, "then": { "required": ["min", "max"] } }
        ]
      }
    },
    "music": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "inputId": { "$ref": "#/$defs/key" },
        "required": { "type": "boolean" },
        "startPolicy": { "enum": ["fromStart", "firstDownbeat", "loudestSection", "userOffset"] },
        "endPolicy": { "enum": ["fadeOut", "endOnBar", "hardCut"] },
        "fadeOutSec": { "type": "number", "minimum": 0, "maximum": 10 },
        "gainDb": { "type": "number", "minimum": -40, "maximum": 6 },
        "clipAudioGainDb": { "type": "number", "minimum": -96, "maximum": 6, "description": "Original clip audio under the music; -96 = muted." },
        "duckUnderSpeech": { "type": "boolean" }
      }
    },
    "assembler": {
      "type": "object",
      "required": ["strategy"],
      "additionalProperties": false,
      "properties": {
        "strategy": { "enum": ["beat-montage@1", "story-vlog@1", "captioned-story@1", "collage-grid@1", "travel-diary@1"] },
        "options": { "type": "object", "description": "Validated by the strategy's own schema (see cardboardrebuild.txt §8.4)." },
        "aiSelection": { "enum": ["off", "optional", "recommended"], "default": "optional", "description": "Whether the user's agent may rank/select clips. The deterministic heuristic always works without AI." }
      }
    },
    "structure": {
      "type": "array",
      "minItems": 1,
      "maxItems": 20,
      "items": {
        "type": "object",
        "required": ["section"],
        "additionalProperties": false,
        "properties": {
          "section": { "type": "string", "pattern": "^[a-z][a-zA-Z0-9-]{0,31}$" },
          "lengthBeats": { "type": "integer", "minimum": 1, "maximum": 512 },
          "lengthSec": { "type": "number", "minimum": 0.1, "maximum": 600 },
          "fill": { "enum": ["none", "clips", "photos", "speech", "layout"] },
          "cutRule": { "enum": ["everyBeat", "every2Beats", "everyBar", "onSpeechPhrases", "fixedSec"] },
          "shotSec": { "type": "array", "minItems": 2, "maxItems": 2, "items": { "type": "number", "minimum": 0.1, "maximum": 30 }, "description": "[min,max] shot length when not beat-driven." },
          "layout": { "enum": ["split2v", "split2h", "split3v", "grid2x2", "grid3x3"] },
          "transition": { "enum": ["cut", "crossfade", "dipToBlack", "dipToWhite", "slideLeft", "slideUp", "pushLeft", "zoomIn", "flash", "bars", "wide-bars", "window", "auto"], "description": "Transition into each shot of the section. \"auto\" rotates through assembler.options.autoTransitions (default bars, wide-bars, window, flash)." },
          "strobe": { "type": "boolean", "description": "Flash-cut hook: the section length and cut step come from the params hookSec (default 1.5) and flashSec (0.3-0.6, default 0.5), in whole beats." },
          "overlays": {
            "type": "array",
            "maxItems": 6,
            "items": {
              "type": "object",
              "required": ["kind"],
              "additionalProperties": false,
              "properties": {
                "kind": { "enum": ["title", "label", "captions", "timestamp", "placeName"] },
                "text": { "type": "string", "maxLength": 200, "pattern": "^([^{}]|\\{\\{(inputs|params)\\.[a-zA-Z][a-zA-Z0-9_]*\\}\\})*$" },
                "styleId": { "type": "string", "pattern": "^[a-z0-9.-]{1,64}$" },
                "animationIn": { "enum": ["none", "fade", "pop", "slideUp", "typewriter", "wordByWord"] },
                "position": { "enum": ["top", "upperThird", "center", "lowerThird", "bottomSafe"] },
                "atBeat": { "type": "integer", "minimum": 0 },
                "durationBeats": { "type": "integer", "minimum": 1 }
              }
            }
          }
        }
      }
    },
    "styles": {
      "type": "object",
      "description": "Style tokens referenced by styleId. Same shape as project textStyle; fonts must be in the bundled font allowlist.",
      "additionalProperties": { "type": "object" }
    },
    "look": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "colorLook": { "enum": ["none", "warmFilm", "coolClean", "vivid", "mutedMatte", "bw"] },
        "grain": { "type": "number", "minimum": 0, "maximum": 1 },
        "vignette": { "type": "number", "minimum": 0, "maximum": 1 }
      }
    },
    "casting": {
      "type": "object",
      "additionalProperties": false,
      "description": "Cast shots by what they show (RS-109): tags wanted for the opening and closing shot.",
      "properties": {
        "opener": { "type": "array", "items": { "enum": ["scenery", "people", "portrait", "action", "food", "detail", "city", "water", "night"] } },
        "closer": { "type": "array", "items": { "enum": ["scenery", "people", "portrait", "action", "food", "detail", "city", "water", "night"] } }
      }
    },
    "ratios": {
      "type": "object",
      "description": "Other output shapes this recipe supports besides its canvas (RS-901). The canvas size comes from the ratio; `styles` replaces keys of the named styles for that ratio (text size, position).",
      "additionalProperties": false,
      "properties": {
        "9:16": { "$ref": "#/$defs/ratioOverrides" }, "3:4": { "$ref": "#/$defs/ratioOverrides" }, "4:5": { "$ref": "#/$defs/ratioOverrides" },
        "1:1": { "$ref": "#/$defs/ratioOverrides" }, "16:9": { "$ref": "#/$defs/ratioOverrides" }, "4:3": { "$ref": "#/$defs/ratioOverrides" }
      }
    },
    "agentHints": { "type": "string", "maxLength": 1500, "description": "Natural-language guidance passed to the agent when AI selection or chat edits run. Treated as instructions from the recipe author (built-in recipes only)." },
    "constraints": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "noRepeatClips": { "type": "boolean", "default": true },
        "insufficientMediaPolicy": { "enum": ["lengthenShots", "askUser", "allowRepeat"], "default": "lengthenShots" },
        "keepChronological": { "type": "boolean", "default": true },
        "textSafeZone": { "type": "boolean", "default": true }
      }
    }
  },
  "$defs": {
    "ratioOverrides": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "styles": { "type": "object", "additionalProperties": { "type": "object" } }
      }
    },
    "key": { "type": "string", "pattern": "^[a-z][a-zA-Z0-9_]{0,31}$" }
  }
} as const;
