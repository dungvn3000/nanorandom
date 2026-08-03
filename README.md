# NanoRandom

> **Domain: [nanorandom.dev](https://nanorandom.dev)** • **Source: [github.com/dungvn3000/nanorandom](https://github.com/dungvn3000/nanorandom)** • **Developed by [tadu.cloud](https://tadu.cloud)**

A **single-file, offline-capable BIP39 mnemonic seed phrase generator** for the Nano (XNO)
ecosystem. The entire app — markup, CSS, JS and the official 2048-word BIP39 wordlist —
lives in one `index.html`. No build step, no dependencies, no backend, no tracking.

Seed derivation runs **locally**: secrets are never intentionally transmitted. Everything is
inline, so a truly offline (`file://`) run needs no network at all.

---

## Features

- **BIP39 compliant** — official 2048-word English wordlist, SHA-256 checksum, verified
  against the official BIP39 test vectors
- **Four word lengths** — 12 / 15 / 18 / 24 words (128 / 160 / 192 / 256 bits)
- **Offline default** — direct browser CSPRNG entropy (`crypto.getRandomValues`), the same
  way hardware wallets derive seeds
- **Mix live Nano blockhashes** *(enabled by default)* — each Generate fetches up to 16
  freshly-validated blockhashes from the public Nano explorer API as extra public auxiliary
  input
- **Optional user salt** — your own UTF-8 text; password-style masked input with Show/Hide
  toggle and autofill/spell-check disabled; typing it is never required
- **Fail closed** — no Web Crypto ⇒ no seed; malformed API payloads are rejected
- **Copy button** with one-click clipboard copy of the current seed
- **Single file** — save it, verify it, air-gap it

## How it works

```
wordCount  -> ENT bytes: 12 -> 16 | 15 -> 20 | 18 -> 24 | 24 -> 32

default:    entropy = crypto.getRandomValues(ENT)
mixed mode: entropy = SHA-256( saltRaw(32B CSPRNG) ++ utf8(userSalt) ++ blockhashBytes )[0 : ENT/8]

checksum  = SHA-256(entropy)[0 : ENT/32 bits]
bits      = bin(entropy) ++ bin(checksum)
mnemonic  = [ WORDLIST[bits[i:i+11]]  for i in 0,11,22,... ]
```

**Inputs and their types**

- **salt** — 32 raw CSPRNG bytes (mixed mode) / direct CSPRNG bytes (default mode)
- **userSalt** — optional text, encoded as UTF-8 bytes
- **blockhashes** — public, verifiable auxiliary input from the Nano network; each 64-hex
  hash is validated then decoded to its raw 32-byte value

**Nano blockhash validation**: every value from the explorer must be exactly 64 hex chars;
badly-shaped payloads, non-object entries and duplicates are rejected, and the list is
capped at 16 per Generate.

**Nano blockhashes are public** — they add freshness but are never the secret. The secret
anchor is always the browser CSPRNG; user salt only adds protection when independently
unpredictable.

## Run

Open `index.html` directly in any modern browser — it works from `file://` (the `file:`
scheme is a secure context so Web Crypto is available). Optionally serve it with any static
server:

```bash
python3 -m http.server 8080   # http://localhost:8080
```

## Files

```
nanorandom/
├── index.html    # BIP39 seed phrase generator (markup + CSS + JS + wordlist)
├── password.html # independent CSPRNG password generator
└── README.md     # this file
```

## Password generator (`password.html`)

Single-file password generator with an **independent CSPRNG** (not derived from any seed):

- Every character is drawn with `crypto.getRandomValues()` via **rejection sampling** —
  bytes in the modulo-bias zone are discarded and redrawn (no modulo bias)
- Selectable charsets: upper / lower / numbers / symbols, length 8–128
- Guarantees ≥ 1 character from each enabled set on unbiased slots
- Honest strength estimate: `len × log2(charset pool)` — since characters are independent,
  this is a real entropy figure, not a deterministic-derivation cap
- Runs fully offline; fail closed when Web Crypto is unavailable

## Security notes

- Seed derivation runs **locally**; seed, entropy and user-entered text are never
  intentionally transmitted. With block mixing enabled, the only network request is to the
  public Nano explorer API; with it off, the page makes **zero** network requests.
- Never share the seed or the salts (system + user) with anyone.
- Write down your seed phrase on paper and store it offline. Never store it in cloud notes
  or screenshots.
- For significant funds, use an offline/air-gapped device and verify the seed derivation in
  at least 2 independent tools before depositing.
- This tool is provided as-is, educational & experimental — no warranty. Generated phrases
  are for testing and learning. Use at your own risk.

## License

[Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)
