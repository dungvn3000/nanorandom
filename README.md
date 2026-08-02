# NanoRandom

> **Domain: [nanorandom.dev](https://nanorandom.dev)** • **Source: [github.com/dungvn3000/nanorandom](https://github.com/dungvn3000/nanorandom)** • **Developed by [tadu.cloud](https://tadu.cloud)**

Client-side BIP39 mnemonic seed & password generator powered by live Nano blockchain blockhashes.

NanoRandom generates BIP39 seed phrases (12 / 15 / 18 / 24 words) by combining an
auto-generated **system salt** (128-bit CSPRNG) + an optional **user salt** (your
own text) + **real-time blockhashes** from the Nano (XNO) network, then running
everything through SHA-256 — entirely in your browser. It also derives strong
random passwords from the same entropy.

No backend. No tracking. No data ever leaves your machine.

---

## Features

- **Live Nano blockhashes** — polled every 3s from `api.nanexplorer.com/last-blocks`
- **Auto system salt** — 128-bit CSPRNG from `crypto.getRandomValues()`, readonly,
  regenerable with one click
- **Optional user salt** — you may type any text as a second, personal layer; the
  indicator warns if it's empty / very short
- **BIP39 compliant** — official 2048-word English wordlist, SHA-256 checksum
- **Four word lengths** — 12 / 15 / 18 / 24 words (128 / 160 / 192 / 256 bits)
- **Password generator** — derives passwords from the current entropy with
  options for uppercase, lowercase, numbers, symbols and length 8–128
- **Strength meter** — live entropy-bit estimate for the generated password
- **Copy / Download** — copy to clipboard or save seed as a `.txt` file
- **About / FAQ page** — explains the formula, entropy sources, security
  model and common questions
- **100% client-side** — runs in any modern browser, can be saved and run offline

## How it works

The entropy is built from three independent sources and mixed via SHA-256. The
**last 16 live blockhashes** (kept in a rolling in-memory buffer) are concatenated
with the auto-generated system salt and the optional user salt:

```
entropy   = SHA-256( utf8(systemSalt) ++ utf8(userSalt) ++ hexBytes(last16Blockhashes) )[0 : ENT_bits/8]
checksum  = SHA-256(entropy)[0 : ENT/32 bits]
bits      = bin(entropy) ++ bin(checksum)
mnemonic  = [ WORDLIST[bits[i:i+11]]  for i in 0,11,22,... ]
```

- **systemSalt** &mdash; 128-bit CSPRNG from `crypto.getRandomValues()`, readonly,
  regenerable anytime.
- **userSalt** &mdash; optional text; the salt indicator warns if empty/too short.
  Adds a second personal layer.
- **last16Blockhashes** &mdash; public, verifiable entropy pulled live from the
  Nano network.

| Words | Entropy | Checksum | Total bits |
|------:|--------:|---------:|-----------:|
| 12    | 128 bit | 4 bit    | 132 bit    |
| 15    | 160 bit | 5 bit    | 165 bit    |
| 18    | 192 bit | 6 bit    | 198 bit    |
| 24    | 256 bit | 8 bit    | 264 bit    |

Passwords are derived by expanding the entropy with a SHA-256 counter chain
and mapping bytes onto the chosen character set, ensuring at least one
character from each enabled set is included.

```
expanded = SHA-256(entropy ++ counter ++ salt) chained until enough bytes
password = map expanded[i] -> charset[ expanded[i] mod len(charset) ]
```

## Tech stack

- **Bootstrap 5** — UI components & layout
- **Alpine.js 3** — reactive state, no build step
- **Web Crypto API** — SHA-256, `crypto.getRandomValues`
- **Vanilla JS** — BIP39 wordlist & mnemonic logic
- **Nano Explorer API** — live blockhash feed

## Project structure

```
nanorandom/
├── index.html        # Markup (single page, 2 tabs: Generator + About)
├── css/
│   └── style.css     # Dark theme Nano styling
├── js/
│   ├── bip39.js      # Official 2048-word wordlist + mnemonic helpers
│   └── app.js        # Alpine.js app (API polling, entropy, password gen)
├── favicon.png       # 192x192 icon
├── favicon-512.png   # 512x512 icon (PWA)
├── og-image.png      # Open Graph share image
├── robots.txt        # SEO
├── sitemap.xml       # SEO
└── site.webmanifest  # PWA manifest
```

## Run locally

Because the page uses the Web Crypto API and fetches a remote API, it must be
served over HTTP(S), not opened via `file://`.

```bash
# Python
python3 -m http.server 8080

# Node
npx serve .

# PHP
php -S localhost:8080
```

Then open <http://localhost:8080>.

## Security notes

- The seed and both salts never leave your browser — the only network call
  is to the public Nano Explorer API to read live blockhashes.
- Blockhashes are public, so the **system salt** (128-bit CSPRNG) is the secret
  anchor that keeps each seed private; the **user salt** adds a second layer
  if you want extra unpredictability.
- For holding real funds, consider an offline/air-gapped device and verify
  the seed on the device screen.
- This tool is provided as-is, with no warranty. Use at your own risk.

## Disclaimer

NanoRandom is an **educational & experimental tool**. It is provided **"AS IS"**,
without any warranty of any kind, express or implied, including but not limited
to merchantability, fitness for a particular purpose, or non-infringement.

**The authors and contributors are NOT responsible** for any lost funds, damaged
wallets, leaked keys, or other damage arising from the use or misuse of this
tool.

This page runs **100% client-side**. Nothing is sent to any server except the
public Nano explorer API used to poll live blockhashes. The randomness depends
on your browser's `crypto.getRandomValues()` and the live blockhash feed.

Before storing real funds, **always verify your seed in at least 2 independent
offline tools** and ideally offline. **Never share your seed or the
salts (system + user)** with anyone.

Generated seed phrases are for **testing and learning**. Use at your own risk.

## License

MIT
