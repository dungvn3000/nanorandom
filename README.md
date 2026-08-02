# NanoRandom

> **Domain: [nanorandom.dev](https://nanorandom.dev)** • **Source: [github.com/dungvn3000/nanorandom](https://github.com/dungvn3000/nanorandom)** • **Developed by [tadu.cloud](https://tadu.cloud)**

Client-side BIP39 mnemonic seed & password generator powered by live Nano blockchain blockhashes.

NanoRandom generates BIP39 seed phrases (12 / 15 / 18 / 24 words) by combining a
secure-random user salt with real-time blockhashes from the Nano (XNO) network,
then running everything through SHA-256 — entirely in your browser. It also
derives strong random passwords from the same entropy.

No backend. No tracking. No data ever leaves your machine.

---

## Features

- **Live Nano blockhashes** — polled every 3s from `api.nanexplorer.com/last-blocks`
- **Secure user salt** — 128-bit random value generated on load with the
  browser's `crypto.getRandomValues()`, editable / regenerable
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

The entropy is built from two independent sources and mixed via SHA-256:

```
entropy   = SHA-256( utf8(userSalt) ++ hexBytes(blockhashes) )[0 : ENT_bits/8]
checksum  = SHA-256(entropy)[0 : ENT/32 bits]
bits      = bin(entropy) ++ bin(checksum)
mnemonic  = [ WORDLIST[bits[i:i+11]]  for i in 0,11,22,... ]
```

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
└── js/
    ├── bip39.js      # Official 2048-word wordlist + mnemonic helpers
    └── app.js        # Alpine.js app (API polling, entropy, password gen)
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

- The seed and the user salt never leave your browser — the only network call
  is to the public Nano Explorer API to read live blockhashes.
- Blockhashes are public, so the secure-random user salt is the secret part
  that makes the entropy unpredictable to the outside world.
- For holding real funds, consider an offline/air-gapped device and verify the seed on
  the device screen.
- This tool is provided as-is, with no warranty. Use at your own risk.

## License

MIT
