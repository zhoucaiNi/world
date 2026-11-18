# Credits

Every third-party asset in this project, where it came from, and its licence.
Models and sounds are CC0 (public domain) unless marked CC-BY 3.0 below, which requires the credit given here.

## 3D models

| Asset | Author | Source | Licence | Files here |
|---|---|---|---|---|
| Shiba Inu (from the Animated Animal Pack) | Quaternius | [poly.pizza/m/y4wdQpg767](https://poly.pizza/m/y4wdQpg767), [quaternius.com](https://quaternius.com/packs/ultimateanimatedanimals.html) | CC0 | `public/models/shiba.glb` |
| Bird (jay) | Quaternius | [poly.pizza/m/gYYC0gYMnw](https://poly.pizza/m/gYYC0gYMnw) | CC0 | `public/models/birds/jay.glb` |
| Sparrow | Poly by Google | [poly.pizza/m/3rTjKefT184](https://poly.pizza/m/3rTjKefT184), [creativecommons.org/licenses/by/3.0](https://creativecommons.org/licenses/by/3.0/) | CC-BY 3.0 | `public/models/birds/sparrow.glb` |
| Fantasy Town Kit 2.0 | Kenney | [kenney.nl/assets/fantasy-town-kit](https://kenney.nl/assets/fantasy-town-kit) | CC0 | `public/models/town/` (licence: `LICENSE-kenney.txt`) |
| Nature Kit | Kenney | [kenney.nl/assets/nature-kit](https://kenney.nl/assets/nature-kit) | CC0 | `public/models/nature/` (licence: `LICENSE-kenney.txt`) |

Changes: the town kit's palette texture is recoloured at load time (`src/Kit.tsx`), and models are
recoloured by the day/night theme. Geometry is unchanged.

## Sounds

| File | Original | Author | Source | Licence |
|---|---|---|---|---|
| `public/sounds/fire.m4a` | Fireplace Sound loop (`fire.wav`) | PagDev | [opengameart.org/content/fireplace-sound-loop](https://opengameart.org/content/fireplace-sound-loop) | CC0 |
| `public/sounds/music-day.m4a` | Bluebonnet, looped (`bluebonnet_in_b_major_looped.ogg`) | Kistol | [opengameart.org/content/bluebonnet](https://opengameart.org/content/bluebonnet) | CC0 |
| `public/sounds/music-night.m4a` | Forget Me Not, looped (`forget_me_not_in_f_major_looped.ogg`) | Kistol | [opengameart.org/content/forget-me-not](https://opengameart.org/content/forget-me-not) | CC0 |
| `public/sounds/birds.m4a` | Ambient Bird Sounds (`birds-isaiah658.ogg`) | isaiah658 | [opengameart.org/content/ambient-bird-sounds](https://opengameart.org/content/ambient-bird-sounds) | CC0 |
| `public/sounds/crickets.m4a` | Crickets Ambient Noise - loopable | Wolfgang_ (Ted Kerr) | [opengameart.org/content/crickets-ambient-noise-loopable](https://opengameart.org/content/crickets-ambient-noise-loopable) | CC0 |
| `public/sounds/guitar.m4a` | A Small Fire Will Do (Calming Loop) | Trex0n (Cal McEachern) | [opengameart.org/content/a-small-fire-will-do-calming-loop](https://opengameart.org/content/a-small-fire-will-do-calming-loop) | CC0 |
| `public/sounds/fountain.m4a` | Water fountain | jhumbucker | [freesound.org/people/jhumbucker/sounds/193784](https://freesound.org/people/jhumbucker/sounds/193784/) | CC0 |

Changes: converted to AAC (`.m4a`) with macOS `afconvert`; otherwise unedited. The bird
recording plays as short faded snippets from random points, every 20 to 45 seconds.
The fountain loop was taken from Freesound's 48 kHz MP3 preview (the WAV original needs a login),
raised in volume (the recording is very quiet), and its ends crossfaded over 1.5 s so it loops without a click.

## Fonts (Google Fonts, SIL Open Font License 1.1)

Fredoka, Nunito, Young Serif, Instrument Sans: [fonts.google.com](https://fonts.google.com).
The 3D signs use drei's default `<Text>` font (Roboto, Apache 2.0), loaded from a CDN.

## Libraries (MIT)

[three.js](https://threejs.org), [@react-three/fiber](https://github.com/pmndrs/react-three-fiber),
[@react-three/drei](https://github.com/pmndrs/drei), [React](https://react.dev), [Vite](https://vitejs.dev).
