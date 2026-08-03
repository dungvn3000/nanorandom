/* Nano Seed Generator - Alpine.js app */
function seedApp() {
    return {
        // API state
        connected: false,
        pollTimer: null,
        latestBlock: { hash: '', account: '', type: '' },
        latestBlockTime: '',
        blockBuffer: [], // collects recent blockhashes
        blockCount: 0,
        seenHashes: {},

        // Generator state
        page: 'home',
        wordCount: 12,
        systemSalt: '',        // hex string, for UI display only
        systemSaltBytes: [],   // the actual 32 raw bytes fed into SHA-256
        userSalt: '',
        showUserSalt: false,   // user salt field masked by default (type=password)
        generating: false,
        genTimer: null,
        words: [],
        entropyHex: '',
        checksumHex: '',
        systemSaltHex: '',
        blockBufferHexShort: '',
        generatedAt: '',

        // Toast
        toast: { show: false, title: '', body: '' },

        // Salt quality status (updated by $watch)
        saltStatus: { level: 'empty', msg: '', cls: '' },

        // Password generator state
        pwOptions: {
            upper: true,
            lower: true,
            numbers: true,
            symbols: false,
            length: 64
        },
        password: '',
        pwBusy: false,
        pwPending: false,
        pwStrength: { label: '-', cls: 'bg-secondary', percent: 0 },

        async init() {
            this.updateSaltStatus();
            this.$watch('userSalt', () => {
                this.updateSaltStatus();
                this.scheduleGenerate(); // user salt is part of the entropy -> regenerate the seed (debounced)
            });
            // Warm up crypto subtle
            try {
                await crypto.subtle.digest('SHA-256', new Uint8Array(1).buffer);
            } catch (e) {
                this.showToast('Crypto API not available', 'Your browser does not support Web Crypto API.');
            }
            // Generate a secure random salt on first load
            this.regenSalt();
            await this.fetchBlocks();
            this.pollTimer = setInterval(() => this.fetchBlocks(), 3000);
            // Recompute About-tab metrics when user navigates there
            this.$watch('page', (v) => {
                if (v === 'about' && this.blockBuffer.length) this.scheduleGenerate();
            });
            // Pause polling when tab is hidden to save CPU/API quota
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden && this.pollTimer === null) {
                    this.fetchBlocks();
                    this.pollTimer = setInterval(() => this.fetchBlocks(), 3000);
                } else if (document.hidden && this.pollTimer) {
                    clearInterval(this.pollTimer);
                    this.pollTimer = null;
                }
            });
        },

        updateSaltStatus() {
            const s = this.userSalt || '';
            let level, msg, cls;
            if (!s.length)            { level='empty';  msg='Empty. System salt is auto-generated — enter your own text to add a personal layer to the entropy.'; cls='bg-warning'; }
            else if (s.length < 6)    { level='weak';   msg=`Too short (${s.length} chars). Easy to guess. Use at least 6 chars.`; cls='bg-danger'; }
            else if (s.length < 16)   { level='ok';     msg=`OK (${s.length} chars). Longer/ harder-to-guess is better.`; cls='bg-warning'; }
            else                      { level='strong'; msg=`Long (${s.length} chars) — but length alone is not entropy; only hard-to-guess text truly helps.`; cls='bg-warning'; }
            this.saltStatus = { level, msg, cls };
        },

        // Generate a new secure random system salt (32 bytes -> 64 hex chars)
        regenSalt() {
            // CSPRNG required: fail closed rather than falling back to a weak RNG
            if (typeof crypto === 'undefined' || !crypto.getRandomValues) {
                this.showToast('Secure RNG unavailable', 'crypto.getRandomValues() is required — no seed was generated.');
                return;
            }
            const arr = new Uint8Array(32);
            crypto.getRandomValues(arr);
            this.systemSaltBytes = Array.from(arr);              // raw bytes -> entropy
            this.systemSalt = BIP39.bytesToHex(this.systemSaltBytes); // hex -> display only
            this.scheduleGenerate();
        },

        fetching: false,

        // A Nano blockhash is a 256-bit value => exactly 64 uppercase hex chars
        _isBlockHash(h) {
            return typeof h === 'string' && /^[0-9A-F]{64}$/.test(h);
        },

        // UI-bound strings: keep them textual and short (a nano_ address is 65 chars)
        _safeStr(v) {
            return typeof v === 'string' ? v.slice(0, 128) : '';
        },

        async fetchBlocks() {
            if (this.fetching) return; // in-flight guard
            this.fetching = true;
            try {
                const res = await fetch('https://api.nanexplorer.com/last-blocks?network=nano');
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const data = await res.json();

                // Payload must be an object whose `last` is a real array; cap it (normal response = 10 blocks)
                const MAX_PER_POLL = 64;
                if (!data || typeof data !== 'object' || !Array.isArray(data.last)) {
                    throw new Error('Malformed payload shape: expected { last: [...] }');
                }
                const list = data.last.slice(0, MAX_PER_POLL);
                if (Array.isArray(data.last) && data.last.length > MAX_PER_POLL) {
                    console.warn('[api] oversized block list truncated:', data.last.length, '->', MAX_PER_POLL);
                }
                if (!list.length) return;

                if (!this.connected) {
                    this.connected = true;
                    console.log('[api] connected, polling every 3s');
                }

                // One-pass: collect only unseen, well-formed hashes; mutate reactive state once
                const newHashes = [];
                for (const b of list) {
                    if (!b || typeof b !== 'object') continue; // skip non-object entries
                    const h = this._safeStr(b.hash).trim().toUpperCase();
                    if (!this._isBlockHash(h) || this.seenHashes[h]) {
                        if (h && !this._isBlockHash(h)) console.warn('[api] rejected malformed blockhash', h.slice(0, 16) + '...');
                        continue;
                    }
                    this.seenHashes[h] = true;
                    newHashes.push({ hash: h, account: this._safeStr(b.account), type: this._safeStr(b.type) });
                }
                if (!newHashes.length) return;

                // Cap seenHashes once (not per iteration)
                const keys = Object.keys(this.seenHashes);
                if (keys.length > 200) {
                    for (let i = 0; i < keys.length - 200; i++) delete this.seenHashes[keys[i]];
                }

                // Update blockBuffer in one splice (fewer Alpine notifications)
                this.blockBuffer = this.blockBuffer.concat(newHashes.map(b => b.hash)).slice(-16);
                this.blockCount += newHashes.length;

                // Only reflect the newest block in UI
                const newest = newHashes[newHashes.length - 1];
                this.latestBlock = {
                    hash: newest.hash,
                    account: newest.account || '',
                    type: newest.type || ''
                };
                this.latestBlockTime = new Date().toLocaleTimeString();

                // Auto-regenerate the system salt whenever fresh blockhashes arrive
                this.regenSalt();
            } catch (e) {
                console.error('[api] fetch error', e);
                this.connected = false;
            } finally {
                this.fetching = false;
            }
        },

        // Debounced generate - coalesce rapid triggers into one run
        scheduleGenerate() {
            if (this.genTimer) return;
            this.genTimer = setTimeout(async () => {
                this.genTimer = null;
                await this.autoGenerate();
            }, 250);
        },

        // Debounced password generate
        pwTimer: null,
        schedulePwGen() {
            if (this.pwTimer) return;
            this.pwTimer = setTimeout(async () => {
                this.pwTimer = null;
                await this.genPassword();
            }, 250);
        },

        // Cache for salt bytes (avoids re-encoding the same salts repeatedly)
        _saltCache: null,
        _saltCacheKey: null,

        _saltBytes() {
            const key = this.systemSalt + '|' + this.userSalt;
            if (this._saltCacheKey !== key) {
                this._saltCacheKey = key;
                const out = [];
                // Feed the raw 32 bytes directly (no hex -> UTF-8 detour)
                if (this.systemSaltBytes.length) out.push(...this.systemSaltBytes);
                if (this.userSalt) out.push(...Array.from(new TextEncoder().encode(this.userSalt)));
                this._saltCache = out;
            }
            return this._saltCache;
        },

        // Build entropy bytes from system salt + user salt + blockhashes
        async blockHashEntropy(byteLen) {
            const combined = this.blockBuffer.join(''); // buffer already capped at 16
            // Salts first (secret), then the public block bytes — matches the documented formula
            const rawBytes = [...this._saltBytes()];
            // Convert hex chars to bytes
            for (let i = 0; i + 1 < combined.length; i += 2) {
                rawBytes.push(parseInt(combined.slice(i, i + 2), 16));
            }
            // SHA-256 to smooth distribution and produce 32 bytes
            let hashed = await BIP39.sha256(rawBytes);
            return hashed.slice(0, byteLen);
        },

        async autoGenerate() {
            if (this.generating) return;
            if (typeof BIP39 === 'undefined') {
                this.showToast('Error', 'BIP39 wordlist not loaded.');
                return;
            }
            if (this.blockBuffer.length === 0) return;
            if (!this.systemSaltBytes.length) {
                // Never build entropy without the CSPRNG system salt (fail closed)
                this.showToast('No system salt', 'Secure random salt missing — no seed was generated.');
                return;
            }

            this.generating = true;
            try {
                // 12 words = 16 bytes (128 bits)
                // 15 words = 20 bytes (160 bits)
                // 18 words = 24 bytes (192 bits)
                // 24 words = 32 bytes (256 bits)
                const wc = parseInt(this.wordCount);
                const byteLen = wc === 12 ? 16 : wc === 15 ? 20 : wc === 18 ? 24 : 32;
                const entropyBytes = await this.blockHashEntropy(byteLen);

                this.entropyHex = BIP39.bytesToHex(entropyBytes);
                const words = await BIP39.entropyToMnemonic(entropyBytes);

                if (!words || words.length !== parseInt(this.wordCount)) {
                    throw new Error('Unexpected mnemonic length: ' + (words ? words.length : 0));
                }
                for (const w of words) {
                    if (!BIP39.isValidWord(w)) throw new Error('Invalid word: ' + w);
                }

                // Update derived display values (About tab only - skip if hidden)
                if (this.page === 'about') {
                    this.systemSaltHex = this.systemSalt; // hex of the raw 32 bytes (user salt shown separately below)
                    const joined = this.blockBuffer.join('');
                    this.blockBufferHexShort = joined.length > 48 ? joined.slice(0, 48) + '...' : joined;
                    const csHash = await BIP39.sha256(entropyBytes);
                    this.checksumHex = BIP39.bytesToHex(csHash);
                }

                this.words = words;
                this.generatedAt = new Date().toLocaleString();
                // Auto-generate password from the NEW entropy snapshot (awaited -> always in sync)
                await this.genPassword(this.entropyHex, this._saltBytes());
            } catch (e) {
                console.error(e);
                this.showToast('Error', e.message || 'Failed to generate seed.');
            } finally {
                this.generating = false;
            }
        },

        async copy() {
            if (!this.words.length) return;
            try {
                await navigator.clipboard.writeText(this.words.join(' '));
                this.showToast('Copied', 'Seed phrase copied to clipboard.');
            } catch (e) {
                this.showToast('Error', 'Cannot copy: ' + e.message);
            }
        },

        download() {
            if (!this.words.length) return;
            const content = [
                '# NanoRandom Seed Phrase',
                `# Generated: ${this.generatedAt}`,
                `# Words: ${this.words.length}`,
                `# Entropy: ${this.entropyHex}`,
                `# Derivation: NanoRandom/Seed/v2`,
                `# Inputs: browser CSPRNG + optional user salt + Nano blockhashes`,
                '',
                this.words.join(' '),
                ''
            ].join('\n');
            const blob = new Blob([content], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `nano-seed-${Date.now()}.txt`;
            a.click();
            URL.revokeObjectURL(url);
            this.showToast('Downloaded', 'Seed phrase saved to file.');
        },

        toastTimer: null,

        showToast(title, body) {
            if (this.toastTimer) clearTimeout(this.toastTimer);
            this.toast = { show: true, title, body };
            this.toastTimer = setTimeout(() => { this.toast.show = false; this.toastTimer = null; }, 3500);
        },

        // ---- Password generator ----
        // Custom SHA-256 counter-mode expansion (NOT HKDF):
        // stream block_i = SHA-256(entropyBytes || counter_i || saltBytes)
        async genPassword(entropyHex, saltBytes) {
            // Coalesce calls arriving while a generation is running (don't drop them)
            if (this.pwBusy) { this.pwPending = true; return; }
            const src    = entropyHex || this.entropyHex;         // snapshot, not live state
            const salts  = saltBytes ? Array.from(saltBytes) : this._saltBytes();
            if (!src) {
                this.showToast('No entropy', 'Generate a seed phrase first.');
                return;
            }
            this.pwBusy = true;
            try {
                const sets = [];
                if (this.pwOptions.upper)   sets.push('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
                if (this.pwOptions.lower)   sets.push('abcdefghijklmnopqrstuvwxyz');
                if (this.pwOptions.numbers) sets.push('0123456789');
                if (this.pwOptions.symbols) sets.push('!@#$%^&*()-_=+[]{};:,.?/');
                if (sets.length === 0) {
                    this.showToast('No charset', 'Select at least one character set.');
                    return;
                }
                const all  = sets.join('');
                const len  = Math.min(128, Math.max(8, parseInt(this.pwOptions.length) || 64)); // clamp to UI spec 8..128
                const base = BIP39.hexToBytes(src);

                let counter = 0;
                let buf = [];
                const nextByte = async () => {
                    if (!buf.length) {
                        const h = await BIP39.sha256(base.concat([counter & 0xff], salts));
                        buf.push(...h);
                        counter++;
                    }
                    return buf.shift();
                };
                // Unbiased integer in [0, n) via rejection sampling (eliminates modulo bias).
                // Multi-byte draw so n > 256 can never deadlock (limit would be 0).
                const pick = async (n) => {
                    const bytes = n <= 256 ? 1 : n <= 65536 ? 2 : 4;
                    const range = 256 ** bytes;
                    const limit = range - (range % n);
                    let v;
                    do {
                        v = 0;
                        for (let k = 0; k < bytes; k++) v = v * 256 + await nextByte();
                    } while (v >= limit);
                    return v % n;
                };

                const chars = [];
                for (let i = 0; i < len; i++) chars.push(all[await pick(all.length)]);

                // Guarantee >= 1 char from each enabled set, on distinct unbiased slots
                if (len >= sets.length) {
                    const used = new Set();
                    const slots = [];
                    let attempts = 0;
                    while (slots.length < sets.length && attempts < len * 4 + 64) {
                        attempts++;
                        const s = await pick(len);
                        if (!used.has(s)) { used.add(s); slots.push(s); }
                    }
                    // Fallback: fill remaining slots sequentially (stream can, in theory, be degenerate)
                    for (let p = 0; slots.length < sets.length && p < len; p++) {
                        if (!used.has(p)) { used.add(p); slots.push(p); }
                    }
                    for (let i = 0; i < sets.length; i++) {
                        chars[slots[i]] = sets[i][await pick(sets[i].length)];
                    }
                }
                this.password = chars.join('');
                this.updatePwStrength();
            } finally {
                this.pwBusy = false;
                if (this.pwPending) { this.pwPending = false; await this.genPassword(); }
            }
        },

        async copyPassword() {
            if (!this.password) return;
            try {
                await navigator.clipboard.writeText(this.password);
                this.showToast('Copied', 'Password copied to clipboard.');
            } catch (e) {
                this.showToast('Error', 'Cannot copy: ' + e.message);
            }
        },

        updatePwStrength() {
            const len = this.password.length;
            if (!len) { this.pwStrength = { label: '-', cls: 'bg-secondary', percent: 0 }; return; }
            // Charset actually in effect (not the union of all sets)
            let pool = 0;
            if (this.pwOptions.upper)   pool += 26;
            if (this.pwOptions.lower)   pool += 26;
            if (this.pwOptions.numbers) pool += 10;
            if (this.pwOptions.symbols) pool += 24;
            if (!pool) { this.pwStrength = { label: '-', cls: 'bg-secondary', percent: 0 }; return; }
            // The password is deterministic from the seed entropy, so its true
            // unpredictability is capped by the seed bits feeding the expansion
            const nominal  = len * Math.log2(pool);
            const seedBits = this.entropyHex ? this.entropyHex.length * 4 : 0;
            const bits     = Math.min(nominal, seedBits);
            const percent  = Math.min(100, Math.round(bits / 1.28));
            let label, cls;
            if (bits < 60) { label = 'Weak';     cls = 'bg-danger'; }
            else if (bits < 100) { label = 'Fair';  cls = 'bg-warning'; }
            else if (bits < 160) { label = 'Strong'; cls = 'bg-success'; }
            else { label = 'Very strong'; cls = 'bg-success'; }
            this.pwStrength = { label, cls, percent };
        }
    };
}
