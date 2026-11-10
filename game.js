/* ==========================================================
   فرسان الزمن — منطق اللعبة (game.js)
   مبني على وثيقة تصميم اللعبة (GDD).

   البنية:
   - المخزن (Store): قاعدة بيانات مشتركة لايف عند النشر على Claude،
     أو ذاكرة المتصفح (جهاز واحد) عند فتح الملف محلياً.
   - المحرك (Engine): يعمل على شاشة الإدارة فقط. هو الوحيد الذي يغيّر
     حالة اللعبة. الفرق ترسل «طلبات» إلى صندوق الوارد، والمحرك ينفذها.
   - الواجهتان: واجهة الفريق وواجهة الإدارة.
   ========================================================== */
(() => {
'use strict';

/* ---------------- 1. ثوابت التصميم (من الوثيقة) ---------------- */

const TEAMS = 10, CENTERS = 10;
const TEAM_COLORS = ['#e2574c','#4c9be2','#4fbf86','#e8c33a','#a777e0','#ee8a3a','#2fc1b4','#e266a8','#9fb34a','#b9a58a'];

const COST = {
  startGold: 40,      // رصيد البداية
  ride: 10,           // آلة الزمن (لعب أي مركز)
  winGold: 20,        // الفوز بمركز
  winRes: 4,          // حصة الفوز من مورد واحد يختاره الفريق من 3
  prodRes: 2,         // إنتاج المركز المحتل كل 5 دقائق
  prodGold: 10,       // المركز 10 ينتج ذهباً
  attackGold: 10,     // الهجوم فوق آلة الزمن
  attackPowder: 2,    // بارود الهجوم
  shieldBreak: 15,    // كسر الدرع، تذهب للمدافع
  shieldOn: 2,        // تفعيل الدرع (عدة إصلاح)
  shieldUpkeep: 1,    // تشغيل الدرع كل 5 دقائق
  protect: 2,         // حماية المدافع (مؤن)
  revive: 3,          // إسعاف (أدوية)
  trap: 2,            // فخ (حِيَل)
  trapLoss: 10,       // خسارة من يقع بالفخ
  spy: 1, spyMin: 2,  // تجسس (إنترنت) لمدة دقيقتين
  scout: 1, scoutMin: 3, // منظار لمدة 3 دقائق
  seal: 3,            // ختم صورة
  map: 3,             // 3 قطع خريطة لكل رمز
  transferRole: 15,   // نقل دور مُفكّك الشفرات بالإدارة
  treasure: 15,       // رمز الكنز
  freeShieldMin: 10,  // رمز الدرع المجاني
  revealMin: 2,       // رمز كشف السكور
  tickMin: 5,         // دورة الإنتاج
  wrongMax: 3, lockSec: 60, // منع تخمين الأكواد
  maxClosed: 2        // أقصى عدد صور تُسكَّر لفريق
};

const RES = [
  { k: 'powder',   n: 'بارود' },
  { k: 'meds',     n: 'أدوية' },
  { k: 'net',      n: 'إنترنت' },
  { k: 'repair',   n: 'عدة إصلاح' },
  { k: 'tricks',   n: 'حِيَل' },
  { k: 'seals',    n: 'أختام زمنية' },
  { k: 'maps',     n: 'قطع خريطة' },
  { k: 'supplies', n: 'مؤن' },
  { k: 'scope',    n: 'منظار' }
];
const RES_NAME = Object.fromEntries(RES.map(r => [r.k, r.n]));
RES_NAME.gold = 'ذهب';
// مورد كل مركز (المركز 1 = بارود ... المركز 10 = ذهب)
const CENTER_RES = ['powder','meds','net','repair','tricks','seals','maps','supplies','scope','gold'];

const ROLES = [
  { k: 'decoder',   n: 'مُفكّك الشفرات',      res: 'seals',    d: 'يُدخل أكواد الصور، ويختم صورة مزالة فلا تُسكَّر في منتصف اللعبة. الختم: 3 أختام.' },
  { k: 'energy',    n: 'أمين طاقة الكرونومتر', res: 'gold',     d: 'يدفع ثمن آلة الزمن والهجوم وكسر الدرع. بلاه ما بيقدر الفريق يلعب أي مركز.' },
  { k: 'attacker',  n: 'المهاجم الزمني',       res: 'powder',   d: 'شرط لأي هجوم على مركز يحتله فريق آخر. 2 بارود لكل هجوم.' },
  { k: 'engineer',  n: 'مهندس المراسي',        res: 'repair',   d: 'يفعّل الدرع على مركز تحتلونه بـ2 عدة إصلاح، ثم 1 كل 5 دقائق تُخصم تلقائياً.' },
  { k: 'defender',  n: 'المدافع الزمني',       res: 'supplies', d: 'يحمي الفريق من القتل في الهجوم التالي عليه. الكلفة 2 مؤن.' },
  { k: 'medic',     n: 'مسعف الخط الزمني',     res: 'meds',     d: 'يعيد عضواً مقتولاً إلى اللعب بـ3 أدوية.' },
  { k: 'trickster', n: 'المخادع',              res: 'tricks',   d: 'يضع فخاً على مركز بـ2 حِيَل. أول فريق يحجزه يخسر 10 ذهب لكم. فخ واحد لكل مركز.' },
  { k: 'spy',       n: 'الجاسوس الزمني',       res: 'net',      d: 'يرى ذهب فريق آخر وموارده ودروعه لمدة دقيقتين. الكلفة 1 إنترنت.' },
  { k: 'explorer',  n: 'المستكشف الميداني',    res: 'scope',    d: 'يرى الفخاخ على كل المراكز لمدة 3 دقائق. الكلفة 1 منظار.' },
  { k: 'historian', n: 'الكشاف التاريخي (المؤرخ)', res: 'maps', d: 'كل 3 قطع خريطة تكشف رمزاً مشفراً، يفكّه بحل لغز قصير عن تاريخ الدير.' }
];
const ROLE = Object.fromEntries(ROLES.map(r => [r.k, r]));

const REWARDS = {
  gold:   'كنز: +15 ذهب',
  ride:   'رحلة مجانية بآلة الزمن',
  shield: 'درع مجاني على مركز لمدة 10 دقائق',
  reveal: 'كشف سكور كل المراكز المحتلة لمدة دقيقتين'
};

// القيم الافتراضية للمحتوى (الإدارة تعدّلها من «الإعداد والأكواد»)
const DEFAULT_CONFIG = {
  titles: [
    'رحيل الأثر: قباب مهجورة وقوس وحيد',
    'حفريات ونهب: حفرة مكان الدير',
    'الحصن الدائم: الدير قلعة حربية',
    'تحوّل المجمّع إلى ثكنة عسكرية',
    'لا تبرعات من الإمبراطور زينون لبناء المجمّع',
    'الدمار الكلي: زوال الأثر',
    'الازدهار الرقمي (المشهد الأول)',
    'الازدهار الرقمي وترميم 2026 بسقف زجاجي',
    'مسار بديل: قرية قباب بلا دير',
    'طبيعة خضراء ولا أثر للدير'
  ],
  facts: [
    'بقيت كنيسة القديس سمعان قائمة حتى اليوم على جبل سمعان، نحو 30 كم شمال غرب حلب، وهي من أبرز آثار المسيحية الأولى في العالم.',
    'سُجّل الموقع عام 2011 على لائحة اليونسكو للتراث العالمي ضمن «القرى الأثرية في شمال سوريا».',
    'حصّن البيزنطيون الموقع في القرن العاشر، ومن هنا جاء اسم «قلعة سمعان»، لكنه بقي في جوهره كنيسة ومقصداً للحجاج.',
    'بُني المجمّع للصلاة والحج، وكان الحجاج ينزلون في قرية دير سمعان أسفل الجبل، حيث بُنيت النُّزُل لاستقبالهم.',
    'موّل الإمبراطور البيزنطي زينون بناء الكنيسة بين نحو 476 و490م تكريماً للقديس سمعان العمودي.',
    'ما زالت بقايا العمود الذي عاش عليه القديس سمعان قائمة في قلب البهو المثمّن، بعد أن أخذ الحجاج قطعاً منه للبركة عبر القرون.',
    'صُمّم المجمّع على شكل صليب: أربع بازيليكات تلتقي حول بهو مثمّن في وسطه العمود، وكان من أكبر كنائس العالم في زمنه.',
    'أصالة الأثر في حجره الكلسي المحلي ونقوشه الأصلية، وحمايته بترميم يحترم شكله الأصلي لا بتغيير وجهه.',
    'عاش القديس سمعان العمودي نحو 37 سنة فوق عمود، وتوفي عام 459م، فقام المجمّع حول عموده بعد وفاته.',
    'يقع الدير بين «المدن المنسية» في الكتلة الكلسية شمال سوريا، وهي مئات القرى البيزنطية الحجرية التي ما زالت أطلالها قائمة.'
  ],
  riddles: [
    { q: 'على شو عاش القديس سمعان سنين طويلة؟', reward: 'gold' },
    { q: 'مين الإمبراطور اللي موّل بناء الكنيسة؟', reward: 'ride' },
    { q: 'كم بازيليكا بتلتقي حول البهو المثمّن؟', reward: 'shield' },
    { q: 'شو اسم الجبل اللي عليه الدير؟', reward: 'reveal' }
  ]
};
const DEFAULT_ANSWERS = ['عمود|العمود', 'زينون', '4|اربع|أربع|اربعة|أربعة', 'سمعان|جبل سمعان'];

/* ---------------- 2. أدوات صغيرة ---------------- */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const now = () => Date.now();
const rnd = n => Math.floor(Math.random() * n);
const pick = arr => arr[rnd(arr.length)];
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pad = n => String(n).padStart(2, '0');
const mmss = ms => { ms = Math.max(0, ms); const s = Math.floor(ms / 1000); return pad(Math.floor(s / 60)) + ':' + pad(s % 60); };
const clock = t => { const d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const teamName = n => 'فريق ' + n;
const chip = n => n ? `<span class="team-chip" style="--tc:${TEAM_COLORS[n - 1]}">${teamName(n)}</span>` : '<span class="muted">لا أحد</span>';
const code4 = () => String(1000 + rnd(9000));
const hashPin = s => { let h = 2166136261; for (const ch of 'fursan:' + s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const norm = s => String(s || '').toLowerCase()
  .replace(/[ً-ْـ]/g, '')
  .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
  .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
  .replace(/\s+/g, '');
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
const imgSrc = i => `img/e${i + 1}.jpg`;

/* ---------------- 3. المخزن ----------------
   ثلاثة أوضاع:
   - 'mqtt'  : الوضع الأساسي على GitHub والتطبيق. كل الأجهزة متصلة بخادم مزامنة عام.
   - 'db'    : عند فتح اللعبة من رابط Claude المنشور.
   - 'local' : إذا ما في إنترنت أبداً (جهاز واحد للتجربة).
   ------------------------------------------------------------ */

// غيّروا اسم الغرفة لأي كلمة خاصة فيكم (أحرف إنكليزية وأرقام فقط).
// كل الأجهزة اللي فيها نفس اسم الغرفة بتلعب بنفس اللعبة.
const ROOM = 'fursan-jec-7k3x9q2m';
// خادم المزامنة العام والمجاني (ما بيحتاج حساب)
const BROKER = 'wss://broker.emqx.io:8084/mqtt';

const qs = new URLSearchParams(location.search);
const ROOM_ID = (qs.get('room') || ROOM).replace(/[^A-Za-z0-9_-]/g, '');
const BROKER_URL = qs.get('broker') || BROKER;

const Store = {
  mode: 'local', db: null, user: null, mq: null, cache: {}, listeners: {}, connected: false,

  async init() {
    // 1) داخل رابط Claude
    if (window.claude && typeof window.claude.use === 'function') {
      try {
        const db = await Promise.race([window.claude.use('db'), new Promise(r => setTimeout(() => r(null), 8000))]);
        if (db) { this.db = db; this.mode = 'db'; this.user = await window.claude.use('user').catch(() => null); return; }
      } catch {}
    }
    // 2) خادم المزامنة
    if (window.mqtt) {
      const ok = await this.connectMqtt();
      if (ok) { this.mode = 'mqtt'; return; }
    }
    // 3) جهاز واحد
    window.addEventListener('storage', e => { if (e.key && e.key.startsWith('fz:')) this._emit(e.key.slice(3)); });
  },

  connectMqtt() {
    return new Promise(resolve => {
      let done = false;
      const finish = v => { if (!done) { done = true; resolve(v); } };
      const c = window.mqtt.connect(BROKER_URL, {
        clientId: 'fz_' + Math.random().toString(36).slice(2, 12),
        clean: true, reconnectPeriod: 2000, connectTimeout: 10000, keepalive: 30
      });
      this.mq = c;
      c.on('connect', () => {
        this.connected = true; soonStatus();
        c.subscribe(ROOM_ID + '/#', { qos: 1 }, () => {
          // مهلة قصيرة لوصول الحالة المحفوظة على الخادم
          setTimeout(() => finish(true), 1500);
        });
      });
      c.on('message', (topic, buf) => {
        const path = topic.slice(ROOM_ID.length + 1);
        const txt = buf.toString();
        if (!txt) delete this.cache[path];
        else { try { this.cache[path] = JSON.parse(txt); } catch { return; } }
        this._emit(path);
      });
      c.on('close', () => { this.connected = false; soonStatus(); });
      c.on('offline', () => { this.connected = false; soonStatus(); });
      c.on('reconnect', () => soonStatus());
      setTimeout(() => finish(this.connected), 12000);
    });
  },

  async isAdmin() {
    if (this.mode === 'db') { try { return !!(this.user && await this.user.canEdit()); } catch { return false; } }
    return true; // في وضع المزامنة الإدارة محمية بكلمة سر
  },

  /* اشتراك بوثيقة: cb(data|null) */
  doc(path, cb) {
    if (this.mode === 'db') {
      return this.db.doc(path).onSnapshot(s => cb(s.exists ? s.data() : null), e => console.warn('db', path, e));
    }
    const fire = () => cb(this.mode === 'mqtt' ? (this.cache[path] ?? null) : ls.get('fz:' + path, null));
    (this.listeners[path] ||= []).push(fire); fire();
    return () => { this.listeners[path] = this.listeners[path].filter(f => f !== fire); };
  },

  /* اشتراك بمجموعة: cb([{id, data}]) */
  col(path, cb) {
    if (this.mode === 'db') {
      return this.db.collection(path).onSnapshot(q => cb(q.docs.map(d => ({ id: d.id, data: d.data() }))), e => console.warn('db', path, e));
    }
    const fire = () => {
      const out = [];
      if (this.mode === 'mqtt') {
        for (const k in this.cache) { if (k.startsWith(path + '/') && k.indexOf('/', path.length + 1) === -1) out.push({ id: k.slice(path.length + 1), data: this.cache[k] }); }
      } else {
        try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('fz:' + path + '/')) out.push({ id: k.slice(path.length + 4), data: ls.get(k, null) }); } } catch {}
      }
      out.sort((a, b) => a.id.localeCompare(b.id));
      cb(out);
    };
    (this.listeners['col:' + path] ||= []).push(fire); fire();
    return () => {};
  },

  async set(path, data) {
    if (this.mode === 'db') return this.db.doc(path).set(data);
    if (this.mode === 'mqtt') {
      this.cache[path] = data; this._emit(path);
      return new Promise((res, rej) => this.mq.publish(ROOM_ID + '/' + path, JSON.stringify(data), { qos: 1, retain: true }, e => e ? rej(e) : res()));
    }
    ls.set('fz:' + path, data); this._emit(path);
  },
  async del(path) {
    if (this.mode === 'db') return this.db.doc(path).delete();
    if (this.mode === 'mqtt') {
      delete this.cache[path]; this._emit(path);
      return new Promise(res => this.mq.publish(ROOM_ID + '/' + path, '', { qos: 1, retain: true }, () => res()));
    }
    try { localStorage.removeItem('fz:' + path); } catch {} this._emit(path);
  },
  async lease(holder) {
    if (this.mode === 'db') {
      try { const r = await this.db.doc('fz/engine').acquire({ holder, ttlMs: 20000, data: { beat: now() } }); return r.acquired; }
      catch { return false; }
    }
    const d = this.mode === 'mqtt' ? this.cache['fz/engine'] : ls.get('fz:fz/engine', null);
    if (d && d.holder && d.holder !== holder && now() - d.beat < 20000) return false;
    await this.set('fz/engine', { beat: now(), holder }).catch(() => {});
    return true;
  },
  _emit(path) {
    (this.listeners[path] || []).forEach(f => f());
    const col = path.split('/').slice(0, -1).join('/');
    (this.listeners['col:' + col] || []).forEach(f => f());
  }
};

/* ---- تشفير أسرار الإدارة (الأكواد والأرقام السرية) بكلمة سر الإدارة ----
   خادم المزامنة عام، فالأسرار ما بتنبعت إلا مشفّرة. */
const Vault = {
  key: null, salt: null,
  b64: buf => btoa(String.fromCharCode(...new Uint8Array(buf))),
  unb64: s => Uint8Array.from(atob(s), c => c.charCodeAt(0)),
  async derive(pw, salt) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  },
  async setNew(pw) { this.salt = crypto.getRandomValues(new Uint8Array(16)); this.key = await this.derive(pw, this.salt); },
  async open(env, pw) {
    const salt = this.unb64(env.salt), key = await this.derive(pw, salt);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: this.unb64(env.iv) }, key, this.unb64(env.ct));
    this.key = key; this.salt = salt;
    return JSON.parse(new TextDecoder().decode(plain));
  },
  async seal(obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.key, new TextEncoder().encode(JSON.stringify(obj)));
    return { enc: 1, salt: this.b64(this.salt), iv: this.b64(iv), ct: this.b64(ct) };
  },
  async read(env) {
    if (!env) return null;
    if (!env.enc) return env;            // وضع Claude: غير مشفّر
    if (!this.key) return null;
    try {
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: this.unb64(env.iv) }, this.key, this.unb64(env.ct));
      return JSON.parse(new TextDecoder().decode(plain));
    } catch { return null; }
  }
};
const encryptSecrets = () => Store.mode !== 'db';

/* ---------------- 4. الحالة المشتركة كما تصل للواجهات ---------------- */

const V = {
  secretEnv: null,
  game: null, config: null, base: null, log: [], engineBeat: 0,
  teams: {}, centers: {}, secret: null
};
const cfg = () => V.config || DEFAULT_CONFIG;
const title = i => cfg().titles?.[i] || DEFAULT_CONFIG.titles[i];
const fact = i => cfg().facts?.[i] || DEFAULT_CONFIG.facts[i];

function elapsedMs(g = V.game) {
  if (!g || !g.startAt) return 0;
  const end = g.status === 'paused' ? g.pausedAt : g.status === 'ended' ? (g.endAt || now()) : now();
  return Math.max(0, end - g.startAt - (g.pausedTotal || 0));
}
const remainMs = (g = V.game) => g ? g.duration * 60000 - elapsedMs(g) : 0;
function midActive(g = V.game) {
  if (!g || g.status !== 'running') return false;
  const m = elapsedMs(g) / 60000;
  return m >= g.midStart && m < g.midEnd;
}
const alive = (t, role) => !!t && t.slots.some(s => s.role === role && s.alive);
const shieldUp = c => !!c.shield && (!c.shieldUntil || now() < c.shieldUntil);
const clearedCount = t => t.cleared.filter(Boolean).length;
const ownedCount = n => Object.values(V.centers).filter(c => c.owner === n).length;

function playCost(t, c) {
  const free = (t.tokens?.freeRide || 0) > 0;
  let gold = free ? 0 : COST.ride, powder = 0, toOwner = 0, attack = false;
  if (c.owner && c.owner !== t.n) {
    attack = true; gold += COST.attackGold; powder = COST.attackPowder;
    if (shieldUp(c)) { gold += COST.shieldBreak; toOwner = COST.shieldBreak; }
  }
  return { gold, powder, toOwner, attack, free };
}

/* ---------------- 5. المحرك (شاشة الإدارة فقط) ---------------- */

const E = {
  on: false, holder: 'h' + now().toString(36) + rnd(1e6), S: null, done: new Set(),
  queue: new Map(), flushing: false, inboxBusy: false, inboxPending: null,

  persist(path, data) { this.queue.set(path, clone(data)); this.flush(); if (this.S) this.backup(); },
  async flush() {
    if (this.flushing) return; this.flushing = true;
    while (this.queue.size) {
      const [p, d] = this.queue.entries().next().value; this.queue.delete(p);
      try {
        const body = (p === 'secret/main' && encryptSecrets()) ? await Vault.seal(d) : d;
        await Store.set(p, body);
      } catch (e) { console.warn('write failed', p, e); toast('تعذّر الحفظ، أعيدوا المحاولة', 'bad'); }
    }
    this.flushing = false;
  },
  backup() { clearTimeout(this.bt); this.bt = setTimeout(() => ls.set('fz-backup', { at: now(), room: ROOM_ID, S: this.S }), 800); },
  republishAll() {
    if (!this.ready() || Store.mode !== 'mqtt') return;
    this.saveGame(); this.saveSecret(); this.saveLog();
    for (let n = 1; n <= TEAMS; n++) this.saveTeam(n);
    for (let c = 1; c <= CENTERS; c++) this.saveCenter(c);
  },
  saveTeam(n) { this.persist('teams/t' + n, this.S.teams[n]); },
  saveCenter(n) { this.persist('centers/c' + n, this.S.centers[n]); },
  saveGame() { this.persist('fz/game', this.S.game); },
  saveSecret() { this.persist('secret/main', this.S.secret); },
  saveLog() { this.persist('fz/log', { items: this.S.log.slice(-120) }); },

  log(txt, k = 'info', to = null) {
    this.S.log.push({ id: now().toString(36) + rnd(1e5), at: now(), txt, k, to });
    this.saveLog();
  },
  fb(n, ok, msg, id) {
    const t = this.S.teams[n]; if (!t) return;
    t.fb = { id: id || now().toString(36), ok, msg, at: now() };
  },

  /* أخذ الحالة الحالية من آخر ما وصل */
  loadFromView() {
    const bk = ls.get('fz-backup', null);
    if (!V.game && bk && bk.room === ROOM_ID && bk.S && bk.S.game && V.secret) {
      // الخادم فقد الحالة: نرجّعها من نسخة لابتوب الإدارة
      this.S = bk.S; setTimeout(() => this.republishAll(), 300); return;
    }
    this.S = {
      game: clone(V.game), teams: clone(V.teams), centers: clone(V.centers),
      secret: clone(V.secret), log: clone(V.log)
    };
  },

  async start() {
    const ok = await Store.lease(this.holder);
    if (ok && !this.on) { this.on = true; this.loadFromView(); this.subInbox(); }
    if (!ok) this.on = false;
    renderAdmin();
    setInterval(async () => {
      const got = await Store.lease(this.holder);
      if (got && !this.on) { this.on = true; this.loadFromView(); this.subInbox(); renderAdmin(); }
      if (!got && this.on) { this.on = false; renderAdmin(); }
    }, 8000);
    setInterval(() => { if (this.on) this.tick(); }, 2000);
    setInterval(() => { if (this.on) this.republishAll(); }, 60000);
  },

  subInbox() {
    if (this.inboxSub) return; this.inboxSub = true;
    Store.col('inbox', docs => { this.inboxPending = docs; this.drainInbox(); });
  },
  ready() { return !!(this.on && this.S && this.S.game && this.S.secret); },

  /* ---- تجهيز لعبة جديدة ---- */
  newGame(keepSecrets = true) {
    const old = this.S || {};
    const sec = keepSecrets && old.secret ? old.secret : {};
    const pins = sec.pins || {};
    const codes = sec.codes || {};
    for (let n = 1; n <= TEAMS; n++) {
      if (!pins[n]) pins[n] = code4();
      if (!codes[n]) codes[n] = Array.from({ length: CENTERS }, () => [code4(), code4()]);
    }
    const S = {
      game: { status: 'setup', duration: old.game?.duration || 120, midStart: old.game?.midStart || 55, midEnd: old.game?.midEnd || 65,
              startAt: 0, pausedAt: 0, pausedTotal: 0, endAt: 0, lastTick: 0, midOpened: false, midClosed: false, winner: null, rank: null, v: now() },
      teams: {}, centers: {},
      secret: { pins, codes, traps: {}, answers: sec.answers || DEFAULT_ANSWERS.slice() },
      log: []
    };
    for (let n = 1; n <= TEAMS; n++) {
      const prev = old.teams?.[n];
      S.teams[n] = {
        n, pinH: hashPin(pins[n]), gold: COST.startGold,
        res: Object.fromEntries(RES.map(r => [r.k, 0])),
        slots: ROLES.map((r, i) => ({ role: r.k, name: prev?.slots?.[i]?.name || ('فارس ' + (i + 1)), alive: true })),
        cleared: Array(CENTERS).fill(false), sealed: Array(CENTERS).fill(false), needBackup: Array(CENTERS).fill(false),
        closedCount: 0, closeTokens: 0, tokens: { freeRide: 0, freeShield: 0 }, armed: false,
        wrong: 0, lockUntil: 0, pending: null, riddle: null, riddleIdx: 0,
        spy: null, scout: null, revealUntil: 0, fb: null
      };
    }
    for (let c = 1; c <= CENTERS; c++) {
      S.centers[c] = { n: c, owner: null, score: 0, shield: false, shieldUntil: 0, queue: [], playing: null, playStart: 0, paid: null, min: old.centers?.[c]?.min ?? 1 };
    }
    this.S = S;
    this.log('تم تجهيز لعبة جديدة. بانتظار البدء.', 'time');
    this.saveGame(); this.saveSecret();
    for (let n = 1; n <= TEAMS; n++) this.saveTeam(n);
    for (let c = 1; c <= CENTERS; c++) this.saveCenter(c);
    if (!V.config) this.persist('fz/config', clone(DEFAULT_CONFIG));
    setTimeout(() => this.drainInbox(), 0);
  },

  /* ---- الوقت ---- */
  startGame() { const g = this.S.game; if (g.status !== 'setup') return; g.status = 'running'; g.startAt = now(); g.pausedTotal = 0; this.log('انطلقت اللعبة! احموا الدير.', 'time'); this.saveGame(); },
  pause() { const g = this.S.game; if (g.status !== 'running') return; g.status = 'paused'; g.pausedAt = now(); this.log('توقف مؤقت للعبة.', 'time'); this.saveGame(); },
  resume() { const g = this.S.game; if (g.status !== 'paused') return; g.pausedTotal += now() - g.pausedAt; g.pausedAt = 0; g.status = 'running'; this.log('استئناف اللعبة.', 'time'); this.saveGame(); },
  endGame(winner = null) {
    const g = this.S.game; if (g.status === 'ended') return;
    if (g.status === 'paused') { g.pausedTotal += now() - g.pausedAt; }
    g.status = 'ended'; g.endAt = now(); g.winner = winner;
    const rank = Object.values(this.S.teams).map(t => ({
      n: t.n, cleared: clearedCount(t), owned: Object.values(this.S.centers).filter(c => c.owner === t.n).length, gold: t.gold
    })).sort((a, b) => b.cleared - a.cleared || b.owned - a.owned || b.gold - a.gold);
    g.rank = rank; if (!winner) g.winner = rank[0].n;
    this.log(winner ? `${teamName(winner)} منع الأحداث العشرة وحمى الدير! انتهت اللعبة.` : `انتهى الوقت. الفائز بالترتيب: ${teamName(g.winner)}.`, 'win');
    this.saveGame();
  },

  tick() {
    const g = this.S.game; if (!g || g.status !== 'running') return;
    const el = elapsedMs(g), min = el / 60000;
    // الإنتاج كل 5 دقائق
    const due = Math.floor(min / COST.tickMin);
    while (g.lastTick < due) { g.lastTick++; this.produce(); this.saveGame(); }
    // انتهاء الدروع المجانية
    for (const c of Object.values(this.S.centers)) {
      if (c.shield && c.shieldUntil && now() >= c.shieldUntil) { c.shield = false; c.shieldUntil = 0; this.log(`سقط الدرع المجاني على المركز ${c.n}.`, 'shield', [c.owner]); this.saveCenter(c.n); }
    }
    // نافذة منتصف اللعبة
    if (!g.midOpened && min >= g.midStart) { g.midOpened = true; this.log(`بدأت نافذة منتصف اللعبة (${g.midEnd - g.midStart} دقائق): كل فوز بمركز يمنحكم قدرة تسكير صورة.`, 'mid'); this.saveGame(); }
    if (g.midOpened && !g.midClosed && min >= g.midEnd) { g.midClosed = true; this.log('انتهت نافذة منتصف اللعبة.', 'mid'); this.saveGame(); }
    if (el >= g.duration * 60000) this.endGame(null);
  },

  produce() {
    const touched = new Set();
    for (const c of Object.values(this.S.centers)) {
      if (!c.owner) continue;
      const t = this.S.teams[c.owner]; const r = CENTER_RES[c.n - 1];
      if (r === 'gold') t.gold += COST.prodGold; else t.res[r] += COST.prodRes;
      touched.add(t.n);
      if (c.shield && !c.shieldUntil) {
        if (t.res.repair >= COST.shieldUpkeep) t.res.repair -= COST.shieldUpkeep;
        else { c.shield = false; this.log(`سقط درع المركز ${c.n}: نفدت عدة الإصلاح عند ${teamName(t.n)}.`, 'shield', [t.n]); }
        this.saveCenter(c.n);
      }
    }
    touched.forEach(n => this.saveTeam(n));
    this.log('دورة إنتاج: المراكز المحتلة أعطت مواردها.', 'info');
  },

  /* ---- صندوق الطلبات ---- */
  async drainInbox() {
    if (this.inboxBusy || !this.ready()) return; this.inboxBusy = true;
    try {
      while (this.inboxPending) {
        const docs = this.inboxPending; this.inboxPending = null;
        const list = docs.filter(d => d.data && !this.done.has(d.id)).sort((a, b) => (a.data.at || 0) - (b.data.at || 0));
        for (const d of list) {
          this.done.add(d.id);
          try { this.handle(d.data, d.id); } catch (e) { console.error(e); }
          Store.del('inbox/' + d.id).catch(() => {});
        }
      }
    } finally { this.inboxBusy = false; }
  },

  handle(a, id) {
    const n = Number(a.team), t = this.S.teams[n], g = this.S.game;
    if (!t) return;
    if (String(a.pin) !== String(this.S.secret.pins[n])) return; // طلب مزوّر
    const fail = msg => { this.fb(n, false, msg, id); this.saveTeam(n); };
    const ok = msg => { this.fb(n, true, msg, id); this.saveTeam(n); };
    const p = a.p || {};
    const running = g.status === 'running';

    switch (a.type) {
      case 'roster': {
        if (g.status !== 'setup') return fail('التشكيلة تُعدَّل قبل بدء اللعبة فقط.');
        (p.names || []).slice(0, 10).forEach((nm, i) => { if (t.slots[i]) t.slots[i].name = String(nm || '').replace(/\|/g, ' ').trim().slice(0, 24) || t.slots[i].name; });
        return ok('تم حفظ تشكيلة الفرسان.');
      }
      case 'book': {
        if (!running) return fail('اللعبة غير شغالة الآن.');
        const c = this.S.centers[p.c]; if (!c) return;
        if (Object.values(this.S.centers).some(x => x.queue.includes(n) || x.playing === n)) return fail('عندكم حجز أو جولة شغالة بمركز آخر.');
        if (c.owner === n) return fail('هذا المركز محتل من قبلكم.');
        if (!alive(t, 'energy')) return fail('أمين طاقة الكرونومتر مقتول، ما في مين يدفع.');
        const cost = playCost(t, c);
        if (cost.attack && !alive(t, 'attacker')) return fail('المهاجم الزمني مقتول، ما بتقدروا تهاجموا مركز محتل.');
        if (t.gold < cost.gold || t.res.powder < cost.powder) return fail(`الكلفة ${cost.gold} ذهب${cost.powder ? ' و' + cost.powder + ' بارود' : ''}. رصيدكم ما بيكفي.`);
        c.queue.push(n); this.saveCenter(c.n);
        const trapper = this.S.secret.traps[c.n];
        if (trapper && trapper !== n) {
          const loss = Math.min(COST.trapLoss, t.gold); t.gold -= loss;
          const tt = this.S.teams[trapper]; tt.gold += loss; this.saveTeam(trapper);
          delete this.S.secret.traps[c.n]; this.saveSecret();
          this.log(`${teamName(n)} وقع في فخ على المركز ${c.n} وخسر ${loss} ذهب لصالح ${teamName(trapper)}.`, 'trap', [n, trapper]);
          return ok(`انحجزتوا بالمركز ${c.n} (دوركم ${c.queue.length})، بس وقعتوا بفخ وخسرتوا ${loss} ذهب!`);
        }
        this.log(`${teamName(n)} طلب حجز المركز ${c.n}.`, 'info', [n]);
        return ok(`انحجزتوا بالمركز ${c.n}. دوركم ${c.queue.length} بالطابور.`);
      }
      case 'cancel': {
        const c = this.S.centers[p.c]; if (!c) return;
        c.queue = c.queue.filter(x => x !== n); this.saveCenter(c.n);
        return ok(`ألغيتوا حجز المركز ${c.n}.`);
      }
      case 'code': {
        if (g.status === 'setup') return fail('اللعبة ما بلّشت.');
        if (g.status === 'ended') return fail('اللعبة انتهت.');
        const i = Number(p.img);
        if (!(i >= 0 && i < CENTERS)) return;
        if (!alive(t, 'decoder')) return fail('مُفكّك الشفرات مقتول. أسعفوه أو اطلبوا من الإدارة نقل الدور.');
        if (now() < t.lockUntil) return fail(`الإدخال مقفول ${Math.ceil((t.lockUntil - now()) / 1000)} ثانية بسبب محاولات خاطئة.`);
        if (t.cleared[i]) return fail('هالحدث ممنوع من قبل.');
        const [prim, back] = this.S.secret.codes[n][i];
        const want = t.needBackup[i] ? back : prim;
        if (String(p.code).trim() === String(want)) {
          t.cleared[i] = true; t.wrong = 0;
          this.log(`${teamName(n)} منع الحدث ${i + 1}: ${title(i)}.`, 'clear', null);
          this.fb(n, true, 'CLEAR:' + i, id); this.saveTeam(n);
          if (t.cleared.every(Boolean)) this.endGame(n);
          return;
        }
        t.wrong++;
        if (t.wrong >= COST.wrongMax) { t.wrong = 0; t.lockUntil = now() + COST.lockSec * 1000; return fail(`الكود غلط. ${COST.wrongMax} محاولات خاطئة: الإدخال مقفول دقيقة.`); }
        return fail(`الكود غلط${t.needBackup[i] ? ' (هالصورة مسكّرة وبدها الكود الاحتياطي)' : ''}. باقي ${COST.wrongMax - t.wrong} محاولة.`);
      }
      case 'choose': {
        if (!t.pending || !t.pending.options.includes(p.res)) return;
        t.res[p.res] += COST.winRes; t.pending = null;
        return ok(`أخذتوا ${COST.winRes} ${RES_NAME[p.res]}.`);
      }
      case 'shield': {
        if (!running) return fail('اللعبة غير شغالة.');
        const c = this.S.centers[p.c]; if (!c) return;
        if (!alive(t, 'engineer')) return fail('مهندس المراسي مقتول.');
        if (c.owner !== n) return fail('الدرع يوضع على مركز تحتلونه فقط.');
        if (shieldUp(c)) return fail('المركز مدرّع أصلاً.');
        if (t.tokens.freeShield > 0) {
          t.tokens.freeShield--; c.shield = true; c.shieldUntil = now() + COST.freeShieldMin * 60000; this.saveCenter(c.n);
          this.log(`${teamName(n)} وضع درعاً مجانياً على المركز ${c.n}.`, 'shield');
          return ok(`درع مجاني على المركز ${c.n} لمدة ${COST.freeShieldMin} دقائق.`);
        }
        if (t.res.repair < COST.shieldOn) return fail(`تفعيل الدرع بدو ${COST.shieldOn} عدة إصلاح.`);
        t.res.repair -= COST.shieldOn; c.shield = true; c.shieldUntil = 0; this.saveCenter(c.n);
        this.log(`${teamName(n)} درّع المركز ${c.n}.`, 'shield');
        return ok(`تم تدريع المركز ${c.n}. رح ينخصم 1 عدة إصلاح كل 5 دقائق.`);
      }
      case 'protect': {
        if (!alive(t, 'defender')) return fail('المدافع الزمني مقتول.');
        if (t.armed) return fail('الحماية مفعّلة أصلاً.');
        if (t.res.supplies < COST.protect) return fail(`الحماية بدها ${COST.protect} مؤن.`);
        t.res.supplies -= COST.protect; t.armed = true;
        return ok('الحماية مفعّلة: أول هجوم ناجح عليكم ما رح يقتل حدا.');
      }
      case 'revive': {
        if (!alive(t, 'medic')) return fail('المسعف مقتول. فريق التنظيم بيقدر يرجّعه.');
        if (t.res.meds < COST.revive) return fail(`الإسعاف بدو ${COST.revive} أدوية.`);
        const slots = t.slots.filter(s => s.name === p.name && !s.alive); if (!slots.length) return fail('هالعضو مو مقتول.');
        t.res.meds -= COST.revive; slots.forEach(s => s.alive = true);
        this.log(`${teamName(n)} أسعف ${p.name}.`, 'info', [n]);
        return ok(`رجع ${p.name} للعب.`);
      }
      case 'trap': {
        if (!running) return fail('اللعبة غير شغالة.');
        if (!alive(t, 'trickster')) return fail('المخادع مقتول.');
        const c = Number(p.c); if (!this.S.centers[c]) return;
        if (this.S.secret.traps[c]) return fail('في فخ على هالمركز أصلاً. فخ واحد لكل مركز.');
        if (t.res.tricks < COST.trap) return fail(`الفخ بدو ${COST.trap} حِيَل.`);
        t.res.tricks -= COST.trap; this.S.secret.traps[c] = n; this.saveSecret();
        return ok(`تم زرع فخ على المركز ${c}.`);
      }
      case 'spy': {
        if (!alive(t, 'spy')) return fail('الجاسوس مقتول.');
        const tg = this.S.teams[p.target]; if (!tg || tg.n === n) return fail('اختاروا فريقاً آخر.');
        if (t.res.net < COST.spy) return fail('التجسس بدو 1 إنترنت.');
        t.res.net -= COST.spy;
        t.spy = { target: tg.n, until: now() + COST.spyMin * 60000, gold: tg.gold, res: clone(tg.res),
                  shields: Object.values(this.S.centers).filter(c => c.owner === tg.n && shieldUp(c)).map(c => c.n), cleared: clearedCount(tg) };
        return ok(`تقرير الجاسوس عن ${teamName(tg.n)} جاهز لمدة دقيقتين.`);
      }
      case 'scout': {
        if (!alive(t, 'explorer')) return fail('المستكشف مقتول.');
        if (t.res.scope < COST.scout) return fail('الكشف بدو 1 منظار.');
        t.res.scope -= COST.scout;
        t.scout = { until: now() + COST.scoutMin * 60000, traps: Object.keys(this.S.secret.traps).map(Number) };
        return ok('المنظار شغال: الفخاخ ظاهرة على خريطة المراكز لمدة 3 دقائق.');
      }
      case 'seal': {
        const i = Number(p.img);
        if (!alive(t, 'decoder')) return fail('مُفكّك الشفرات مقتول.');
        if (!t.cleared[i]) return fail('الختم لصورة منعتوا حدثها فقط.');
        if (t.sealed[i]) return fail('الصورة مختومة أصلاً.');
        if (t.res.seals < COST.seal) return fail(`الختم بدو ${COST.seal} أختام.`);
        t.res.seals -= COST.seal; t.sealed[i] = true;
        return ok(`ختمتوا الحدث ${i + 1}. ما حدا بيقدر يسكّره.`);
      }
      case 'map': {
        if (!alive(t, 'historian')) return fail('المؤرخ مقتول.');
        if (t.riddle) return fail('عندكم لغز مفتوح، حلّوه أولاً.');
        if (t.res.maps < COST.map) return fail(`الرمز بدو ${COST.map} قطع خريطة.`);
        const rs = (V.config || DEFAULT_CONFIG).riddles; if (!rs.length) return fail('ما في ألغاز مجهزة.');
        const k = t.riddleIdx % rs.length;
        t.res.maps -= COST.map; t.riddle = { k, q: rs[k].q, reward: rs[k].reward };
        return ok('انكشف رمز مشفّر! حلّوا اللغز لتفكّوه.');
      }
      case 'answer': {
        if (!t.riddle) return;
        const alts = String(this.S.secret.answers[t.riddle.k] || '').split('|').map(norm).filter(Boolean);
        if (!alts.includes(norm(p.text))) return fail('الجواب غلط. فكّروا كمان.');
        const rw = t.riddle.reward; t.riddle = null; t.riddleIdx++;
        if (rw === 'gold') t.gold += COST.treasure;
        if (rw === 'ride') t.tokens.freeRide++;
        if (rw === 'shield') t.tokens.freeShield++;
        if (rw === 'reveal') t.revealUntil = now() + COST.revealMin * 60000;
        this.log(`${teamName(n)} فكّ رمزاً على خريطة المؤرخ.`, 'info', [n]);
        return ok('صح! ربحتوا: ' + REWARDS[rw]);
      }
      case 'close': {
        if (!running) return fail('اللعبة غير شغالة.');
        if (t.closeTokens < 1) return fail('ما عندكم قدرة تسكير.');
        const tg = this.S.teams[p.target], i = Number(p.img);
        if (!tg || tg.n === n) return fail('اختاروا فريقاً آخر.');
        if (tg.closedCount >= COST.maxClosed) return fail(`${teamName(tg.n)} انسكرتلو صورتين، الحد الأقصى.`);
        if (!tg.cleared[i]) return fail('هالصورة مو مزالة عندهم.');
        if (tg.sealed[i]) return fail('هالصورة مختومة، ما بتنسكر.');
        t.closeTokens--; tg.cleared[i] = false; tg.needBackup[i] = true; tg.closedCount++;
        this.saveTeam(tg.n);
        this.log(`${teamName(n)} سكّر الحدث ${i + 1} عند ${teamName(tg.n)}. لازم يرجعوا يلعبوا المركز ${i + 1}.`, 'close', [n, tg.n]);
        return ok(`سكّرتوا الحدث ${i + 1} عند ${teamName(tg.n)}.`);
      }
    }
  },

  /* ---- أفعال الإدارة ---- */
  startPlay(cn, n) {
    const c = this.S.centers[cn], t = this.S.teams[n]; if (!c || !t) return;
    if (c.playing) return toast('في فريق عم يلعب بهالمركز.', 'bad');
    if (!alive(t, 'energy')) return toast('أمين الطاقة مقتول عند ' + teamName(n), 'bad');
    const cost = playCost(t, c);
    if (cost.attack && !alive(t, 'attacker')) return toast('المهاجم مقتول عند ' + teamName(n), 'bad');
    if (t.gold < cost.gold || t.res.powder < cost.powder) {
      c.queue = c.queue.filter(x => x !== n); this.saveCenter(cn);
      this.fb(n, false, `انشال دوركم من المركز ${cn}: الرصيد ما بيكفي (${cost.gold} ذهب${cost.powder ? ' و' + cost.powder + ' بارود' : ''}).`); this.saveTeam(n);
      return toast(teamName(n) + ': الرصيد ما بيكفي، انشال من الطابور.', 'bad');
    }
    t.gold -= cost.gold; t.res.powder -= cost.powder; if (cost.free) t.tokens.freeRide--;
    if (cost.toOwner) { this.S.teams[c.owner].gold += cost.toOwner; this.saveTeam(c.owner); }
    c.queue = c.queue.filter(x => x !== n); c.playing = n; c.playStart = now();
    c.paid = { gold: cost.gold, powder: cost.powder, toOwner: cost.toOwner, owner: c.owner, free: cost.free, attack: cost.attack };
    this.fb(n, true, `دوركم! روحوا عالمركز ${cn}. دفعتوا ${cost.gold} ذهب${cost.powder ? ' و' + cost.powder + ' بارود' : ''}.`);
    this.saveTeam(n); this.saveCenter(cn);
    this.log(`${teamName(n)} ${cost.attack ? 'يهاجم' : 'يلعب'} المركز ${cn} الآن.`, cost.attack ? 'kill' : 'info', cost.attack ? [n, c.owner] : [n]);
  },

  cancelPlay(cn) {
    const c = this.S.centers[cn]; if (!c || !c.playing) return;
    const t = this.S.teams[c.playing], p = c.paid || {};
    t.gold += p.gold || 0; t.res.powder += p.powder || 0; if (p.free) t.tokens.freeRide++;
    if (p.toOwner && p.owner) { const o = this.S.teams[p.owner]; o.gold = Math.max(0, o.gold - p.toOwner); this.saveTeam(p.owner); }
    this.fb(t.n, true, `انلغت جولتكم بالمركز ${cn} وانرجعت الكلفة.`); this.saveTeam(t.n);
    this.log(`انلغت جولة ${teamName(t.n)} بالمركز ${cn}.`, 'info', [t.n]);
    c.playing = null; c.paid = null; this.saveCenter(cn);
  },

  record(cn, score, passOverride) {
    const c = this.S.centers[cn], g = this.S.game; if (!c || !c.playing) return;
    const n = c.playing, t = this.S.teams[n];
    const passed = passOverride != null ? passOverride : score >= c.min;
    let msg = '';
    if (passed) {
      t.gold += COST.winGold;
      const own = CENTER_RES[cn - 1];
      const others = shuffle(RES.map(r => r.k).filter(k => k !== own)).slice(0, own === 'gold' ? 3 : 2);
      t.pending = { center: cn, options: own === 'gold' ? others : shuffle([own, ...others]) };
      if (midActive(g)) { t.closeTokens++; msg += ' وكسبتوا قدرة تسكير صورة!'; }
      const canOccupy = !c.owner || (c.owner !== n && score > c.score);
      if (canOccupy) {
        const prev = c.owner;
        c.owner = n; c.score = score; c.shield = false; c.shieldUntil = 0;
        if (prev) this.kill(prev, n, cn);
        this.log(`${teamName(n)} احتل المركز ${cn} بسكور ${score}${prev ? ' وأسقطه من ' + teamName(prev) : ''}.`, 'clear', prev ? [n, prev] : null);
        msg = `فزتوا واحتليتوا المركز ${cn}! خدوا الكود من مسؤول المركز.` + msg;
      } else {
        this.log(`${teamName(n)} تجاوز الحد الأدنى بالمركز ${cn} (سكور ${score}).`, 'info', [n]);
        msg = `تجاوزتوا الحد الأدنى بالمركز ${cn}. خدوا الكود من مسؤول المركز. الاحتلال بدو سكور أعلى من ${c.score}.` + msg;
      }
    } else {
      this.log(`${teamName(n)} ما تجاوز الحد الأدنى بالمركز ${cn}.`, 'info', [n]);
      msg = `ما تجاوزتوا الحد الأدنى بالمركز ${cn}. بتقدروا تحجزوا من جديد.`;
    }
    this.fb(n, passed, msg.trim());
    c.playing = null; c.paid = null;
    this.saveTeam(n); this.saveCenter(cn);
  },

  kill(victimN, byN, cn) {
    const v = this.S.teams[victimN];
    if (v.armed) { v.armed = false; this.log(`المدافع الزمني حمى ${teamName(victimN)} من القتل عند سقوط المركز ${cn}.`, 'shield', [victimN, byN]); this.saveTeam(victimN); return; }
    const names = [...new Set(v.slots.filter(s => s.alive).map(s => s.name))];
    if (!names.length) return;
    const name = pick(names);
    const roles = v.slots.filter(s => s.name === name).map(s => { s.alive = false; return ROLE[s.role].n; });
    this.log(`KILL|${name}|${roles.join('، ')}|${byN}|${cn}`, 'kill', [victimN]);
    this.log(`${teamName(byN)} أسقط المركز ${cn} وقتل ${name} (${roles.join('، ')}) من ${teamName(victimN)}.`, 'info', [byN]);
    this.saveTeam(victimN);
  },

  adj(n, key, delta) {
    const t = this.S.teams[n];
    if (key === 'gold') t.gold = Math.max(0, t.gold + delta);
    else if (key === 'closeTokens') t.closeTokens = Math.max(0, t.closeTokens + delta);
    else if (key === 'freeRide' || key === 'freeShield') t.tokens[key] = Math.max(0, t.tokens[key] + delta);
    else t.res[key] = Math.max(0, t.res[key] + delta);
    this.saveTeam(n);
  },
  toggleAlive(n, i) { const t = this.S.teams[n]; t.slots[i].alive = !t.slots[i].alive; this.saveTeam(n); },
  transferRole(n, i, toName, charge) {
    const t = this.S.teams[n];
    if (charge) { if (t.gold < COST.transferRole) return toast('الرصيد ما بيكفي لنقل الدور.', 'bad'); t.gold -= COST.transferRole; }
    t.slots[i].name = toName; t.slots[i].alive = true;
    this.log(`نقلت الإدارة دور ${ROLE[t.slots[i].role].n} إلى ${toName} في ${teamName(n)}.`, 'info', [n]);
    this.saveTeam(n);
  },
  toggleCleared(n, i) { const t = this.S.teams[n]; t.cleared[i] = !t.cleared[i]; this.saveTeam(n); if (t.cleared.every(Boolean)) this.endGame(n); },
  releaseCenter(cn) { const c = this.S.centers[cn]; c.owner = null; c.score = 0; c.shield = false; c.shieldUntil = 0; this.saveCenter(cn); this.log(`فكّت الإدارة احتلال المركز ${cn}.`, 'info'); },
  removeQueue(cn, n) { const c = this.S.centers[cn]; c.queue = c.queue.filter(x => x !== n); this.saveCenter(cn); this.fb(n, false, `شالت الإدارة حجزكم من المركز ${cn}.`); this.saveTeam(n); },
  clearTrap(cn) { delete this.S.secret.traps[cn]; this.saveSecret(); },
  setMin(cn, v) { this.S.centers[cn].min = Math.max(0, Number(v) || 0); this.saveCenter(cn); },
  setTiming(d, a, b) { const g = this.S.game; g.duration = d; g.midStart = a; g.midEnd = b; this.saveGame(); },
  regenCodes() { for (let n = 1; n <= TEAMS; n++) this.S.secret.codes[n] = Array.from({ length: CENTERS }, () => [code4(), code4()]); this.saveSecret(); },
  regenPins() { for (let n = 1; n <= TEAMS; n++) { this.S.secret.pins[n] = code4(); this.S.teams[n].pinH = hashPin(this.S.secret.pins[n]); this.saveTeam(n); } this.saveSecret(); },
  saveContent(config, answers) { this.persist('fz/config', config); this.S.secret.answers = answers; this.saveSecret(); }
};

/* ---------------- 6. التنبيهات والنوافذ ---------------- */

function toast(msg, kind = '') {
  const el = document.createElement('div'); el.className = 'toast ' + kind; el.textContent = msg;
  $('#toasts').appendChild(el); setTimeout(() => el.remove(), 4800);
}
function modal(html, onMount) {
  const root = $('#modalRoot');
  root.innerHTML = `<div class="modal-back"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
  const back = root.firstElementChild;
  back.addEventListener('click', e => { if (e.target === back || e.target.closest('[data-close]')) closeModal(); });
  onMount && onMount(back.firstElementChild);
}
const closeModal = () => { $('#modalRoot').innerHTML = ''; };
function alarm(html, win = false) {
  $('#alarmRoot').innerHTML = `<div class="alarm ${win ? 'win' : ''}"><div class="a-box">${html}<button class="btn btn-brass" id="alarmOk">تمام</button></div></div>`;
  $('#alarmOk').onclick = () => { $('#alarmRoot').innerHTML = ''; };
}

/* حماية الحقول من إعادة الرسم أثناء الكتابة */
function guard(el, fn) {
  const a = document.activeElement;
  if (a && el.contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) { el.dataset.dirty = '1'; return; }
  el.dataset.dirty = ''; fn();
}
document.addEventListener('focusout', () => setTimeout(() => { if ($$('[data-dirty="1"]').length) rerender(); }, 120));

/* ---------------- 7. الدخول ---------------- */

const SES = { role: null, team: null, pin: null, tab: 'board', atab: 'field', adminTeam: 1, codesCenter: 1, sent: new Set(), seenLog: new Set(), lastFb: null };

function showOnly(id) { ['boot', 'entry', 'teamView', 'adminView'].forEach(x => { $('#' + x).hidden = x !== id; }); }

function renderEntry(isAdmin) {
  showOnly('entry');
  let sel = ls.get('fz-team', null)?.team || null;
  const pick = $('#teamPick');
  pick.innerHTML = Array.from({ length: TEAMS }, (_, i) => `<button type="button" data-n="${i + 1}" style="--tc:${TEAM_COLORS[i]}" class="${sel === i + 1 ? 'on' : ''}">${i + 1}</button>`).join('');
  pick.onclick = e => { const b = e.target.closest('button'); if (!b) return; sel = +b.dataset.n; $$('button', pick).forEach(x => x.classList.toggle('on', x === b)); $('#pinInput').focus(); };
  const err = m => { $('#entryErr').textContent = m; $('#entryErr').hidden = !m; };
  const enter = () => {
    const pin = $('#pinInput').value.trim();
    if (!sel) return err('اختاروا رقم الفريق.');
    const t = V.teams[sel];
    if (!t) return err('اللعبة لسا ما تجهّزت. انتظروا الإدارة.');
    if (hashPin(pin) !== t.pinH) return err('الرقم السري غلط.');
    err(''); ls.set('fz-team', { team: sel, pin });
    SES.role = 'team'; SES.team = sel; SES.pin = pin; startTeam();
  };
  $('#enterBtn').onclick = enter;
  $('#pinInput').onkeydown = e => { if (e.key === 'Enter') enter(); };
  $('#adminBtn').hidden = !isAdmin;
  $('#adminBtn').onclick = () => { if (Store.mode === 'db') { SES.role = 'admin'; ls.set('fz-role', 'admin'); startAdmin(); } else adminLogin(); };
  $('#modeNote').textContent = Store.mode === 'local'
    ? 'ما في اتصال بخادم المزامنة: اللعبة شغالة على هذا الجهاز فقط. تأكدوا من الإنترنت وافتحوا من جديد.'
    : 'متصلين: كل الأجهزة بتلعب نفس اللعبة' + (Store.mode === 'mqtt' ? ' (غرفة ' + ROOM_ID + ').' : '.');
}

function adminLogin() {
  const fresh = !V.secretEnv;
  modal(`
    <h3>${fresh ? 'أنشئوا كلمة سر للإدارة' : 'دخول غرفة العمليات'}</h3>
    <p class="small muted" style="margin:0">${fresh ? 'كلمة السر بتحمي أكواد الصور والأرقام السرية للفرق، وبتنطلب من أي جهاز إدارة. احفظوها، ما في طريقة لاسترجاعها.' : 'اكتبوا كلمة سر الإدارة.'}</p>
    <div class="field"><label for="apw1">كلمة السر</label><input type="password" id="apw1" autocomplete="off"></div>
    ${fresh ? '<div class="field"><label for="apw2">أعيدوا كتابتها</label><input type="password" id="apw2" autocomplete="off"></div>' : ''}
    <p id="apErr" class="small" style="color:var(--bad);margin:0" hidden></p>
    <div class="row"><button class="btn btn-brass" id="apGo">${fresh ? 'أنشئوا وادخلوا' : 'ادخلوا'}</button><button class="btn btn-ghost" data-close>إلغاء</button></div>`, m => {
    const err = t => { $('#apErr', m).textContent = t; $('#apErr', m).hidden = !t; };
    const go = async () => {
      const pw = $('#apw1', m).value;
      if (pw.length < 6) return err('كلمة السر لازم تكون 6 أحرف أو أكتر.');
      $('#apGo', m).disabled = true;
      try {
        if (fresh) {
          if (pw !== $('#apw2', m).value) { $('#apGo', m).disabled = false; return err('الكلمتين مو متطابقتين.'); }
          await Vault.setNew(pw);
        } else {
          V.secret = await Vault.open(V.secretEnv, pw);
        }
      } catch { $('#apGo', m).disabled = false; return err('كلمة السر غلط.'); }
      ls.set('fz-adminpw', pw); ls.set('fz-role', 'admin'); closeModal();
      SES.role = 'admin'; startAdmin();
    };
    $('#apGo', m).onclick = go;
    $$('input', m).forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') go(); }));
    $('#apw1', m).focus();
  });
}

/* مؤشر الاتصال بخادم المزامنة */
function soonStatus() {
  const ok = Store.mode !== 'mqtt' || Store.connected;
  $$('[data-net]').forEach(el => { el.hidden = Store.mode !== 'mqtt'; el.className = 'pill ' + (ok ? 'good' : 'bad'); el.textContent = ok ? 'متصل' : 'انقطع الاتصال'; });
}

/* ---------------- 8. واجهة الفريق ---------------- */

const me = () => V.teams[SES.team];

async function send(type, p = {}) {
  const id = now().toString(36) + rnd(1e6).toString(36);
  SES.sent.add(id);
  try { await Store.set('inbox/' + id, { team: SES.team, pin: SES.pin, type, p, at: now() }); }
  catch { toast('ما وصل الطلب. تأكدوا من الإنترنت وجربوا مرة تانية.', 'bad'); }
}

function startTeam() {
  showOnly('teamView');
  $('#tabbar').onclick = e => { const b = e.target.closest('button'); if (!b) return; SES.tab = b.dataset.tab; renderTeam(); window.scrollTo(0, 0); };
  renderTeam();
}

function renderTeam() {
  const t = me(); if (!t) return;
  if (hashPin(SES.pin) !== t.pinH) { ls.set('fz-team', null); toast('تغيّر الرقم السري. ادخلوا من جديد.', 'bad'); return renderEntry(false); }
  const g = V.game || {};
  $('#app').style.setProperty('--tc', TEAM_COLORS[t.n - 1]);
  $('#tName').innerHTML = `<span class="swatch"></span>${teamName(t.n)}`;
  $('#tGold').textContent = t.gold + ' ذهب';
  $$('#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.tab === SES.tab));
  ['board', 'centers', 'powers', 'team', 'log'].forEach(k => { $('#tab-' + k).hidden = k !== SES.tab; });
  const powerDot = (t.pending || t.riddle || t.closeTokens > 0);
  const pb = $('#tabbar [data-tab="powers"]'); pb.querySelector('.dot')?.remove(); if (powerDot) pb.insertAdjacentHTML('beforeend', '<span class="dot"></span>');
  guard($('#tab-' + SES.tab), () => ({ board: tBoard, centers: tCenters, powers: tPowers, team: tTeam, log: tLog })[SES.tab](t, g));
  tickTeam();
  handleFeedback(t);
  handleLogAlerts(t);
  if (g.status === 'ended' && !SES.endShown) { SES.endShown = true; showEnd(); }
  if (g.status && g.status !== 'ended') SES.endShown = false;
}

function tickTeam() {
  const g = V.game; const t = me(); if (!t) return;
  const st = !g ? '' : g.status === 'setup' ? 'قبل البدء' : g.status === 'paused' ? 'متوقفة' : g.status === 'ended' ? 'انتهت' : mmss(remainMs(g));
  $('#tClock').textContent = st;
  const mid = $('#tMid');
  if (midActive(g)) { mid.hidden = false; mid.innerHTML = `<span>نافذة التسكير مفتوحة: كل فوز بمركز = قدرة تسكير صورة</span><span class="num">${mmss((g.midEnd * 60000) - elapsedMs(g))}</span>`; }
  else mid.hidden = true;
  const lost = Store.mode === 'mqtt' && !Store.connected;
  const off = $('#tOffline');
  off.hidden = !(lost || (g && g.status === 'running' && now() - V.engineBeat > 35000));
  off.textContent = lost ? 'انقطع الاتصال بخادم المزامنة. عم نحاول نرجع تلقائياً، تأكدوا من الإنترنت.' : 'شاشة الإدارة غير متصلة الآن. طلباتكم ستُنفَّذ عند عودتها.';
}

function tBoard(t) {
  const done = clearedCount(t);
  const base = V.base?.data;
  const el = $('#tab-board');
  el.innerHTML = `
    <div class="spread"><h2 class="sec-title">احموا الدير</h2><span class="pill ${done === 10 ? 'good' : 'brass'}">${done} من 10 أحداث مُنعت</span></div>
    <div class="monastery ${done === 10 ? 'complete' : ''}">
      <div class="base ${base ? '' : 'empty'}" ${base ? `style="background-image:url('${base}')"` : ''}>${base ? '' : 'هنا تظهر صورة دير سمعان الحقيقية كلما منعتم حدثاً'}</div>
      <div class="tiles">${t.cleared.map((c, i) => `<button class="tile ${c ? 'cleared' : ''} ${t.needBackup[i] && !c ? 'closed-again' : ''}" data-i="${i}" style="background-image:url('${imgSrc(i)}')" aria-label="الحدث ${i + 1}"><span class="tn">${i + 1}</span></button>`).join('')}</div>
    </div>
    <div class="progress-line"><i style="width:${done * 10}%"></i></div>
    <div class="cleared-strip">${t.cleared.map((c, i) => `<button data-i="${i}" class="${c ? 'done' : ''} ${t.sealed[i] ? 'sealed' : ''}">${i + 1}</button>`).join('')}</div>
    <p class="small muted" style="margin:0">اضغطوا على أي حدث لإدخال كوده أو لقراءة بطاقة الحقيقة بعد منعه. النقطة النحاسية تعني أن الصورة مختومة.</p>`;
  el.onclick = e => { const b = e.target.closest('[data-i]'); if (b) openEvent(+b.dataset.i); };
}

function openEvent(i) {
  const t = me(); const cleared = t.cleared[i];
  const locked = now() < t.lockUntil;
  modal(`
    <div class="spread"><span class="eyebrow">الحدث ${i + 1}</span>${cleared ? '<span class="pill good">مُنع</span>' : t.needBackup[i] ? '<span class="pill bad">مسكّر، بدو الكود الاحتياطي</span>' : '<span class="pill warn">قيد الحدوث</span>'}</div>
    <h3>${esc(title(i))}</h3>
    <img class="ev" src="${imgSrc(i)}" alt="">
    ${cleared ? `
      <div class="fact"><div class="eyebrow">بطاقة الحقيقة</div>${esc(fact(i))}</div>
      ${t.sealed[i] ? '<span class="pill brass">مختومة: ما بتنسكر</span>' : `<button class="btn" id="sealBtn" ${alive(t, 'decoder') && t.res.seals >= COST.seal ? '' : 'disabled'}>اختموا الصورة (${COST.seal} أختام، عندكم ${t.res.seals})</button>`}
    ` : `
      <p class="small muted" style="margin:0">مسؤول المركز ${i + 1} بيعطيكم الكود إذا تجاوزتوا الحد الأدنى. مُفكّك الشفرات بيدخله هون.</p>
      ${alive(t, 'decoder') ? `
        <input id="codeIn" class="code-input" inputmode="numeric" maxlength="4" placeholder="••••" autocomplete="off" ${locked ? 'disabled' : ''}>
        <button class="btn btn-brass" id="codeBtn" ${locked ? 'disabled' : ''}>${locked ? 'مقفول مؤقتاً' : 'فكّ الشفرة'}</button>`
      : '<div class="callout red">مُفكّك الشفرات مقتول. أسعفوه أو اطلبوا من الإدارة نقل الدور.</div>'}
    `}
    <button class="btn btn-ghost" data-close>إغلاق</button>`, m => {
    const go = () => { const v = $('#codeIn', m).value.trim(); if (v.length < 4) return; send('code', { img: i, code: v }); $('#codeBtn', m).disabled = true; $('#codeBtn', m).textContent = 'جارٍ التحقق…'; };
    $('#codeBtn', m)?.addEventListener('click', go);
    $('#codeIn', m)?.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    $('#codeIn', m)?.focus();
    $('#sealBtn', m)?.addEventListener('click', () => { send('seal', { img: i }); closeModal(); });
  });
}

function tCenters(t, g) {
  const el = $('#tab-centers');
  const scouting = t.scout && now() < t.scout.until;
  const reveal = now() < (t.revealUntil || 0);
  const myBusy = Object.values(V.centers).find(c => c.queue.includes(t.n) || c.playing === t.n);
  el.innerHTML = `
    <div class="spread"><h2 class="sec-title">خريطة المراكز</h2>${scouting ? '<span class="pill warn">المنظار شغال</span>' : ''}${reveal ? '<span class="pill brass">السكور مكشوف</span>' : ''}</div>
    ${myBusy ? `<div class="callout">${myBusy.playing === t.n ? `دوركم الآن بالمركز ${myBusy.n}. روحوا العبوا!` : `أنتم بطابور المركز ${myBusy.n}، دوركم ${myBusy.queue.indexOf(t.n) + 1}.`}</div>` : ''}
    <div class="centers">${Array.from({ length: CENTERS }, (_, k) => {
      const c = V.centers[k + 1]; if (!c) return '';
      const cost = playCost(t, c);
      const live = !!c.playing;
      const trap = scouting && t.scout.traps.includes(c.n);
      const inQ = c.queue.includes(t.n);
      let btn;
      if (c.owner === t.n) btn = `<button class="btn btn-sm" data-shield="${c.n}" ${shieldUp(c) || !alive(t, 'engineer') ? 'disabled' : ''}>${shieldUp(c) ? 'مدرّع' : (t.tokens.freeShield ? 'درع مجاني' : `درّعوا (${COST.shieldOn} عدة إصلاح)`)}</button>`;
      else if (inQ) btn = `<button class="btn btn-sm btn-bad" data-cancel="${c.n}">إلغاء الحجز</button>`;
      else btn = `<button class="btn btn-sm ${cost.attack ? 'btn-bad' : 'btn-brass'}" data-book="${c.n}" ${myBusy || g.status !== 'running' ? 'disabled' : ''}>${cost.attack ? 'هجوم' : 'اطلب حجز'} · ${cost.gold} ذهب${cost.powder ? ' + ' + cost.powder + ' بارود' : ''}</button>`;
      return `<article class="center ${live ? 'live' : ''}" style="--oc:${c.owner ? TEAM_COLORS[c.owner - 1] : 'var(--line)'}">
        <div class="c-top"><div><div class="c-num">${c.n}</div><div class="c-ev">${esc(title(c.n - 1))}</div></div><span class="pill">${RES_NAME[CENTER_RES[c.n - 1]]}</span></div>
        <div class="c-meta">${c.owner ? chip(c.owner) : '<span class="pill">فارغ</span>'}${shieldUp(c) ? '<span class="pill brass">درع</span>' : ''}${trap ? '<span class="pill bad">فخ!</span>' : ''}${reveal && c.owner ? `<span class="pill">سكور ${c.score}</span>` : ''}</div>
        <div class="c-status ${live ? 'live' : 'free'}">${live ? `${teamName(c.playing)} يلعب الآن` : 'جاهز للّعب'}${c.queue.length ? ` · بالطابور ${c.queue.length}` : ''}</div>
        <div class="row">${btn}</div>
      </article>`;
    }).join('')}</div>
    <p class="small muted" style="margin:0">الكلفة: آلة الزمن ${COST.ride} ذهب. الهجوم على مركز محتل +${COST.attackGold} ذهب و${COST.attackPowder} بارود، وكسر الدرع +${COST.shieldBreak} ذهب تذهب للمدافع. الكلفة تُخصم لما الإدارة تبدأ جولتكم.</p>`;
  el.onclick = e => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.book) { send('book', { c: +b.dataset.book }); b.disabled = true; }
    if (b.dataset.cancel) send('cancel', { c: +b.dataset.cancel });
    if (b.dataset.shield) send('shield', { c: +b.dataset.shield });
  };
}

function tPowers(t) {
  const el = $('#tab-powers');
  const others = Array.from({ length: TEAMS }, (_, i) => i + 1).filter(x => x !== t.n);
  const teamOpts = others.map(x => `<option value="${x}">${teamName(x)}</option>`).join('');
  const centerOpts = Array.from({ length: CENTERS }, (_, i) => `<option value="${i + 1}">المركز ${i + 1}</option>`).join('');
  const myCleared = t.cleared.map((c, i) => c && !t.sealed[i] ? `<option value="${i}">الحدث ${i + 1}</option>` : '').join('');
  const dead = t.slots.filter(s => !s.alive);
  const deadNames = [...new Set(dead.map(s => s.name))];
  const spyOn = t.spy && now() < t.spy.until;

  const card = (role, body) => {
    const s = t.slots.find(x => x.role === role); const r = ROLE[role];
    return `<div class="power ${s.alive ? '' : 'dead'}"><div class="p-head"><div><div class="p-role">${r.n}</div><div class="p-who">${esc(s.name)}</div></div>
      <div class="row">${r.res !== 'gold' ? `<span class="pill">${RES_NAME[r.res]}: ${t.res[r.res]}</span>` : ''}${s.alive ? '' : '<span class="pill bad">مقتول</span>'}</div></div>
      <p class="p-desc">${r.d}</p>${s.alive && body ? `<div class="p-act">${body}</div>` : ''}</div>`;
  };

  el.innerHTML = `
    <h2 class="sec-title">الخزنة</h2>
    <div class="vault">
      <div class="res gold"><span>ذهب</span><b>${t.gold}</b></div>
      ${RES.map(r => `<div class="res"><b>${t.res[r.k]}</b><span>${r.n}</span></div>`).join('')}
    </div>
    ${(t.tokens.freeRide || t.tokens.freeShield || t.closeTokens || t.armed) ? `<div class="row">
      ${t.tokens.freeRide ? `<span class="pill brass">رحلة مجانية × ${t.tokens.freeRide}</span>` : ''}
      ${t.tokens.freeShield ? `<span class="pill brass">درع مجاني × ${t.tokens.freeShield}</span>` : ''}
      ${t.closeTokens ? `<span class="pill bad">قدرة تسكير × ${t.closeTokens}</span>` : ''}
      ${t.armed ? '<span class="pill good">حماية المدافع مفعّلة</span>' : ''}</div>` : ''}

    ${t.pending ? `<div class="callout"><b>ربحتوا المركز ${t.pending.center}! اختاروا موردًا واحدًا (${COST.winRes} وحدات):</b>
      <div class="choice-row">${t.pending.options.map(k => `<button class="btn btn-brass" data-choose="${k}">${RES_NAME[k]}</button>`).join('')}</div></div>` : ''}

    ${t.closeTokens > 0 ? `<div class="callout red"><b>قدرة التسكير</b><span class="small">رجّعوا صورة أزالها فريق آخر، فيضطر يرجع يلعب مركزها. الحد صورتين لكل فريق، والمختومة ما بتنسكر.</span>
      <div class="p-act"><select id="closeTeam">${teamOpts}</select><select id="closeImg">${Array.from({ length: CENTERS }, (_, i) => `<option value="${i}">الحدث ${i + 1}</option>`).join('')}</select><button class="btn btn-bad" data-act="close">سكّروا</button></div></div>` : ''}

    ${t.riddle ? `<div class="callout"><b>رمز من خريطة المؤرخ</b><div>${esc(t.riddle.q)}</div><span class="small muted">الجائزة: ${REWARDS[t.riddle.reward]}</span>
      <div class="p-act"><input type="text" id="riddleIn" placeholder="الجواب"><button class="btn btn-brass" data-act="answer">جاوبوا</button></div></div>` : ''}

    ${spyOn ? `<div class="callout"><b>تقرير الجاسوس عن ${teamName(t.spy.target)}</b>
      <div class="small">ذهب ${t.spy.gold} · أحداث مُنعت ${t.spy.cleared} · مراكز مدرّعة: ${t.spy.shields.length ? t.spy.shields.join('، ') : 'لا شيء'}</div>
      <div class="small muted">${RES.map(r => `${r.n} ${t.spy.res[r.k]}`).join(' · ')}</div></div>` : ''}

    <h2 class="sec-title">قدرات الأدوار</h2>
    <div class="powers">
      ${card('decoder', '<span class="small muted">إدخال الأكواد والختم من تبويب «الدير».</span>')}
      ${card('energy', '<span class="small muted">الدفع تلقائي عند بدء الجولة.</span>')}
      ${card('attacker', '<span class="small muted">الهجوم من تبويب «المراكز».</span>')}
      ${card('engineer', '<span class="small muted">الدرع من تبويب «المراكز» على مركز تحتلونه.</span>')}
      ${card('defender', `<button class="btn btn-sm" data-act="protect" ${t.armed || t.res.supplies < COST.protect ? 'disabled' : ''}>${t.armed ? 'مفعّلة' : `فعّلوا الحماية (${COST.protect} مؤن)`}</button>`)}
      ${card('medic', deadNames.length ? `<select id="reviveName">${deadNames.map(x => `<option>${esc(x)}</option>`).join('')}</select><button class="btn btn-sm" data-act="revive" ${t.res.meds < COST.revive ? 'disabled' : ''}>أسعفوا (${COST.revive} أدوية)</button>` : '<span class="small muted">ما في حدا مقتول.</span>')}
      ${card('trickster', `<select id="trapC">${centerOpts}</select><button class="btn btn-sm" data-act="trap" ${t.res.tricks < COST.trap ? 'disabled' : ''}>ازرعوا فخ (${COST.trap} حِيَل)</button>`)}
      ${card('spy', `<select id="spyT">${teamOpts}</select><button class="btn btn-sm" data-act="spy" ${t.res.net < COST.spy ? 'disabled' : ''}>تجسسوا (1 إنترنت)</button>`)}
      ${card('explorer', `<button class="btn btn-sm" data-act="scout" ${t.res.scope < COST.scout ? 'disabled' : ''}>اكشفوا الفخاخ (1 منظار)</button>`)}
      ${card('historian', `<button class="btn btn-sm" data-act="map" ${t.res.maps < COST.map || t.riddle ? 'disabled' : ''}>اكشفوا رمزاً (${COST.map} قطع)</button>`)}
    </div>`;
  el.onclick = e => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.choose) return send('choose', { res: b.dataset.choose });
    const a = b.dataset.act; if (!a) return;
    if (a === 'protect' || a === 'scout' || a === 'map') send(a);
    if (a === 'revive') send('revive', { name: $('#reviveName').value });
    if (a === 'trap') send('trap', { c: +$('#trapC').value });
    if (a === 'spy') send('spy', { target: +$('#spyT').value });
    if (a === 'answer') { const v = $('#riddleIn').value.trim(); if (v) send('answer', { text: v }); }
    if (a === 'close') send('close', { target: +$('#closeTeam').value, img: +$('#closeImg').value });
    b.disabled = true;
  };
}

function tTeam(t, g) {
  const el = $('#tab-team');
  const setup = g.status === 'setup';
  el.innerHTML = `
    <div class="spread"><h2 class="sec-title">فرسان الفريق</h2><span class="pill">${t.slots.filter(s => s.alive).length} من 10 أحياء</span></div>
    <p class="small muted" style="margin:0">${setup ? 'اكتبوا اسم صاحب كل دور. إذا الفريق أقل من 10، اكتبوا نفس الاسم لدورين، وإذا انقتل بيتعطّل الدوران.' : 'التشكيلة مقفولة بعد بدء اللعبة. الدور المقتول يتعطّل حتى يُسعَف.'}</p>
    <div class="roster">${t.slots.map((s, i) => `<div class="slot ${s.alive ? '' : 'dead'}">
      <div class="s-role">${ROLE[s.role].n}</div>
      ${setup ? `<input type="text" id="nm${i}" value="${esc(s.name)}" maxlength="24">` : `<div class="s-name">${esc(s.name)}</div>`}
      <span class="pill ${s.alive ? 'good' : 'bad'}">${s.alive ? 'حي' : 'مقتول'}</span></div>`).join('')}</div>
    ${setup ? '<button class="btn btn-brass" id="saveRoster">احفظوا التشكيلة</button>' : ''}`;
  $('#saveRoster')?.addEventListener('click', () => send('roster', { names: t.slots.map((_, i) => $('#nm' + i).value) }));
}

function tLog(t) {
  const items = V.log.filter(x => !x.to || x.to.includes(t.n)).slice(-60).reverse();
  $('#tab-log').innerHTML = `<h2 class="sec-title">سجل الأحداث</h2><div class="log">${items.length ? items.map(logRow).join('') : '<p class="muted">ما في أحداث بعد.</p>'}</div>`;
}
function logRow(x) {
  let txt = x.txt;
  if (txt.startsWith('KILL|')) { const [, name, roles, by, cn] = txt.split('|'); txt = `انقتل ${name} (${roles}) على يد ${teamName(+by)} عند سقوط المركز ${cn}.`; }
  return `<div class="log-item k-${x.k}"><time>${clock(x.at)}</time><div>${esc(txt)}</div></div>`;
}

function handleFeedback(t) {
  const f = t.fb; if (!f || f.id === SES.lastFb) return;
  const first = SES.lastFb === null; SES.lastFb = f.id;
  if (first && now() - f.at > 15000) return;
  if (f.msg.startsWith('CLEAR:')) {
    const i = +f.msg.slice(6); closeModal();
    modal(`<span class="pill good">تم منع الحدث ${i + 1}</span><h3>${esc(title(i))}</h3><div class="fact"><div class="eyebrow">بطاقة الحقيقة</div>${esc(fact(i))}</div><button class="btn btn-brass" data-close>تابعوا</button>`);
    return;
  }
  const cb = $('#codeBtn');
  if (cb) { cb.disabled = now() < t.lockUntil; cb.textContent = cb.disabled ? 'مقفول مؤقتاً' : 'فكّ الشفرة'; const ci = $('#codeIn'); if (ci) { ci.value = ''; ci.disabled = cb.disabled; } }
  toast(f.msg, f.ok ? 'good' : 'bad');
}

function handleLogAlerts(t) {
  const first = !SES.logInit; SES.logInit = true;
  for (const x of V.log) {
    if (SES.seenLog.has(x.id)) continue; SES.seenLog.add(x.id);
    if (first || now() - x.at > 60000) continue;
    if (!(x.to && x.to.includes(t.n))) { if (x.k === 'mid') toast(x.txt, 'bad'); continue; }
    if (x.k === 'kill' && x.txt.startsWith('KILL|')) {
      const [, name, roles, by, cn] = x.txt.split('|');
      alarm(`<h2>سقط المركز ${cn}!</h2><p>${teamName(+by)} احتلّه، وانقتل <b>${esc(name)}</b><br>(${esc(roles)})</p><p class="small">المسعف بيقدر يرجّعه بـ${COST.revive} أدوية.</p>`);
      navigator.vibrate?.([200, 100, 200]);
    } else if (x.k === 'close' || x.k === 'trap' || x.k === 'shield' || x.k === 'kill') toast(x.txt, 'bad');
  }
}

function showEnd() {
  const g = V.game; if (!g || !g.rank) return;
  alarm(`<h2>${teamName(g.winner)} يحمي الدير</h2>
    <div class="table-wrap"><table><thead><tr><th>الترتيب</th><th>الفريق</th><th class="num">أحداث مُنعت</th><th class="num">مراكز</th><th class="num">ذهب</th></tr></thead>
    <tbody>${g.rank.map((r, i) => `<tr><td class="num">${i + 1}</td><td>${chip(r.n)}</td><td class="num">${r.cleared}</td><td class="num">${r.owned}</td><td class="num">${r.gold}</td></tr>`).join('')}</tbody></table></div>`, true);
}

/* ---------------- 9. واجهة الإدارة ---------------- */

function startAdmin() {
  showOnly('adminView');
  $('#aTabs').onclick = e => { const b = e.target.closest('button'); if (!b) return; SES.atab = b.dataset.atab; renderAdmin(); };
  if (!E.started) { E.started = true; E.start(); }
  renderAdmin();
}

const A = (fn) => (...a) => { if (!E.ready()) return toast('هذه الشاشة ليست المحرك الآن.', 'bad'); fn(...a); };

function renderAdmin() {
  if (SES.role !== 'admin') return;
  // المحرك قد يبدأ قبل وصول البيانات: نكمّل من آخر ما وصل
  if (E.on && E.S && ((!E.S.game && V.game) || (!E.S.secret && V.secret))) { E.loadFromView(); setTimeout(() => E.drainInbox(), 0); }
  const g = V.game;
  $$('#aTabs button').forEach(b => b.classList.toggle('on', b.dataset.atab === SES.atab));
  ['field', 'teams', 'alog', 'settings'].forEach(k => { $('#atab-' + k).hidden = k !== SES.atab; });

  $('#aEngine').innerHTML = !E.on
    ? '<div class="engine-warn">شاشة إدارة أخرى تعمل كمحرك للعبة. هذه الشاشة للمتابعة فقط، وستتولى المحرك تلقائياً إذا أُغلقت الأخرى.</div>'
    : !g ? '<div class="callout"><b>ما في لعبة مجهزة بعد.</b><span class="small">جهّزوا لعبة جديدة: بتتولد الأرقام السرية للفرق وأكواد الصور.</span><div><button class="btn btn-brass" id="initBtn">جهّزوا لعبة جديدة</button></div></div>' : '';
  $('#initBtn')?.addEventListener('click', () => { if (E.on) E.newGame(true); });

  // أزرار التحكم بالوقت
  const ctl = $('#aControls');
  if (g) {
    ctl.innerHTML = `<span class="pill ${g.status === 'running' ? 'good' : g.status === 'ended' ? 'bad' : 'warn'}">${{ setup: 'قبل البدء', running: 'شغالة', paused: 'متوقفة', ended: 'انتهت' }[g.status]}</span>
      <span class="clock" id="aClock"></span>${midActive(g) ? '<span class="pill bad">نافذة التسكير</span>' : ''}
      ${g.status === 'setup' ? '<button class="btn btn-brass btn-sm" data-g="start">ابدأ اللعبة</button>' : ''}
      ${g.status === 'running' ? '<button class="btn btn-sm" data-g="pause">إيقاف مؤقت</button>' : ''}
      ${g.status === 'paused' ? '<button class="btn btn-good btn-sm" data-g="resume">استئناف</button>' : ''}
      ${g.status === 'running' || g.status === 'paused' ? '<button class="btn btn-bad btn-sm" data-g="end">إنهاء</button>' : ''}`;
    ctl.onclick = e => {
      const b = e.target.closest('[data-g]'); if (!b) return;
      const k = b.dataset.g;
      if (k === 'end' && !b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'متأكد؟ اضغط للإنهاء'; return; }
      A(() => ({ start: () => E.startGame(), pause: () => E.pause(), resume: () => E.resume(), end: () => E.endGame(null) })[k]())();
    };
  } else ctl.innerHTML = '';
  tickAdmin();
  if (!g) return;

  const sec = $('#atab-' + SES.atab);
  guard(sec, () => ({ field: aField, teams: aTeams, alog: aLog, settings: aSettings })[SES.atab]());
}

function tickAdmin() {
  const g = V.game; const el = $('#aClock'); if (!g || !el) return;
  el.textContent = g.status === 'setup' ? `${g.duration}:00` : mmss(remainMs(g));
}

function aField() {
  const el = $('#atab-field');
  const traps = V.secret?.traps || {};
  el.innerHTML = `<div class="a-centers">${Array.from({ length: CENTERS }, (_, k) => {
    const c = V.centers[k + 1]; if (!c) return '';
    const playT = c.playing && V.teams[c.playing];
    return `<article class="center ${c.playing ? 'live' : ''}" style="--oc:${c.owner ? TEAM_COLORS[c.owner - 1] : 'var(--line)'}">
      <div class="c-top"><div><div class="c-num">${c.n}</div><div class="c-ev">${esc(title(c.n - 1))}</div></div><span class="pill">${RES_NAME[CENTER_RES[c.n - 1]]}</span></div>
      <div class="c-meta">${c.owner ? chip(c.owner) + `<span class="pill">سكور ${c.score}</span>` : '<span class="pill">فارغ</span>'}${shieldUp(c) ? `<span class="pill brass">درع${c.shieldUntil ? ' مجاني' : ''}</span>` : ''}${traps[c.n] ? `<span class="pill bad">فخ ${teamName(traps[c.n])}</span>` : ''}<span class="pill">الحد الأدنى ${c.min}</span></div>
      ${playT ? `<div class="stack" style="gap:6px">
          <div class="c-status live">${teamName(c.playing)} يلعب الآن · ${mmss(now() - c.playStart)}${c.paid?.attack ? ' · هجوم' : ''}</div>
          <div class="score-row"><input type="number" id="sc${c.n}" placeholder="السكور" inputmode="numeric"><button class="btn btn-brass btn-sm" data-rec="${c.n}">سجّل</button></div>
          <div class="row"><button class="btn btn-sm btn-good" data-recpass="${c.n}">نجح (فوق الحد)</button><button class="btn btn-sm" data-recfail="${c.n}">ما نجح</button><button class="btn btn-sm btn-ghost" data-cancelp="${c.n}">إلغاء واسترجاع</button></div>
        </div>` : '<div class="c-status free">جاهز</div>'}
      ${c.queue.length ? `<div class="queue">${c.queue.map((n, i) => `<div class="q"><span>${i + 1}. ${chip(n)}</span><span class="row">${i === 0 && !c.playing ? `<button class="btn btn-brass btn-sm" data-startp="${c.n}:${n}">ابدأ</button>` : ''}<button class="btn btn-sm btn-ghost" data-rmq="${c.n}:${n}" aria-label="شيل">✕</button></span></div>`).join('')}</div>` : '<div class="small muted">الطابور فاضي</div>'}
      <div class="row">${c.owner ? `<button class="btn btn-sm btn-ghost" data-release="${c.n}">فكّ الاحتلال</button>` : ''}${traps[c.n] ? `<button class="btn btn-sm btn-ghost" data-untrap="${c.n}">شيل الفخ</button>` : ''}</div>
    </article>`;
  }).join('')}</div>
  <p class="small muted">«سجّل» يقارن السكور بالحد الأدنى للمركز. «نجح» و«ما نجح» يتجاوزان المقارنة بقرار مسؤول المركز. بعد النجاح أعطوا الفريق الكود من ورقة المركز.</p>`;
  el.onclick = e => {
    const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
    const sc = cn => { const v = $('#sc' + cn).value; return v === '' ? null : Number(v); };
    if (d.rec) { const v = sc(d.rec); if (v == null) return toast('اكتبوا السكور.', 'bad'); A(() => E.record(+d.rec, v, null))(); }
    if (d.recpass) A(() => E.record(+d.recpass, sc(d.recpass) ?? V.centers[d.recpass].min, true))();
    if (d.recfail) A(() => E.record(+d.recfail, sc(d.recfail) ?? 0, false))();
    if (d.cancelp) A(() => E.cancelPlay(+d.cancelp))();
    if (d.startp) { const [cn, n] = d.startp.split(':').map(Number); A(() => E.startPlay(cn, n))(); }
    if (d.rmq) { const [cn, n] = d.rmq.split(':').map(Number); A(() => E.removeQueue(cn, n))(); }
    if (d.release) A(() => E.releaseCenter(+d.release))();
    if (d.untrap) A(() => E.clearTrap(+d.untrap))();
  };
}

function aTeams() {
  const el = $('#atab-teams');
  const n = SES.adminTeam, t = V.teams[n];
  const rows = Object.values(V.teams).map(x => `<tr><td>${chip(x.n)}</td><td class="num">${clearedCount(x)}</td><td class="num">${ownedCount(x.n)}</td><td class="num">${x.gold}</td><td class="num">${x.slots.filter(s => s.alive).length}</td><td class="num">${x.closedCount}/${COST.maxClosed}</td><td class="num">${x.closeTokens}</td><td><button class="btn btn-sm" data-pickt="${x.n}">إدارة</button></td></tr>`).join('');
  const names = t ? [...new Set(t.slots.map(s => s.name))] : [];
  el.innerHTML = `
    <div class="table-wrap"><table><thead><tr><th>الفريق</th><th class="num">أحداث مُنعت</th><th class="num">مراكز</th><th class="num">ذهب</th><th class="num">أحياء</th><th class="num">مسكّر</th><th class="num">تسكير متاح</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    ${t ? `<div class="panel stack">
      <div class="spread"><h2 class="sec-title">${teamName(n)}</h2><span class="small muted">الرقم السري: <b class="num">${V.secret?.pins?.[n] ?? '—'}</b></span></div>
      <div class="edit-grid">
        ${[['gold', 'ذهب', t.gold, 5], ...RES.map(r => [r.k, r.n, t.res[r.k], 1]), ['closeTokens', 'قدرة تسكير', t.closeTokens, 1], ['freeRide', 'رحلة مجانية', t.tokens.freeRide, 1], ['freeShield', 'درع مجاني', t.tokens.freeShield, 1]]
          .map(([k, label, v, st]) => `<div class="stepper"><button class="btn btn-sm" data-adj="${k}:${-st}">−</button><span>${label}</span><b>${v}</b><button class="btn btn-sm" data-adj="${k}:${st}">+</button></div>`).join('')}
      </div>
      <h3 class="sec-title" style="font-size:16px">الأعضاء</h3>
      <div class="roster">${t.slots.map((s, i) => `<div class="slot ${s.alive ? '' : 'dead'}"><div class="s-role">${ROLE[s.role].n}</div><div class="s-name">${esc(s.name)}</div>
        <div class="row"><button class="btn btn-sm" data-life="${i}">${s.alive ? 'اقتل' : 'أحيِ'}</button>${!s.alive ? `<select id="tr${i}">${names.filter(x => x !== s.name).map(x => `<option>${esc(x)}</option>`).join('')}</select><button class="btn btn-sm" data-transfer="${i}">انقل الدور (${COST.transferRole} ذهب)</button>` : ''}</div></div>`).join('')}</div>
      <h3 class="sec-title" style="font-size:16px">الأحداث (تعديل يدوي)</h3>
      <div class="cleared-strip">${t.cleared.map((c, i) => `<button data-clr="${i}" class="${c ? 'done' : ''} ${t.sealed[i] ? 'sealed' : ''}">${i + 1}</button>`).join('')}</div>
      <p class="small muted" style="margin:0">حماية المدافع: ${t.armed ? 'مفعّلة' : 'غير مفعّلة'} · صور مسكّرة: ${t.closedCount} · لغز مفتوح: ${t.riddle ? esc(t.riddle.q) : 'لا'}</p>
    </div>` : ''}`;
  el.onclick = e => {
    const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
    if (d.pickt) { SES.adminTeam = +d.pickt; aTeams(); return; }
    if (d.adj) { const [k, v] = d.adj.split(':'); A(() => E.adj(n, k, +v))(); }
    if (d.life) A(() => E.toggleAlive(n, +d.life))();
    if (d.transfer) { const to = $('#tr' + d.transfer)?.value; if (to) A(() => E.transferRole(n, +d.transfer, to, true))(); }
    if (d.clr) A(() => E.toggleCleared(n, +d.clr))();
  };
}

function aLog() {
  const items = V.log.slice(-120).reverse();
  $('#atab-alog').innerHTML = `<div class="log">${items.map(logRow).join('') || '<p class="muted">ما في أحداث بعد.</p>'}</div>`;
}

function aSettings() {
  const el = $('#atab-settings'); const g = V.game; const s = V.secret; const C = cfg();
  const cn = SES.codesCenter;
  const answers = s?.answers || DEFAULT_ANSWERS;
  el.innerHTML = `<div class="two-col">
    <div class="stack">
      <div class="panel stack">
        <h2 class="sec-title">ورقة أكواد المركز</h2>
        <p class="small muted" style="margin:0">لكل مركز ورقة بـ10 صفوف. الكود الاحتياطي يُعطى فقط لصورة مسكّرة. انسخوها أو صوّروها وأعطوها لمسؤول المركز.</p>
        <div class="row"><select id="codesC" style="width:auto">${Array.from({ length: CENTERS }, (_, i) => `<option value="${i + 1}" ${i + 1 === cn ? 'selected' : ''}>المركز ${i + 1}</option>`).join('')}</select><button class="btn btn-sm" id="copyCodes">نسخ كنص</button></div>
        <div class="table-wrap"><table class="codes"><thead><tr><th>الفريق</th><th>أساسي</th><th>احتياطي</th></tr></thead>
          <tbody>${s ? Array.from({ length: TEAMS }, (_, i) => `<tr><td style="direction:rtl;text-align:start;font-family:inherit;letter-spacing:0">${chip(i + 1)}</td><td>${s.codes[i + 1][cn - 1][0]}</td><td>${s.codes[i + 1][cn - 1][1]}</td></tr>`).join('') : ''}</tbody></table></div>
      </div>
      <div class="panel stack">
        <h2 class="sec-title">الأرقام السرية للفرق</h2>
        <div class="table-wrap"><table class="codes"><tbody>${s ? Array.from({ length: TEAMS }, (_, i) => `<tr><td style="direction:rtl;text-align:start;font-family:inherit;letter-spacing:0">${chip(i + 1)}</td><td>${s.pins[i + 1]}</td></tr>`).join('') : ''}</tbody></table></div>
        <div class="row"><button class="btn btn-sm" data-danger="codes">توليد أكواد صور جديدة</button><button class="btn btn-sm" data-danger="pins">توليد أرقام سرية جديدة</button></div>
      </div>
      <div class="panel stack">
        <h2 class="sec-title">الوقت والحدود</h2>
        <div class="edit-grid">
          <div class="field"><label for="tDur">مدة اللعبة (دقيقة)</label><input type="number" id="tDur" value="${g.duration}"></div>
          <div class="field"><label for="tMs">بداية نافذة التسكير</label><input type="number" id="tMs" value="${g.midStart}"></div>
          <div class="field"><label for="tMe">نهاية نافذة التسكير</label><input type="number" id="tMe" value="${g.midEnd}"></div>
        </div>
        <div class="field"><label>الحد الأدنى لكل مركز</label><div class="edit-grid">${Array.from({ length: CENTERS }, (_, i) => `<div class="field"><label for="mn${i + 1}">المركز ${i + 1}</label><input type="number" id="mn${i + 1}" value="${V.centers[i + 1]?.min ?? 1}"></div>`).join('')}</div></div>
        <button class="btn btn-brass" id="saveTiming">احفظوا الوقت والحدود</button>
      </div>
      <div class="panel stack">
        <h2 class="sec-title">صورة الدير الحقيقية</h2>
        <p class="small muted" style="margin:0">تظهر تحت صور الأحداث على شاشة كل فريق، وتنكشف كاملة لمن يمنع الأحداث العشرة.</p>
        ${V.base?.data ? `<img src="${V.base.data}" alt="" style="border-radius:8px;aspect-ratio:16/10;object-fit:cover;width:100%">` : ''}
        <input type="file" id="baseFile" accept="image/*">
      </div>
      <div class="panel stack">
        <h2 class="sec-title">لعبة جديدة</h2>
        <p class="small muted" style="margin:0">يصفّر الذهب والموارد والمراكز والسجل. الأرقام السرية والأكواد والمحتوى تبقى كما هي.</p>
        <button class="btn btn-bad" data-danger="reset">تصفير وتجهيز لعبة جديدة</button>
      </div>
    </div>
    <div class="stack">
      <div class="panel stack">
        <h2 class="sec-title">الأحداث وبطاقات الحقيقة</h2>
        <p class="small muted" style="margin:0">راجعوا النصوص قبل النشاط. العنوان يظهر على الصورة، والحقيقة تظهر بعد منع الحدث.</p>
        <div class="facts-grid">${Array.from({ length: CENTERS }, (_, i) => `<div class="fact-edit"><div class="n">${i + 1}</div><div class="stack" style="gap:6px"><input type="text" id="ti${i}" value="${esc(C.titles[i])}"><textarea id="fa${i}">${esc(C.facts[i])}</textarea></div></div>`).join('')}</div>
      </div>
      <div class="panel stack">
        <h2 class="sec-title">ألغاز خريطة المؤرخ</h2>
        <p class="small muted" style="margin:0">الأجوبة المقبولة مفصولة بـ | . الأجوبة لا تظهر للفرق.</p>
        <div class="stack" id="riddles">${C.riddles.map((r, i) => `<div class="panel stack" style="background:var(--night)"><input type="text" data-rq="${i}" value="${esc(r.q)}" placeholder="السؤال"><input type="text" data-ra="${i}" value="${esc(answers[i] || '')}" placeholder="الأجوبة"><select data-rr="${i}">${Object.entries(REWARDS).map(([k, v]) => `<option value="${k}" ${r.reward === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>`).join('')}</div>
        <div class="row"><button class="btn btn-sm" id="addRiddle">أضف لغزاً</button></div>
        <button class="btn btn-brass" id="saveContent">احفظوا النصوص والألغاز</button>
      </div>
    </div>
  </div>`;

  $('#codesC').onchange = e => { SES.codesCenter = +e.target.value; aSettings(); };
  $('#copyCodes').onclick = () => {
    const txt = `أكواد المركز ${cn}\n` + Array.from({ length: TEAMS }, (_, i) => `فريق ${i + 1}: ${s.codes[i + 1][cn - 1][0]}  احتياطي ${s.codes[i + 1][cn - 1][1]}`).join('\n');
    navigator.clipboard?.writeText(txt).then(() => toast('انسخت الورقة.', 'good')).catch(() => toast('ما زبط النسخ، صوّروا الجدول.', 'bad'));
  };
  $('#saveTiming').onclick = A(() => {
    const num = (id, d) => { const v = $(id).value.trim(); return v === '' || isNaN(+v) ? d : Math.max(0, +v); };
    const dur = num('#tDur', 120) || 120, ms = num('#tMs', 55), me = num('#tMe', 65);
    if (me <= ms || me > dur) return toast('نهاية نافذة التسكير لازم تكون بعد بدايتها وضمن مدة اللعبة.', 'bad');
    E.setTiming(dur, ms, me);
    for (let c = 1; c <= CENTERS; c++) E.setMin(c, $('#mn' + c).value);
    toast('انحفظ الوقت والحدود.', 'good');
  });
  $('#baseFile').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const img = new Image(); const url = URL.createObjectURL(f);
    img.onload = () => {
      const w = Math.min(900, img.width), h = Math.round(img.height * w / img.width);
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(img, 0, 0, w, h);
      let q = .78, data = cv.toDataURL('image/jpeg', q);
      while (data.length > 140000 && q > .3) { q -= .1; data = cv.toDataURL('image/jpeg', q); }
      URL.revokeObjectURL(url);
      A(() => { E.persist('fz/base', { data }); toast('انرفعت صورة الدير.', 'good'); })();
    };
    img.src = url;
  };
  $('#addRiddle').onclick = () => {
    $('#riddles').insertAdjacentHTML('beforeend', `<div class="panel stack" style="background:var(--night)"><input type="text" data-rq="${$$('[data-rq]').length}" placeholder="السؤال"><input type="text" data-ra="${$$('[data-ra]').length}" placeholder="الأجوبة"><select data-rr="${$$('[data-rr]').length}">${Object.entries(REWARDS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>`);
  };
  $('#saveContent').onclick = A(() => {
    const config = {
      titles: Array.from({ length: CENTERS }, (_, i) => $('#ti' + i).value.trim() || DEFAULT_CONFIG.titles[i]),
      facts: Array.from({ length: CENTERS }, (_, i) => $('#fa' + i).value.trim() || DEFAULT_CONFIG.facts[i]),
      riddles: []
    };
    const ans = [];
    $$('[data-rq]').forEach((q, i) => {
      const qv = q.value.trim(), av = $(`[data-ra="${i}"]`).value.trim();
      if (qv && av) { config.riddles.push({ q: qv, reward: $(`[data-rr="${i}"]`).value }); ans.push(av); }
    });
    E.saveContent(config, ans); toast('انحفظت النصوص والألغاز.', 'good');
  });
  el.querySelectorAll('[data-danger]').forEach(b => b.addEventListener('click', () => {
    if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'متأكدين؟ اضغطوا مرة تانية'; b.classList.add('btn-bad'); return; }
    const k = b.dataset.danger;
    A(() => {
      if (k === 'codes') { E.regenCodes(); toast('تولدت أكواد جديدة. اطبعوا الأوراق من جديد.', 'good'); }
      if (k === 'pins') { E.regenPins(); toast('تولدت أرقام سرية جديدة. الفرق لازم تدخل من جديد.', 'good'); }
      if (k === 'reset') { E.newGame(true); toast('تجهزت لعبة جديدة.', 'good'); }
    })();
  }));
}

/* ---------------- 10. التشغيل ---------------- */

function rerender() { if (SES.role === 'team') renderTeam(); if (SES.role === 'admin') renderAdmin(); }
let rt = null; const soon = () => { clearTimeout(rt); rt = setTimeout(rerender, 60); };

async function boot() {
  await Store.init();
  if (Store.mode === 'local' && window.claude && typeof window.claude.use === 'function') {
    $('#boot').innerHTML = '<div class="panel stack" style="max-width:420px;text-align:center"><h2 class="sec-title">ما في اتصال باللعبة</h2><p style="margin:0">لازم تسجلوا الدخول على حساب Claude، وتكون الصفحة مشارَكة معكم بصلاحية Contributor. اطلبوا هالشي من المنظمين.</p></div>';
    return;
  }
  const isAdmin = await Store.isAdmin();
  let firstData = false;
  const subs = () => {
    Store.doc('fz/game', d => { V.game = d; soon(); });
    Store.doc('fz/config', d => { V.config = d; soon(); });
    Store.doc('fz/base', d => { V.base = d; soon(); });
    Store.doc('fz/log', d => { V.log = d?.items || []; soon(); });
    Store.doc('fz/engine', d => { V.engineBeat = d?.beat || 0; });
    Store.col('teams', docs => { V.teams = {}; docs.forEach(x => { V.teams[x.data.n] = x.data; }); firstData = true; soon(); });
    Store.col('centers', docs => { V.centers = {}; docs.forEach(x => { V.centers[x.data.n] = x.data; }); soon(); });
    if (isAdmin) Store.doc('secret/main', async d => { V.secretEnv = d; V.secret = await Vault.read(d); soon(); });
  };
  subs();
  // انتظار قصير لوصول البيانات قبل عرض الدخول
  await new Promise(r => { const t0 = now(); const iv = setInterval(() => { if (firstData || now() - t0 > 4000) { clearInterval(iv); r(); } }, 100); });
  if (isAdmin) await new Promise(r => setTimeout(r, 600));
  soonStatus();

  const saved = ls.get('fz-team', null);
  let adminOk = ls.get('fz-role', null) === 'admin' && isAdmin;
  if (adminOk && Store.mode !== 'db') {
    const pw = ls.get('fz-adminpw', null);
    try {
      if (!pw) adminOk = false;
      else if (V.secretEnv) V.secret = await Vault.open(V.secretEnv, pw);
      else await Vault.setNew(pw);
    } catch { adminOk = false; ls.set('fz-role', null); }
  }
  if (adminOk) { SES.role = 'admin'; startAdmin(); }
  else if (saved && V.teams[saved.team] && hashPin(saved.pin) === V.teams[saved.team].pinH) { SES.role = 'team'; SES.team = saved.team; SES.pin = saved.pin; startTeam(); }
  else renderEntry(isAdmin);

  setInterval(() => { if (SES.role === 'team') tickTeam(); if (SES.role === 'admin') tickAdmin(); }, 1000);
}

// الخروج: زر «خروج» في رأس واجهة الفريق والإدارة
document.addEventListener('click', e => {
  if (e.target.closest('[data-logout]')) { ls.set('fz-team', null); ls.set('fz-role', null); ls.set('fz-adminpw', null); location.reload(); }
});

boot();
})();
