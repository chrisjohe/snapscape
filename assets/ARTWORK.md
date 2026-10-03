# Original Snapscape artwork

Generated with the built-in image-generation tool for this project. The mascot is saved as `mascot.png`; the original sample puzzle, `florida-sunshine.jpg`, has been replaced by the collection below and removed. Delivery copies were resized/compressed for the web. Neither asset uses official team logos.

## Random snapscapes — supplied picture collection

Added to the random picture selection on 1 October 2026. These twelve supplied PNGs replace `florida-sunshine.jpg` in the app's selection pool; the original file has been removed.

- `snapscape-beach.png`
- `snapscape-bike.png`
- `snapscape-bookstore.png`
- `snapscape-diner.png`
- `snapscape-fishing.png`
- `snapscape-football.png`
- `snapscape-interstate-95.png`
- `snapscape-kajak.png`
- `snapscape-mall.png`
- `snapscape-miami.png`
- `snapscape-oranges.png`
- `snapscape-st-augustine.png`

Each image is 1448 × 1086 pixels (4:3), without an alpha channel. The app loads only the selected full-size picture and uses the existing local resize/compression flow, preserving the complete image and its proportions. The supplied PNG files are unchanged.

The random button previews bookstore, beach, oranges, Miami, and kayak using 144 × 108 JPEG delivery copies in `assets/thumbnails/`, resized with macOS `sips` at JPEG quality 78. The five files total 62,405 bytes. CSS crops their display into small decorative cards; the source pictures and playable puzzles retain the complete images.

## Snap-together symbol — `snap-pieces.svg`

Original code-created vector artwork for step 3 of the setup. Uses neighboring pieces 5 and 6 from `engine.js` → `piecePath`, with difficulty `breezy`, ratio `4/3`, and seed `0`. The outlines are scaled to 36 units, slightly rotated and separated to suggest snapping together. Orange `#b94821` and dark blue `#173f52` match the app palette. Displayed at 84 × 60 pixels; decorative and hidden from assistive technology. No image generation or third-party icon was used for this asset.

## Sunshine break — `gator-sunbreak.png`

Generated with the built-in image-generation tool on 1 October 2026, using `mascot.png` as the character and style reference. Saved as a 640 × 480 transparent PNG for the pause overlay, preserving the generated alpha channel.

Prompt: Use case: illustration-story. Asset type: one transparent PNG cutout illustration for the pause screen of the Snapscape puzzle game. Input image 1 is the character and style reference, not an edit target. Primary request: show this exact friendly logo alligator sunbathing and reclining comfortably on a striped canvas deck chair, wearing dark sunglasses over the eyes and holding one refreshing orange drink with a straw. Preserve the recognizable rounded long muzzle, forest-green skin, cream cheeks and belly, cheerful toothy smile, and orange neckerchief. Match the reference's charming editorial cut-paper illustration, soft layered shapes and subtle tactile paper grain. Full-body relaxed lounging pose with feet and tail comfortably visible; the chair visibly supports the reclining body, and the glass is clearly held in one hand. The gator, sunglasses, chair, and drink must read clearly at a display width of 240 pixels. Warm sunny holiday mood, orange and cream striped chair with a simple pale wooden frame. Compact landscape composition approximately 4:3, entire character and chair visible with modest transparent margins. Genuinely transparent background with alpha. No scenery, separate sun icon, text, letters, logos, watermark, frame or puzzle pieces. One character and one chair only.

## Gallery companion — `gator-collection-v2.png`

Generated with the built-in image-generation tool on 1 October 2026, using `mascot.png` as the character and style reference. Revised the original seated `gator-collection.png` into an upper-body portrait matching the setup mascots: no feet, legs or tail, and a substantially larger completed puzzle covering the torso. The original asset is preserved; the app uses `gator-collection-v2.png`. Saved as a 336 × 336 PNG using macOS `sips`, displayed at 112 × 112 CSS pixels, decorative and hidden from assistive technology.

The initial generation returned an opaque checkerboard instead of alpha, including after a transparency correction. A background edit replaced that pattern with a white matte, retained in the current portrait revision. This asset is opaque; `.gallery-mascot` uses `mix-blend-mode: multiply` over the summary's cream background to integrate it with the page.

Current portrait revision prompt (input 1: `gator-collection.png`; input 2: `mascot.png`):

Use case: precise-object-edit.
Asset type: revised Snapscape gallery mascot, square PNG shown at 112 pixels.
Input image 1: edit target, the existing seated gator holding a small finished puzzle. Input image 2: strict reference for the app mascot's character and waist-up portrait framing.
Make two changes: (1) Convert the full seated figure into a compact waist-up / head-and-chest mascot portrait like image 2. No legs, feet, soles, seated lower body or tail anywhere. (2) Make the completed landscape puzzle much larger: it should span roughly 75–80 percent of the full canvas width, cover most of the torso below the orange neckerchief, and occupy the lower 40–45 percent of the composition. The gator holds it proudly with one small hand gripping each side; the hands should not obscure the picture. Show the whole rectangular assembled puzzle, including its bottom edge. The puzzle is the lower silhouette of the portrait; no belly or limbs extend underneath it.
Preserve the exact recognizable alligator identity, face, rounded right-pointing long muzzle, kind eyes, smiling toothy expression, green skin, cream muzzle and orange neckerchief. Match the original mascot's editorial cut-paper style, soft shapes and fine paper texture. Keep the sunny turquoise-water landscape on the held puzzle, with simple clear interlocking seams and all pieces present. The face and the larger puzzle must both remain readable at small display size.
Composition: centered square chest-up portrait, entire head, snout, scarf, hands and puzzle visible with modest white margin; retain the face's proportions and leave enough height for the large puzzle. No sunglasses, crown, extra objects, text, logos or watermark.
Background: perfectly flat uniform opaque pure white #FFFFFF, including all gaps, with no texture, checkerboard, shadow, scenery or gradient outside the held puzzle. One image only.

Initial seated-version prompt:

Use case: illustration-story.
Asset type: one transparent PNG cutout illustration for the end of the completed-puzzles gallery in the Snapscape app.
Input image 1: strict character identity and illustration-style reference, not an edit target.
Primary request: show this exact friendly alligator sitting comfortably on the ground, holding a small finished rectangular jigsaw puzzle in both hands in front of its belly, like a treasured photograph. The completed puzzle faces the viewer and rests gently against its lap. The gator looks toward us with a contented, slightly proud smile: quiet satisfaction after finishing a puzzle.
Style/medium: match the reference's charming editorial cut-paper illustration, rounded layered paper shapes, gentle shading and subtle tactile paper grain. Preserve its recognizable rounded long muzzle, forest-green skin, cream cheeks and belly, kind expressive eyes, toothy smile and orange neckerchief. No glossy 3D.
Composition: compact, centered square composition, full seated body visible, relaxed feet and curved tail, entire head, snout, hands, puzzle and tail inside the frame with modest transparent margins. Large readable head, clear silhouette designed to display at only 112 pixels tall. The puzzle is a simple sunny turquoise-water landscape with a few clear interlocking-piece seams, fully assembled, no loose or missing pieces. Hands naturally hold opposite lower sides without covering the whole puzzle.
Background: genuinely transparent alpha, no ground plane, no scenery outside the small held puzzle, no frame or backdrop. Preserve transparent space around the silhouette.
Constraints: one gator and one finished puzzle only; no text, letters, numbers, logos, badges, confetti, extra props, extra limbs or watermark. Output one finished PNG asset.

Final background prompt (applied to the initial generated image):

Use case: precise-object-edit.
Input image 1 is the edit target, a seated friendly green alligator with an orange neckerchief holding a finished blue landscape puzzle.
Replace ONLY the checkerboard behind and around the character with a perfectly plain solid white background, exact RGB 255,255,255 / #FFFFFF. White in every empty gap too, including under the upper jaw, around the tail and between the arms and body. Absolutely no checkerboard, no transparency visualization, no gray, no paper texture on the background, no shadow, no floor, no gradient. The white background must be completely flat and uniform.
Preserve the exact character and held puzzle, entire silhouette, face, pose, paws, tail, colors, orange scarf and the fine cut-paper texture INSIDE the character. Do not change the gator at all. Keep the full square composition and all margins. Output one PNG on pure flat white.

## Picture Guide companion — `gator-peek.png`

Generated with the built-in image-generation tool on 2 October 2026, using `mascot.png` as the character and style reference. Saved as a 480 × 480 transparent PNG using macOS `sips`, preserving the generated alpha channel. Displayed at 160 × 160 CSS pixels in the Picture Guide confirmation dialog; decorative and hidden from assistive technology.

Final prompt:

Use case: illustration-story.
Asset type: one transparent PNG cutout mascot portrait for the Picture Guide confirmation dialog in the Snapscape puzzle game.
Input image 1: strict character identity and illustration-style reference, not an edit target.
Primary request: create a new curious, playfully peeking pose of this exact friendly alligator. Head slightly tilted, eyebrows lifted, bright inquisitive eyes glancing ahead, a gentle toothy smile, and one hand raised above the eyes like a little visor as if trying to get a better peek. The other hand rests naturally near the chest. Make the curious expression immediately readable.
Style/medium: match the reference's charming editorial cut-paper illustration, layered rounded shapes, fine tactile paper grain and soft shading. Preserve its recognizable rounded long muzzle, forest-green skin, cream cheeks and belly, big expressive eyes and orange neckerchief.
Composition/framing: compact centered square head-and-chest portrait, entire head, snout, raised hand, scarf and torso silhouette visible with a small safe transparent margin. Readable at 160 pixels.
Scene/backdrop: genuinely transparent background with alpha; no background pattern, matte, scenery, floor, frame or cast shadow.
Constraints: one character only; no text, letters, logos, watermark, accessories, puzzle pieces, extra limbs or props. Output one finished image.

## Mascot prompt

Use case: illustration-story. Asset type: browser jigsaw game mascot, transparent PNG cutout. A friendly charming alligator mascot, chest-up three-quarter view, wearing a little orange neckerchief. Editorial cut-paper illustration, original expressive design, rich forest green with subtle tactile paper texture. Compact square composition; large simple readable face and toothy smile, clear silhouette readable at 64px; entire chest-up mascot fully visible with comfortable transparent margin. Warm, playful, welcoming. Genuinely transparent background with alpha; no scenery, text, logos, or watermark. One asset only.

## Original sample puzzle prompt (removed asset)

Use case: illustration-story. Asset type: playable sample image for a browser jigsaw puzzle titled A little Florida sunshine (title is metadata only, do not render text). A beautiful inviting sunny Florida freshwater spring, clear turquoise water, cypress trees, palms, a heron, water lilies, and a subtle small friendly alligator on the bank. Rich gouache illustration, varied detailed regions useful for a satisfying jigsaw puzzle. 3:2 landscape composition. Clear foreground, midground and background with distinct varied regions, balanced natural scenery, full-bleed art. Orange sunset light, inviting serene warmth. Luminous turquoise water, warm orange sunlight, deep blue and green details. No text, logos, watermark, border, puzzle pieces, or puzzle outlines. One asset only.

## Puzzle completion — `gator-celebrate.png`

Generated with the built-in image-generation tool on 2 October 2026, using `mascot.png` as the character and cut-paper style reference. Saved as a 384 × 384 transparent PNG delivery copy with macOS `sips`, preserving the generated alpha channel. Displayed at 128px (108px on narrow screens) above “Well snapped!” in the completion dialog.

Final prompt:

Use case: illustration-story.
Asset type: one transparent PNG mascot illustration for the top of Snapscape's puzzle-completion dialog.
Input image 1: /Users/cj/Documents/Snapscape/assets/mascot.png is the strict character identity and illustration-style reference, not an edit target.
Primary request: create a new celebratory "YES!" pose of this exact friendly alligator. Both arms are lifted in a joyful victory gesture with small clenched fists, elbows bent, a delighted open toothy smile, bright happy eyes. The pose should read as a little triumphant cheer.
Preserve the recognizable rounded long muzzle pointing right, forest-green skin with darker spots, cream cheeks and belly, big expressive eyes, orange neckerchief and friendly personality. Match the charming layered cut-paper illustration, soft shading and subtle tactile paper grain of the reference.
Composition: compact centered waist-up portrait in a square canvas, entire head, snout, raised fists, scarf and upper torso visible, modest transparent breathing room on every side. Strong simple silhouette readable at 128–160 CSS pixels.
Scene/backdrop: genuinely transparent alpha background.
Constraints: one character only; no written YES or other text, no letters, logos, watermark, coin, confetti, trophy, scenery, frame, shadow backdrop, extra accessories, puzzle pieces or glossy 3D. The celebration comes from the pose and expression.

## Snap Points coin

`snap-coin.png` was generated with the built-in image-generation tool, using `mascot.png` as the character and style reference. A 256-pixel transparent PNG copy is used in the app. The original mascot also replaces the old S mark in the header; a dedicated app icon is used as the browser favicon.

Prompt: Create one original transparent game currency icon: a circular golden coin featuring this exact friendly alligator character’s head in the center. Match its charming editorial cut-paper illustration, subtly grainy paper texture, rounded shapes, forest-green skin, cream muzzle, warm toothy smile, and a tiny hint of orange neckerchief. Use a warm golden-orange raised rim and a cream-gold face. Make the gator head large and readable at 40–48 pixels. Mostly front-facing, slight dimensional depth, compact centered square composition, entire coin visible with modest transparent margin. No text, letters, numbers, sun, stars, extra coins, scenery, official sports logos, or watermark.

## Twist portrait — `gator-twist.png`

Generated with the built-in image-generation tool on 2 October 2026 from `mascot.png`. Saved as a new transparent 512 × 512 PNG; resized with macOS `sips`. Used beside the rotation option in the compact setup layout.

Prompt: Use case: identity-preserve. Asset type: transparent mascot illustration for Snapscape's 'Give it a twist' puzzle rotation option. Edit the referenced mascot into a new pose, keeping exactly the same friendly green alligator character, orange neckerchief, cream belly, smiling face, textured storybook illustration style and colors. Show his upper body holding one large burnt-orange jigsaw puzzle piece between his two hands, tilted as if he is turning it, with one simple curved dark-green rotation arrow above the piece. Keep the face, hands, puzzle piece and arrow clear and readable at 64 pixels. Compact square composition, entire head and hands visible, tightly framed with a small safe transparent margin. Real transparent background, no ground shadow, no text, no lettering, no extra objects. Save as a new variant; do not change the reference file.

## Challenge portraits

Generated with the built-in image-generation tool on 1 October 2026, using `mascot.png` as the character and style reference. Each was generated separately and saved as a 256 × 256 transparent PNG for the setup difficulty cards. The existing mascot remains the Snappy portrait.

### Breezy — `gator-breezy.png`

Prompt: Use case: illustration-story. Asset type: one transparent PNG cutout mascot portrait for a small puzzle difficulty card. Input image 1 is the character and style reference, not an edit target. Create a new pose of this exact friendly alligator, retaining its recognizable rounded long muzzle, forest-green skin, cream cheeks and belly, big expressive eyes, cheerful toothy smile and orange neckerchief. Match the original charming editorial cut-paper illustration and subtle paper grain. Square composition, head-and-chest portrait at the same scale as the reference, whole silhouette visible, generous transparent margin, readable at 80px. Genuinely transparent alpha background, no scenery, text, letters, logos, badges, watermark, frame or puzzle pieces. One character only. Pose: relaxed and carefree, eyes softly half-closed in a contented smile, wearing simple sunglasses perched on top of the head, shoulders relaxed. Inviting easygoing holiday mood.

### Bold — `gator-bold.png`

Prompt: Use case: illustration-story. Asset type: one transparent PNG cutout mascot portrait for a small puzzle difficulty card. Input image 1 is the character and style reference, not an edit target. Create a new pose of this exact friendly alligator, retaining its recognizable rounded long muzzle, forest-green skin, cream cheeks and belly, big expressive eyes, cheerful toothy smile and orange neckerchief. Match the original charming editorial cut-paper illustration and subtle paper grain. Square composition, head-and-chest portrait at the same scale as the reference, whole silhouette visible, generous transparent margin, readable at 80px. Genuinely transparent alpha background, no scenery, text, letters, logos, badges, watermark, frame or puzzle pieces. One character only. Pose: confident and determined but still friendly, one arm flexed in a playful little strong-arm gesture, other hand on hip. No extra accessories. Adventurous challenge mood.

### Legend — `gator-legend.png`

Prompt: Use case: illustration-story. Asset type: one transparent PNG cutout mascot portrait for a small puzzle difficulty card. Input image 1 is the character and style reference, not an edit target. Create a new pose of this exact friendly alligator, retaining its recognizable rounded long muzzle, forest-green skin, cream cheeks and belly, big expressive eyes, cheerful toothy smile and orange neckerchief. Match the original charming editorial cut-paper illustration and subtle paper grain. Square composition, head-and-chest portrait at the same scale as the reference, whole silhouette visible, generous transparent margin, readable at 80px. Genuinely transparent alpha background, no scenery, text, letters, logos, badges, watermark, frame or puzzle pieces. One character only. Pose: proud and delighted, wearing a small simple golden crown, hands resting on hips, warm triumphant smile. Friendly puzzle champion mood.

## App icon and favicon

Generated with the built-in image-generation tool on 1 October 2026, using `mascot.png` as the character and cut-paper style reference. The icon has a red neckerchief and a dark blue background based on the header color `#173f52`. The original mascot remains in use in the header and Snappy difficulty card.

The final generated artwork is exported as `app-icon-1024.png` (1024 × 1024, opaque RGB PNG). The square master leaves room around the mascot for the system's corner mask, following [Apple's app icon guidance](https://developer.apple.com/design/human-interface-guidelines/app-icons). Delivery copies are `apple-touch-icon.png` (180 × 180), `favicon-16.png`, `favicon-32.png`, and `favicon-48.png`; `favicon.ico` packages the 16-, 32-, and 48-pixel copies. `index.html` links the browser favicons and the Apple touch icon. Resized with macOS `sips`.

Initial prompt:

Use case: compositing.
Asset type: one finished square 1024 × 1024 pixel app icon / favicon master for Snapscape.
Input image 1: the existing mascot, used as the strict character identity and illustration-style reference.
Primary request: adapt this exact friendly alligator mascot into a clean, beautifully composed app icon. Preserve its recognizable face, rounded long muzzle pointing right, big kind eyes, green skin, cream cheeks and belly, happy open toothy smile, and two hands giving thumbs up. Change the neckerchief to a warm vivid RED, approximately #D94736, with its fabric folds and tied ends still clearly readable.
Scene/backdrop: a completely solid, uniform, opaque dark app-blue background, exact hex #173F52, filling the entire square edge to edge.
Style/medium: match the reference's charming editorial cut-paper illustration, layered paper shapes, gentle shading and subtle tactile grain. Preserve the same visual character, not a generic replacement mascot, not glossy 3D.
Composition/framing: centered, compact chest-up mascot, generously large head for favicon readability; complete head, snout, scarf, hands and compact torso fit comfortably within the canvas. Approximately 10–12 percent safe margin around the silhouette, keeping all meaningful detail clear of corners. No cut-off snout or scarf. Strong readable silhouette.
Constraints: output a single 1024 × 1024 square image with fully opaque blue corners. Do not draw rounded corners; the platform applies its own mask. No border, outer frame, white margin, transparency, gradient, glow, scenery, puzzle pieces, text, letters, logo lettering or watermark. Only the mascot and flat blue background.

Finishing prompt (applied to the first generated icon):

Use case: precise-object-edit.
Input image: the generated Snapscape app icon; this is the edit target.
Make only two finishing changes to this icon: shrink the entire existing alligator uniformly to 84% of its current size, centered in the same square canvas, so there is generous blue breathing room on all four sides and the snout cannot be clipped by an iOS rounded-square mask. Replace every background pixel with perfectly flat uniform blue #173F52, RGB (23, 63, 82). No background texture or background shadow.
Preserve the exact alligator illustration, expression, pose, red neckerchief, green skin, cream belly, proportions and tactile cut-paper details. Do not redesign or add anything.
Output one 1024 × 1024 px square PNG with opaque blue corners, no rounded corner mask, border, text or watermark.
