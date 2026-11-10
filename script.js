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
    Store.col('inbox', docs => { this.inboxP
