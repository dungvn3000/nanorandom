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

## Why Nano?

Nano (XNO) is a feeless, eco-friendly cryptocurrency with a unique block-lattice
architecture, which makes it particularly suited as a live auxiliary-entropy beacon:

- **Blocks confirmed continuously** — Nano settles transactions in a steady stream with no
  fees, so fresh blockhashes keep arriving around the clock; the "noise" of real user
  transactions never runs out.
- **256-bit blockhashes** — each Nano block has a 256-bit cryptographic block hash (Nano
  uses the BLAKE2b-256 algorithm for block hashing, not SHA-256) that no one predicted
  beforehand. It is public auxiliary input, never treated as a secret.
- **Publicly verifiable** — the displayed hashes can be checked against an explorer
  (nanexplorer.com). This app does not independently verify Nano consensus or confirmation
  status; it only checks the hash *format*.
- **Green & feeless** — no mining, no wasted energy, no cost per block. Pulling blockhashes
  adds nothing to network load beyond normal API reads.

## Why live Nano blockhashes?

The browser's Web Crypto CSPRNG is the primary secret entropy source — but it is also a
**single point of failure**: your seed depends on a specific implementation inside
Chrome/Safari/Firefox, on a specific OS, with its own history of RNG bugs. Real-world
precedent exists: a vendor's official advisory in July 2026 confirmed that a firmware
integration error had routed seed generation to a weak software PRNG for years, silently.
Reviewed cryptographic APIs still ship with bugs; "standard" is not a guarantee.

Mixing **live Nano blockhashes** into the hash means a complete failure of the browser RNG
no longer automatically exposes the seed: an attacker must additionally know *which public
block window* your seed drew from and *when* you clicked Generate, and must recompute the
same SHA-256 preimage to reproduce it. The blockhash cannot rescue a known seed (it is
public auxiliary input, not a secret), and it adds **zero** bit to the theoretical
security ceiling — but it breaks the dependency on one RNG implementation.

Think of it as defense in depth, not as more entropy:

- **Browser CSPRNG works** → blockhashes only add harmless freshness.
- **Browser CSPRNG broken/bugged/mocked (for example by a malicious extension)** → the
  public, timestamped block window is still outside the attacker's control at creation
  time, so the seed does not collapse to being fully reproducible from the broken RNG.
- **Never assume otherwise** → if your system is truly compromised, no public input saves
  you; blockhash mixing is a *hardship multiplier*, not a shield.

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
├── image.html    # image-backed BIP39 seed generator (the image is the backup)
├── password.html # independent CSPRNG password generator
├── dice.html     # live CSPRNG dice roller (rejection sampling, optional blockhash mixing)
└── README.md     # this file
```

## Password generator (`password.html`)

Single-file password generator with two opt-in entropy modes:

- **Independent CSPRNG** (when you untick "Mix live Nano blockhashes") — characters drawn
  straight from `crypto.getRandomValues()` via **rejection sampling** (no modulo bias)
- **Mix live Nano blockhashes** *(enabled by default)* — characters drawn from a SHA-256
  counter-mode stream seeded with a fresh 32-byte CSPRNG salt plus up to 16 validated live
  blockhashes per Generate (`SHA-256( salt32 ++ blockBytes ++ counter )`). The password
  depends on that fresh snapshot — it is not reproducible from any previous salt or block
  set, and its displayed strength is capped at 256 bits (the stream salt)
- Selectable charsets: upper / lower / numbers / symbols, length 8–128
- Guarantees ≥ 1 character from each enabled set on unbiased slots
- Runs fully offline in CSPRNG mode; fail closed when Web Crypto is unavailable

## Image-backed seed generator (`image.html`)

Single-file BIP39 generator where **an image file is the entropy source — and the
backup**. Deterministic, offline, zero network calls.

```
entropy = SHA-256( image_bytes ++ utf8(passphrase) ++ wordCountByte )[0 : ENT/8]
mnemonic = standard BIP39 with checksum, official 2048-word English list
```

- **Pick any image** (JPG / PNG / GIF / WEBP / BMP) via click or drag-and-drop; its raw
  file bytes are hashed
- **Deterministic & reproducible** — same image + same passphrase + same word count
  always produce the same seed. That reproducibility is what lets the image act as a
  backup: re-open the page, choose the same file, type the same passphrase, and the seed
  is regenerated
- **Optional passphrase** (strongly recommended) acts as a second factor, like a BIP39
  passphrase / "25th word" — an attacker who finds your image still cannot recover the
  seed without it
- **12 / 15 / 18 / 24 words** (128 / 160 / 192 / 256 bits); checksum verified against the
  official BIP39 test vectors
- **SHA-256 fingerprint** of the image is displayed so you can confirm you picked the
  correct file when restoring
- **Security model**: the image is the secret — keep it private, offline and
  unpredictable (not a famous public photo). Keep the **exact bytes** untouched: any
  re-save / re-encode / crop / metadata-strip changes the bytes and yields a different
  seed. Losing either the image or the passphrase makes the seed unrecoverable

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
