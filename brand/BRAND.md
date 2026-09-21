# trustset brand

locked 2026-09-15. contrast numbers remeasured 2026-09-21, three were wrong.

## name
trustset. lowercase everywhere. tagline: the trust stack for ai agents.
the off switch is the door, not the whole product: it is the thirty second demo and the one line an app integrates. the stack is the eight layers behind it.
sub products: trip (kill switch, built), touch (human touch attestation, built), refund (x402 refund rail, built).
the operator registry is in the repo and out of the product: reading the chain already answers the question on monad.

## mark
the face. top bar, two eyes, bottom bar. eyes are orange at rest, the face is the brand.
- `assets/tile-on-*.svg` is the mark, f7. the tile takes the TEXT colour and the bars take the GROUND colour, so it inverts against the page it sits on and never sinks into it. favicons, nav, cards.
- `assets/tile-orange.svg`, f8, for x cards only: all ink on orange.
- `assets/mark-on-*.svg` is the face with no tile, for placing directly on a page ground.
- 48 grid. every asset regenerates from `make.mjs`.

## colour
```
dark (default)  ground #0b0c0a  text #f2f1ec  muted 62% of text  line 12% of text  orange #ff6a3d
light           ground #f4f3ee  text #111210  muted 62% of text  line 12% of text  orange #e8552b
```
orange is the accent and the trip colour. at rest it appears only in the eyes and on primary actions. a tripped state is the only other place it is allowed.

### measured contrast, not estimated
| | light | dark |
| --- | --- | --- |
| text on ground | 16.91 | 17.33 |
| muted on ground | 5.05 | 6.94 |
| orange on ground | **3.28** | 6.89 |

**orange is not a text colour on light.** at 3.28 it clears 3:1 for large text and ui only. the earlier spec said 4.6 and that was wrong, which is how an unreadable caption gets written on purpose. the site already carries a separate `--orange-text: #B83F1B` for this, which measures 5.06 and is the token to reach for whenever orange has to carry words on a light ground. on dark, `--orange` doubles as the text colour because 6.89 already clears body.

nothing below 4.5 may carry body copy. do not reuse a fill token as a type token without measuring it first.

## type
words: instrument sans, 400 500 600 700. figures, labels, wordmark, code: dm mono 400 500.
every number is mono. uppercase labels get 1.5px tracking. headings text-wrap balance.

the wordmark is dm mono 500 at -0.5 tracking, locked up with the face scaled so its ink height equals the word's. `fonts/` vendors the two weights so the lockup renders identically on a machine that has never seen the font.

## known drift, decide before it spreads
the site in `web/` does not match this file exactly, and both are in use:

| | this file | globals.css |
| --- | --- | --- |
| light ground | `#f4f3ee` | `#F4F4F2` |
| light text | `#111210` | `#17181A` |
| dark ground | `#0b0c0a` | `#100E0B` |
| dark text | `#f2f1ec` | `#EDEEEC` |
| body font | instrument sans | the system stack, instrument sans is never loaded |

the oranges match exactly in both. the ground and text deltas are imperceptible side by side, so nothing is visibly broken, but two sources of truth is one too many. the brand assets in this folder follow this file, because a logo travels to places that never load the site's css.

## voice
lowercase, direct, operator grounded. no em dashes, no en dashes. sentences end on the thought.
a timestamp on every page that shows data. say testnet and unaudited while it is true.

## layout
flat nav: overview, console, how it works. footer: methodology, changelog, disclaimer, status, github, x, built by silk nodes.
columns align top and bottom. no button label wraps. no horizontal scroll. one spacing rhythm, 8px.

## regenerating
```
cd brand && npm install && node make.mjs
```
writes every svg and png in `assets/`. the pngs are committed so nobody needs node to use the brand.
