# Phoenix chick — 2D rig specification

Reference character: `../assets/phoenix-chick-v1.png`<br>
Parts reference: `phoenix-rig-parts-reference-v1.png`<br>
Expressions reference: `phoenix-expressions-reference-v1.png`

## Target

Layered 2D character for Phaser 4. Default design size: 1024 × 1024 logical pixels.
The assembled neutral pose must match the reference character before animation is added.

## Layer hierarchy

Layers are listed from back to front.

```text
phoenix-root
├── fx-back
├── tail-root
│   ├── tail-left
│   ├── tail-center
│   └── tail-right
├── leg-left-upper
│   └── leg-left-lower-foot
├── leg-right-upper
│   └── leg-right-lower-foot
├── torso
├── wing-left
├── wing-right
├── neck-shadow
├── head
│   ├── eye-left
│   ├── eye-right
│   ├── eyelid-left
│   ├── eyelid-right
│   ├── beak-lower
│   └── beak-upper
└── fx-front
```

## Required production exports

Every file must be a tightly cropped transparent PNG or WebP with 12–24 px transparent edge padding.

| Asset | Purpose | Pivot |
|---|---|---|
| `body.webp` | Chest and main silhouette | 50%, 68% |
| `head.webp` | Head and flame crest without facial parts | 50%, 78% |
| `wing-left.webp` | Left wing with hidden shoulder overlap | 83%, 23% |
| `wing-right.webp` | Right wing with hidden shoulder overlap | 17%, 23% |
| `tail-left.webp` | Left tail group with hidden root | 78%, 72% |
| `tail-center.webp` | Central tail group | 50%, 76% |
| `tail-right.webp` | Right tail group with hidden root | 22%, 72% |
| `leg-left-upper.webp` | Feathered upper leg | 50%, 18% |
| `foot-left.webp` | Lower leg and foot | 50%, 12% |
| `leg-right-upper.webp` | Feathered upper leg | 50%, 18% |
| `foot-right.webp` | Lower leg and foot | 50%, 12% |
| `eye-left.webp` | Open left eye | 50%, 50% |
| `eye-right.webp` | Open right eye | 50%, 50% |
| `lid-left.webp` | Closed left eyelid | 50%, 50% |
| `lid-right.webp` | Closed right eyelid | 50%, 50% |
| `beak-upper.webp` | Fixed/mostly fixed upper beak | 50%, 72% |
| `beak-lower.webp` | Talking/smiling lower beak | 50%, 8% |

Pivot percentages are initial values and must be tuned after assembly.

## Hidden overlap requirements

- Head texture continues below the visible neck line by at least 12% of head height.
- Both wings include their entire rounded shoulder root under the chest feathers.
- Tail groups extend under the torso by at least 18% of their length.
- Upper and lower leg segments overlap by at least 20% around the knee joint.
- Eye sockets in `head.webp` must have neutral shadow fill so blinking never exposes transparency.
- Lower beak rotates under the upper beak without exposing a gap.

## Expressions

The first release uses six states:

1. `curious` — open eyes, soft raised brows, open smile.
2. `happy` — closed smiling eyes, open beak.
3. `sleepy` — half-closed eyes, relaxed beak.
4. `asleep` — closed eyes, closed beak.
5. `hungry` — open eyes, inner brows raised, closed/downturned beak.
6. `excited` — wide eyes and open beak.

Prefer reusable eye, lid, brow, and beak layers. Full-head expression frames are a fallback,
not the primary runtime format.

## MVP animation clips

| Clip | Duration | Loop | Main motion |
|---|---:|---:|---|
| `idle` | 2.8 s | Yes | Body breath ±2%, head counter-motion, tail glow |
| `blink` | 0.18 s | No | Open eyes → lids → open eyes |
| `look-around` | 1.4 s | No | Head ±5°, eyes ±7 px |
| `happy` | 0.9 s | No | Small jump, wings +18°, happy face |
| `eat` | 1.2 s | No | Head down, beak ×3, body settle |
| `sleep` | 3.2 s | Yes | Closed eyes, slow breath, lowered crest |
| `tap-reaction` | 0.55 s | No | Squash 96%, stretch 104%, surprised face |
| `wing-flap` | 0.75 s | No | Wings rotate up/down twice |
| `level-up` | 1.6 s | No | Jump, wings open, tail fan, front/back sparks |

All clips must honor reduced-motion mode by falling back to opacity/glow changes.

## Phaser implementation notes

- Assemble with a root `Phaser.GameObjects.Container` and one `Image` per part.
- Keep attachment positions in a JSON rig definition rather than hardcoding them in a scene.
- Animate transforms with timelines/tweens; do not redraw raster parts per frame.
- Keep fire/spark effects separate from the character atlas so effects can be disabled on low-end devices.
- Export at 2× the intended maximum display size, then generate WebP at build time.
- Maintain a neutral assembled preview test to detect drift in pivots and scale.

## Acceptance criteria

- Neutral rig visually matches the source character at phone scale.
- No transparent gaps appear at maximum planned joint rotations.
- Blink, happy, sleep, and tap reaction work without swapping the full character image.
- Character and effects remain smooth at 60 fps on a budget Android WebView.
- Optimized runtime character textures total under 700 KB.
