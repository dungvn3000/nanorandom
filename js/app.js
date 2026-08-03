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
        systemSalt: '',
        userSalt: '',
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
        pwStrength: { label: '-', cls: 'bg-secondary', percent: 0 },

        async init() {
            this.updateSaltStatus();
            this.$watch('userSalt', () => this.updateSaltStatus());
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
            else                      { level='strong'; msg=`Strong (${s.length} chars). Nice.`; cls='bg-success'; }
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
            this.systemSalt = BIP39.bytesToHex(Array.from(arr));
            this.scheduleGenerate();
        },

        fetching: false,

        async fetchBlocks() {
            if (this.fetching) return; // in-flight guard
            this.fetching = true;
            try {
                const res = await fetch('https://api.nanexplorer.com/last-blocks?network=nano');
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const data = await res.json();
                const list = (data && data.last) || [];
                if (!list.length) return;

                if (!this.connected) {
                    this.connected = true;
                    console.log('[api] connected, polling every 3s');
                }

                // One-pass: collect only unseen hashes, mutate reactive state once
                const newHashes = [];
                for (const b of list) {
                    const h = b.hash;
                    if (!h || this.seenHashes[h]) continue;
                    this.seenHashes[h] = true;
                    newHashes.push(b);
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
                if (this.systemSalt) out.push(...Array.from(new TextEncoder().encode(this.systemSalt)));
                if (this.userSalt)   out.push(...Array.from(new TextEncoder().encode(this.userSalt)));
                this._saltCache = out;
            }
            return this._saltCache;
        },

        // Build entropy bytes from blockhashes + system salt + user salt
        async blockHashEntropy(byteLen) {
            const combined = this.blockBuffer.join(''); // buffer already capped at 16
            // Convert hex chars to bytes
            const rawBytes = [];
            for (let i = 0; i + 1 < combined.length; i += 2) {
                rawBytes.push(parseInt(combined.slice(i, i + 2), 16));
            }
            // Append system salt + user salt (UTF-8, cached)
            rawBytes.push(...this._saltBytes());
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
                    this.systemSaltHex = this.systemSalt ? BIP39.bytesToHex(this._saltBytes()) : '';
                    const joined = this.blockBuffer.join('');
                    this.blockBufferHexShort = joined.length > 48 ? joined.slice(0, 48) + '...' : joined;
                    const csHash = await BIP39.sha256(entropyBytes);
                    this.checksumHex = BIP39.bytesToHex(csHash);
                }

                this.words = words;
                this.generatedAt = new Date().toLocaleString();
                // Auto-generate password from the new entropy
                this.genPassword();
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
                `# Source: 100% live blockhash from https://api.nanexplorer.com/last-blocks?network=nano`,
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
        // HKDF-like expansion: repeatedly SHA-256(entropyHex || counter || salts)
        async expandEntropy(byteLen) {
            const out = [];
            const base = BIP39.hexToBytes(this.entropyHex || '00');
            const saltBytes = Array.from(this._saltBytes());
            let counter = 0;
            while (out.length < byteLen) {
                const input = base.concat([counter & 0xff], saltBytes);
                const h = await BIP39.sha256(input);
                out.push(...h);
                counter++;
            }
            return out.slice(0, byteLen);
        },

        async genPassword() {
            if (this.pwBusy) return;
            if (!this.entropyHex) {
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
                const all = sets.join('');
                const len = parseInt(this.pwOptions.length) || 64;
                const expanded = await this.expandEntropy(len * 2);
                const chars = [];
                for (let i = 0; i < len; i++) {
                    const idx = expanded[i] % all.length;
                    chars.push(all[idx]);
                }
                if (len >= sets.length) {
                    // Pick `sets.length` distinct slots deterministically from expanded bytes
                    const used = new Set();
                    const slots = [];
                    for (let raw = 0; raw < len * 2 && slots.length < sets.length; raw++) {
                        const s = expanded[len + (raw % len)] % len;
                        if (!used.has(s)) {
                            used.add(s);
                            slots.push(s);
                        }
                    }
                    // Fallback: fill remaining slots with any un-used position
                    for (let p = 0; slots.length < sets.length && p < len; p++) {
                        if (!used.has(p)) { used.add(p); slots.push(p); }
                    }
                    sets.forEach((set, i) => {
                        const slot = slots[i];
                        const ch = set[Math.floor((expanded[slot + len + i] || 0) % set.length)];
                        chars[slot] = ch;
                    });
                }
                this.password = chars.join('');
                this.updatePwStrength();
            } finally {
                this.pwBusy = false;
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
            const sets = [];
            if (/[A-Z]/.test(this.password)) sets.push(1);
            if (/[a-z]/.test(this.password)) sets.push(1);
            if (/[0-9]/.test(this.password)) sets.push(1);
            if (/[^A-Za-z0-9]/.test(this.password)) sets.push(1);
            const pool = 26 + 26 + 10 + 24;
            const bits = len * Math.log2(pool) * (sets.length / 4);
            const percent = Math.min(100, Math.round(bits / 1.28));
            let label, cls;
            if (bits < 60) { label = 'Weak';     cls = 'bg-danger'; }
            else if (bits < 100) { label = 'Fair';  cls = 'bg-warning'; }
            else if (bits < 160) { label = 'Strong'; cls = 'bg-success'; }
            else { label = 'Very strong'; cls = 'bg-success'; }
            this.pwStrength = { label, cls, percent };
        }
    };
}
