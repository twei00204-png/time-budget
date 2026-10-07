(() => {
'use strict';

/* ================= 常量 ================= */
const KEY = 'tb.v1';
const ACCTS = {
  major:  { name: '专业课', emoji: '🧪', color: '--major' },
  cet:    { name: '六级',   emoji: '🇬🇧', color: '--cet' },
  create: { name: '创作',   emoji: '🎨', color: '--create' },
  buffer: { name: '缓冲',   emoji: '🫧', color: '--buffer' },
};
const COURSES = [
  ['imm', '医学免疫学', '免疫'],
  ['bio', '生物化学与分子生物学', '生化'],
  ['ana', '分析化学', '分析'],
  ['org', '有机化学', '有机'],
  ['mic', '医学微生物学', '微生物'],
];
const HOLES = [
  ['short', '抖音/短视频'], ['game', '游戏'], ['ai', '刷 AI 资讯'], ['rest', '躺着/疲劳'],
  ['social', '社交'], ['chores', '杂事'], ['other', '其他'], ['none', '今天没有明显时间黑洞'],
];
const HOLE_NAME = Object.fromEntries(HOLES);
const SCREEN = ['short', 'game', 'ai'];
const DURS = [['<30 min', 15], ['30–60 min', 45], ['1–2 h', 90], ['2–3 h', 150], ['3 h+', 210]];
const STATUS = [['idea', 'Idea'], ['doing', '制作中'], ['done', '完成']];
const WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/* ================= 数据 ================= */
const def = () => ({
  v: 1,
  settings: { budget: { major: 600, cet: 210, create: 240, buffer: 150 }, theme: 'auto' },
  logs: [],            // {id,date,ts,acct,min,course?,kind?}
  holes: {},           // 'YYYY-MM-DD': {type, dur?}
  project: { active: null, parking: ['Live2D', '游戏剪辑', 'AI 漫剧', '吉他视频'] },
  schedule: {},        // 见 README：{"1":[{s,e,c,t}]}，1=周一
  ui: { course: null, kind: null },
  timer: null,         // {acct,start}
});

function sanitize(raw) {
  const d = def();
  if (!raw || typeof raw !== 'object') return d;
  const num = (x, f) => (Number.isFinite(+x) && +x >= 0 ? +x : f);
  if (raw.settings) {
    for (const k of Object.keys(d.settings.budget)) d.settings.budget[k] = num(raw.settings.budget && raw.settings.budget[k], d.settings.budget[k]);
    if (['auto', 'light', 'dark'].includes(raw.settings.theme)) d.settings.theme = raw.settings.theme;
  }
  if (Array.isArray(raw.logs)) {
    d.logs = raw.logs.filter(l => l && /^\d{4}-\d{2}-\d{2}$/.test(l.date) && ACCTS[l.acct] && Number.isFinite(+l.min) && +l.min > 0)
      .map(l => ({ id: String(l.id || uid()), date: l.date, ts: +l.ts || Date.parse(l.date) || 0, acct: l.acct, min: Math.round(+l.min),
        ...(l.course && COURSES.some(c => c[0] === l.course) ? { course: l.course } : {}),
        ...(l.kind === 'input' || l.kind === 'output' ? { kind: l.kind } : {}) }));
  }
  if (raw.holes && typeof raw.holes === 'object') {
    for (const [k, v] of Object.entries(raw.holes)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(k) && v && HOLE_NAME[v.type]) d.holes[k] = { type: v.type, ...(Number.isFinite(+v.dur) && +v.dur > 0 ? { dur: +v.dur } : {}) };
    }
  }
  if (raw.project && typeof raw.project === 'object') {
    const a = raw.project.active;
    if (a && typeof a.title === 'string' && a.title.trim()) d.project.active = { title: a.title.trim().slice(0, 60), status: STATUS.some(s => s[0] === a.status) ? a.status : 'idea' };
    if (Array.isArray(raw.project.parking)) d.project.parking = raw.project.parking.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim().slice(0, 60));
  }
  if (raw.schedule && typeof raw.schedule === 'object') d.schedule = raw.schedule;
  if (raw.ui) {
    if (COURSES.some(c => c[0] === raw.ui.course)) d.ui.course = raw.ui.course;
    if (raw.ui.kind === 'input' || raw.ui.kind === 'output') d.ui.kind = raw.ui.kind;
  }
  if (raw.timer && ACCTS[raw.timer.acct] && Number.isFinite(+raw.timer.start)) d.timer = { acct: raw.timer.acct, start: +raw.timer.start };
  return d;
}

let storageOK = true;
function load() {
  try { return sanitize(JSON.parse(localStorage.getItem(KEY))); }
  catch (e) { storageOK = false; return def(); }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); storageOK = true; }
  catch (e) { storageOK = false; }
}

let S = load();
let tab = 'today';
let weekOffset = 0;
let holeEdit = false;
let holePick = null;

/* ================= 工具 ================= */
const $ = (s) => document.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = (n) => String(n).padStart(2, '0');
const dkey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; };
const weekStart = (d) => addDays(d, -((d.getDay() + 6) % 7));
const daysBetween = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 864e5);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fh = (m) => (m / 60).toFixed(1).replace(/\.0$/, '');
const fmin = (m) => (m < 60 ? `${m} min` : `${fh(m)} h`);
const courseShort = (id) => (COURSES.find((c) => c[0] === id) || [])[2] || '';
const todayKey = () => dkey(new Date());

function totals(a, b) {
  const t = { major: 0, cet: 0, create: 0, buffer: 0, input: 0, output: 0, courses: {} };
  for (const l of S.logs) {
    if (l.date < a || l.date > b) continue;
    t[l.acct] += l.min;
    if (l.acct === 'create') { if (l.kind === 'output') t.output += l.min; else if (l.kind === 'input') t.input += l.min; }
    if (l.acct === 'major' && l.course) t.courses[l.course] = (t.courses[l.course] || 0) + l.min;
  }
  return t;
}
const weekRange = (off) => { const ws = addDays(weekStart(new Date()), off * 7); return [ws, dkey(ws), dkey(addDays(ws, 6))]; };

/* ================= 记录 ================= */
let toastTimer;
function toast(msg, undoFn) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${undoFn ? '<button data-act="undo">撤销</button>' : ''}`;
  el.classList.add('show');
  el._undo = undoFn || null;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 4200);
}

function addLog(acct, min, opt = {}) {
  const kind = opt.kind || S.ui.kind;
  if (acct === 'create' && !kind) {
    toast('先选一下：输入 还是 输出');
    const seg = document.querySelector('.seg'); if (seg) { seg.classList.remove('pulse'); void seg.offsetWidth; seg.classList.add('pulse'); }
    return false;
  }
  const l = { id: uid(), date: todayKey(), ts: Date.now(), acct, min: Math.round(min) };
  if (acct === 'major') { const c = opt.course !== undefined ? opt.course : S.ui.course; if (c) l.course = c; }
  if (acct === 'create') l.kind = kind;
  S.logs.push(l);
  save(); render();
  const tag = acct === 'major' && l.course ? ` · ${courseShort(l.course)}` : acct === 'create' ? ` · ${kind === 'output' ? '输出' : '输入'}` : '';
  toast(`${ACCTS[acct].name}${tag}  +${l.min} min`, () => { S.logs = S.logs.filter((x) => x.id !== l.id); save(); render(); });
  return true;
}

function timerStop() {
  if (!S.timer) return;
  const { acct, start } = S.timer;
  const min = Math.max(1, Math.round((Date.now() - start) / 60000));
  if (acct === 'create' && !S.ui.kind) { toast('先选 输入/输出，再停止计时'); return; }
  S.timer = null; save();
  addLog(acct, min);
}

/* ================= 视图：今天 ================= */
function dayLoad() {
  const arr = S.schedule && S.schedule[String(((new Date().getDay() + 6) % 7) + 1)];
  if (!Array.isArray(arr) || !arr.length) return null;
  const toM = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
  const mins = arr.reduce((s, x) => s + Math.max(0, toM(x.e) - toM(x.s)), 0);
  if (arr.some((x) => x.t === 'lab')) return '🧫 实验日';
  return mins >= 360 ? '📚 满课' : mins >= 180 ? '📖 课程适中' : '🌿 课少';
}

function accountCard(k) {
  const A = ACCTS[k];
  const today = todayKey();
  const m = S.logs.filter((l) => l.date === today && l.acct === k).reduce((s, l) => s + l.min, 0);
  let opts = '';
  if (k === 'major') {
    opts = `<div class="chips">${chip('course', '', '未指定', !S.ui.course)}${COURSES.map((c) => chip('course', c[0], c[2], S.ui.course === c[0])).join('')}</div>`;
  } else if (k === 'create') {
    opts = `<div class="seg"><button class="chip ${S.ui.kind === 'input' ? 'on' : ''}" data-act="kind" data-v="input">📥 输入</button><button class="chip ${S.ui.kind === 'output' ? 'on' : ''}" data-act="kind" data-v="output">📤 输出</button></div>`;
  }
  const running = S.timer && S.timer.acct === k;
  const timerLine = running
    ? `<div class="timerline"><span class="t" data-tick>00:00</span><span class="row"><button class="btn sm ghost" data-act="timer-cancel">放弃</button><button class="btn sm main" data-act="timer-stop">停止并记录</button></span></div>`
    : (!S.timer ? `<div class="timerline"><span></span><button class="btn sm ghost" data-act="timer-start" data-k="${k}">⏱ 开始计时</button></div>` : '');
  const go = k === 'major' || k === 'create' ? `<button class="go" data-act="tab" data-v="${k}" aria-label="打开${A.name}">›</button>` : '';
  return `<section class="card acct" style="--c:var(${A.color})">
    <div class="top"><div class="ico">${A.emoji}</div><div class="name grow">${A.name}</div>${go}</div>
    <div class="big">${m}<small>min 今日实际</small></div>
    ${opts}
    <div class="btns">${[15, 30, 60].map((n) => `<button class="btn add" data-act="add" data-k="${k}" data-m="${n}">+${n}</button>`).join('')}</div>
    ${timerLine}
  </section>`;
}
const chip = (act, v, label, on) => `<button class="chip ${on ? 'on' : ''}" data-act="${act}" data-v="${v}">${label}</button>`;

function barRow(k, min, budget, extra = '') {
  const A = ACCTS[k];
  const p = budget ? Math.min(100, (min / budget) * 100) : 0;
  const over = min > budget ? `<em>已达预算</em>` : '';
  return `<div class="brow" style="--c:var(${A.color})">
    <div class="l"><span>${A.emoji} ${A.name}</span><span>${fh(min)}h / ${fh(budget)}h${over}</span></div>
    <div class="bar"><i style="--p:${p}%"></i></div>${extra}</div>`;
}

function holeCard() {
  const key = todayKey();
  const h = S.holes[key];
  const hour = new Date().getHours();
  if (h && !holeEdit) {
    const d = h.dur ? DURS.find((x) => x[1] === h.dur) : null;
    return `<section class="card flat"><div class="row between"><div><h2>🌙 今天的时间黑洞</h2><div style="font-weight:700;margin-top:4px">${HOLE_NAME[h.type]}${d ? ` · ${d[0]}` : ''}</div></div><button class="btn sm ghost" data-act="hole-edit">修改</button></div></section>`;
  }
  if (!holeEdit && hour < 19) {
    return `<section class="card flat"><button class="btn ghost" style="width:100%" data-act="hole-edit">🌙 记录今天的时间黑洞</button></section>`;
  }
  const types = HOLES.map(([id, name]) => `<button class="chip ${holePick === id ? 'on' : ''}" data-act="hole-type" data-v="${id}">${name}</button>`).join('');
  const dur = holePick && holePick !== 'none'
    ? `<div class="mt small mute">大概多久？（可跳过）</div><div class="chips" style="margin-top:8px">${DURS.map(([n, m]) => `<button class="chip" data-act="hole-dur" data-v="${m}">${n}</button>`).join('')}</div>` : '';
  return `<section class="card"><h2>🌙 今天最大的时间黑洞是什么？</h2><div class="chips">${types}</div>${dur}
    ${holeEdit ? `<div class="mt"><button class="btn sm ghost" data-act="hole-close">先不记</button></div>` : ''}</section>`;
}

function viewToday() {
  const now = new Date();
  const [, a, b] = weekRange(0);
  const t = totals(a, b);
  const bd = S.settings.budget;
  const load = dayLoad();
  const today = todayKey();
  const entries = S.logs.filter((l) => l.date === today).sort((x, y) => y.ts - x.ts);
  const list = entries.length
    ? `<details class="card flat"><summary><span>今天的记录（${entries.length}）</span><span>⌄</span></summary><ul class="list mt">${entries.map((l) => {
        const meta = [ACCTS[l.acct].name, l.course ? courseShort(l.course) : '', l.kind ? (l.kind === 'output' ? '输出' : '输入') : ''].filter(Boolean).join(' · ');
        return `<li><span class="grow">${meta}</span><b>${l.min} min</b><button class="x" data-act="del" data-id="${l.id}" aria-label="删除">×</button></li>`;
      }).join('')}</ul></details>` : '';
  return `
    <div class="row between"><div><h2>${WD[now.getDay()]}</h2><h1>${now.getMonth() + 1}月${now.getDate()}日</h1></div>${load ? `<span class="tag" style="font-size:14px;padding:6px 12px">${load}</span>` : ''}</div>
    <p class="sub">点一下就记好。这是预算，不是 KPI。</p>
    ${!storageOK ? `<div class="card flat small">⚠️ 当前环境无法保存数据（可能是隐私模式）。请用 Safari 普通标签页或“添加到主屏幕”后使用。</div>` : ''}
    ${accountCard('major')}${accountCard('cet')}${accountCard('create')}
    <section class="card"><div class="row between"><h2>本周预算</h2><button class="btn sm ghost" data-act="tab" data-v="week">周复盘</button></div><div class="mt"></div>
      ${barRow('major', t.major, bd.major)}${barRow('cet', t.cet, bd.cet)}${barRow('create', t.create, bd.create)}
      ${barRow('buffer', t.buffer, bd.buffer, `<div class="btns row mt" style="gap:8px"><button class="btn sm ghost" data-act="add" data-k="buffer" data-m="15">缓冲 +15</button><button class="btn sm ghost" data-act="add" data-k="buffer" data-m="30">+30</button></div>`)}
    </section>
    ${holeCard()}${list}`;
}

/* ================= 视图：本周复盘 ================= */
function review(ws) {
  const a = dkey(ws), b = dkey(addDays(ws, 6));
  const t = totals(a, b);
  const bd = S.settings.budget;
  const today = todayKey();
  const elapsed = b < today ? 7 : a > today ? 0 : daysBetween(a, today) + 1;
  const hole = { counts: {}, recorded: 0, noneDays: 0, screenDays: 0, estMin: 0, estN: 0 };
  for (let i = 0; i < 7; i++) {
    const h = S.holes[dkey(addDays(ws, i))];
    if (!h) continue;
    hole.recorded++;
    if (h.type === 'none') hole.noneDays++;
    else { hole.counts[h.type] = (hole.counts[h.type] || 0) + 1; if (SCREEN.includes(h.type)) hole.screenDays++; if (h.dur) { hole.estMin += h.dur; hole.estN++; } }
  }
  const facts = [], infer = [], unknown = [];
  facts.push(`专业课 ${fh(t.major)} / ${fh(bd.major)} h；六级 ${fh(t.cet)} / ${fh(bd.cet)} h；创作 ${fh(t.create)} / ${fh(bd.create)} h；缓冲 ${fh(t.buffer)} / ${fh(bd.buffer)} h。`);
  const io = t.input + t.output;
  if (io > 0) facts.push(`创作中 Input ${fh(t.input)} h，Output ${fh(t.output)} h。本周 ${Math.round((t.input / io) * 100)}% 的创作时间用于输入。`);
  else facts.push('本周还没有记录创作时间。');
  if (hole.recorded) {
    const parts = Object.entries(hole.counts).sort((x, y) => y[1] - x[1]).map(([k, n]) => `${HOLE_NAME[k]} ${n} 天`);
    if (hole.noneDays) parts.push(`没有明显时间黑洞 ${hole.noneDays} 天`);
    facts.push(`已记录 ${hole.recorded} 天的时间黑洞：${parts.join('、')}。`);
    if (hole.estN) facts.push(`其中 ${hole.estN} 次填了时长，合计约 ${fh(hole.estMin)} h（按区间中点粗估）。`);
  } else facts.push('本周还没有记录时间黑洞。');

  const core = t.major + t.cet + t.create;
  const coreBudget = bd.major + bd.cet + bd.create;
  if (hole.recorded < 3) {
    infer.push('时间黑洞记录少于 3 天，暂时不做“时间不足 / 分配问题”的判断。');
  } else if (t.create < bd.create * 0.5 && hole.screenDays >= 3) {
    infer.push(`本周创作时间只有 ${fh(t.create)} 小时，而短视频/游戏/AI 资讯被记录为时间黑洞共 ${hole.screenDays} 天。因此目前没有充分证据说明“学校完全没有给创作留下时间”。`);
  } else if (core >= coreBudget * 0.8 && hole.noneDays >= Math.ceil(hole.recorded / 2)) {
    infer.push(`本周三个账户已投入 ${fh(core)} / ${fh(coreBudget)} h，且 ${hole.noneDays} 天记录为没有明显时间黑洞。当前数据更支持：这一周本身确实比较拥挤。`);
  } else {
    infer.push('当前数据不足以在“时间不足”和“时间分配”之间下结论，两种情况都有可能。');
  }
  if (b >= today) unknown.push('这一周还没结束，结论可能变化。');
  if (elapsed > hole.recorded) unknown.push(`有 ${elapsed - hole.recorded} 天没有记录时间黑洞，这些天的情况未知。`);
  unknown.push('黑洞时长是区间粗估；上课、实验、通勤等时间没有计入。');
  unknown.push('只统计你记录过的时间，没记的部分无法判断。');
  return { facts, infer, unknown, t };
}

function viewWeek() {
  const [ws, a, b] = weekRange(weekOffset);
  const R = review(ws);
  const bd = S.settings.budget, t = R.t;
  const label = `${ws.getMonth() + 1}/${ws.getDate()} – ${addDays(ws, 6).getMonth() + 1}/${addDays(ws, 6).getDate()}`;
  const li = (arr) => arr.map((x) => `<p>${esc(x)}</p>`).join('');
  return `
    <h1>周复盘</h1><p class="sub">只描述数据，不评价你。</p>
    <div class="nav"><button class="btn sm ghost" data-act="week" data-v="-1">‹ 上周</button><b>${weekOffset === 0 ? '本周 ' : ''}${label}</b><button class="btn sm ghost" data-act="week" data-v="1" ${weekOffset >= 0 ? 'disabled' : ''}>下周 ›</button></div>
    <section class="card">${barRow('major', t.major, bd.major)}${barRow('cet', t.cet, bd.cet)}${barRow('create', t.create, bd.create)}${barRow('buffer', t.buffer, bd.buffer)}</section>
    <section class="card review">
      <div class="blk"><span class="tag">事实</span>${li(R.facts)}</div>
      <div class="blk"><span class="tag">推断</span>${li(R.infer)}</div>
      <div class="blk"><span class="tag">未知</span>${li(R.unknown)}</div>
    </section>
    <p class="small mute">你是真的时间不足，还是时间分配出现问题？——上面的“推断”只根据你记录的数据。</p>`;
}

/* ================= 视图：专业课 ================= */
function viewMajor() {
  const [, a, b] = weekRange(0);
  const t = totals(a, b);
  const today = todayKey();
  const last = {};
  for (const l of S.logs) if (l.acct === 'major' && l.course && (!last[l.course] || l.date > last[l.course])) last[l.course] = l.date;
  const max = Math.max(60, ...COURSES.map((c) => t.courses[c[0]] || 0));
  const unassigned = t.major - Object.values(t.courses).reduce((s, x) => s + x, 0);
  const notes = [];
  for (const c of COURSES) {
    if (!last[c[0]]) { if (S.logs.some((l) => l.acct === 'major' && l.course)) notes.push(`${c[2]}还没有记录过课外投入。`); }
    else { const d = daysBetween(last[c[0]], today); if (d >= 7) notes.push(`${c[2]}已经 ${d} 天没有课外投入。`); }
  }
  const rows = COURSES.map(([id, name, short]) => {
    const m = t.courses[id] || 0;
    const ago = last[id] ? daysBetween(last[id], today) : null;
    const when = ago === null ? '还没有记录' : ago === 0 ? '今天碰过' : `${ago} 天前`;
    return `<li style="--c:var(--major);display:block"><div class="row"><div class="grow"><b>${name}</b><div class="small mute">${when}</div></div><b>${fh(m)} h</b><button class="btn sm ghost" data-act="add" data-k="major" data-m="30" data-course="${id}">+30</button></div>
      <div class="bar mt" style="height:10px"><i style="--p:${(m / max) * 100}%"></i></div></li>`;
  }).join('');
  return `
    <h1>🧪 专业课</h1><p class="sub">本周 ${fh(t.major)} / ${fh(S.settings.budget.major)} h · 不预设每门课的时长，按实际变化。</p>
    <section class="card"><ul class="list">${rows}</ul>
      ${unassigned > 0 ? `<p class="small mute mt">另有 ${fh(unassigned)} h 没有指定科目。</p>` : ''}</section>
    ${notes.length ? `<section class="card flat"><h2>小提示</h2>${notes.map((n) => `<p style="margin:8px 0 0">${n}</p>`).join('')}</section>` : ''}`;
}

/* ================= 视图：创作 ================= */
function viewCreate() {
  const [, a, b] = weekRange(0);
  const t = totals(a, b);
  const io = t.input + t.output;
  const p = S.project.active;
  const st = p ? STATUS.find((s) => s[0] === p.status)[1] : '';
  const active = p
    ? `<div class="row between"><b style="font-size:19px">${esc(p.title)}</b><button class="btn sm ghost" data-act="proj-edit">改名</button></div>
       <div class="seg">${STATUS.map(([id, n]) => `<button class="chip ${p.status === id ? 'on' : ''}" style="--c:var(--create)" data-act="proj-status" data-v="${id}">${n}</button>`).join('')}</div>
       ${p.status === 'done' ? `<button class="btn main mt" style="width:100%" data-act="proj-clear">🎉 收起，选下一个项目</button>` : ''}`
    : `<p class="mute" style="margin:0 0 12px">还没有当前项目。同一时间只留 1 个。</p><button class="btn main" style="width:100%" data-act="proj-new">＋ 设定当前项目</button>`;
  const parking = S.project.parking.map((x, i) => `<li><span class="grow">${esc(x)}</span><button class="btn sm ghost" data-act="proj-promote" data-i="${i}">设为当前</button><button class="x" data-act="park-del" data-i="${i}" aria-label="删除">×</button></li>`).join('');
  return `
    <h1>🎨 创作</h1><p class="sub">本周 ${fh(t.create)} / ${fh(S.settings.budget.create)} h</p>
    <section class="card" style="--c:var(--create)"><h2>当前项目 · Active</h2><div class="mt">${active}</div></section>
    <section class="card"><h2>Input / Output（本周）</h2>
      <div class="stat2 mt"><div><span class="small mute">📥 Input</span><b>${fh(t.input)} h</b></div><div><span class="small mute">📤 Output</span><b>${fh(t.output)} h</b></div></div>
      <p class="mt" style="margin-bottom:0">${io ? `本周 ${Math.round((t.input / io) * 100)}% 的创作时间用于输入。` : '本周还没有创作记录。'}</p>
      <p class="small mute" style="margin:6px 0 0">Input＝看教程/刷新工具/看作品/搜资料；Output＝建模/剪辑/生成素材/写脚本/发布。</p></section>
    <section class="card"><h2>停车场 · Parking Lot</h2>
      <ul class="list mt">${parking || '<li class="mute">空的</li>'}</ul>
      <form class="row mt" data-form="park"><input type="text" name="t" placeholder="先停在这里的想法" maxlength="60" autocomplete="off"><button class="btn sm main" type="submit">添加</button></form></section>`;
}

/* ================= 视图：设置 ================= */
function viewMore() {
  const bd = S.settings.budget;
  const th = S.settings.theme;
  return `
    <h1>设置 · 数据</h1><p class="sub">所有数据只保存在这台手机上，没有账号，不上传。</p>
    <section class="card"><h2>每周预算（小时）</h2><div class="mt"></div>
      ${['major', 'cet', 'create', 'buffer'].map((k) => `<div class="field"><label for="b-${k}">${ACCTS[k].emoji} ${ACCTS[k].name}</label><input id="b-${k}" type="number" inputmode="decimal" min="0" step="0.5" value="${fh(bd[k])}" data-budget="${k}"></div>`).join('')}
      <p class="small mute" style="margin:0">合计 ${fh(bd.major + bd.cet + bd.create + bd.buffer)} h / 周。</p></section>
    <section class="card"><h2>外观</h2><div class="seg">${[['auto', '跟随系统'], ['light', '浅色'], ['dark', '深色']].map(([v, n]) => `<button class="chip ${th === v ? 'on' : ''}" data-act="theme" data-v="${v}">${n}</button>`).join('')}</div></section>
    <section class="card"><h2>导出 / 导入</h2>
      <p class="small mute">换手机或想让 ChatGPT 分析一周数据时用。JSON 里带有每周汇总。</p>
      <div class="chips" style="margin-top:0">
        <button class="btn" data-act="export-json">导出 JSON</button>
        <button class="btn" data-act="export-csv">导出 CSV</button>
        <button class="btn" data-act="copy-json">复制 JSON</button>
        <button class="btn" data-act="import">导入 JSON</button>
      </div>
      <input type="file" id="file" accept="application/json,.json" hidden></section>
    <section class="card flat small mute">
      <p style="margin-top:0"><b>提示：</b>iPhone 上 Safari 标签页和“主屏幕 App”的数据是分开存的。请在添加到主屏幕之后，只在主屏幕 App 里记录；并定期导出备份。清除网站数据会清空记录。</p>
      <button class="btn sm ghost" data-act="reset">清空全部数据</button></section>`;
}

/* ================= 渲染 ================= */
const TABS = [['today', '🏠', '今天'], ['week', '📊', '本周'], ['major', '🧪', '专业课'], ['create', '🎨', '创作'], ['more', '⚙️', '设置']];
function render() {
  const views = { today: viewToday, week: viewWeek, major: viewMajor, create: viewCreate, more: viewMore };
  $('#app').innerHTML = views[tab]();
  $('#tabs').innerHTML = `<div class="in">${TABS.map(([id, ic, n]) => `<button class="${tab === id ? 'on' : ''}" data-act="tab" data-v="${id}" aria-label="${n}"><span>${ic}</span>${n}</button>`).join('')}</div>`;
  applyTheme();
  tick();
}
function applyTheme() {
  const th = S.settings.theme;
  if (th === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', th);
}
function tick() {
  if (!S.timer) return;
  const s = Math.floor((Date.now() - S.timer.start) / 1000);
  const txt = `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  document.querySelectorAll('[data-tick]').forEach((el) => (el.textContent = `⏱ ${txt}`));
}
setInterval(tick, 1000);

/* ================= 导入导出 ================= */
function weeklySummary() {
  const weeks = new Set(S.logs.map((l) => dkey(weekStart(parseKey(l.date)))));
  Object.keys(S.holes).forEach((k) => weeks.add(dkey(weekStart(parseKey(k)))));
  return [...weeks].sort().map((w) => {
    const ws = parseKey(w); const t = totals(w, dkey(addDays(ws, 6)));
    const holes = {};
    for (let i = 0; i < 7; i++) { const h = S.holes[dkey(addDays(ws, i))]; if (h) holes[HOLE_NAME[h.type]] = (holes[HOLE_NAME[h.type]] || 0) + 1; }
    return { weekStart: w, minutes: { major: t.major, cet: t.cet, create: t.create, buffer: t.buffer }, createInputMin: t.input, createOutputMin: t.output,
      courseMinutes: Object.fromEntries(Object.entries(t.courses).map(([k, v]) => [COURSES.find((c) => c[0] === k)[1], v])), blackholeDays: holes };
  });
}
function exportObj() {
  return { app: 'time-budget', version: 1, exportedAt: new Date().toISOString(), budgetMinutes: S.settings.budget,
    settings: S.settings, logs: S.logs, holes: S.holes, project: S.project, schedule: S.schedule, ui: S.ui, weeklySummary: weeklySummary() };
}
async function shareOrDownload(text, name, type) {
  const file = new File([text], name, { type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function toCSV() {
  const q = (x) => `"${String(x == null ? '' : x).replace(/"/g, '""')}"`;
  const rows = [['date', 'time', 'account', 'minutes', 'course', 'kind']];
  [...S.logs].sort((a, b) => a.ts - b.ts).forEach((l) => { const d = new Date(l.ts); rows.push([l.date, `${pad(d.getHours())}:${pad(d.getMinutes())}`, ACCTS[l.acct].name, l.min, l.course ? COURSES.find((c) => c[0] === l.course)[1] : '', l.kind || '']); });
  rows.push([]); rows.push(['date', 'blackhole', 'approx_minutes']);
  Object.keys(S.holes).sort().forEach((k) => rows.push([k, HOLE_NAME[S.holes[k].type], S.holes[k].dur || '']));
  return '﻿' + rows.map((r) => r.map(q).join(',')).join('\n');
}

/* ================= 事件 ================= */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act, v = el.dataset.v, k = el.dataset.k;
  switch (act) {
    case 'tab': tab = v; weekOffset = 0; render(); window.scrollTo(0, 0); break;
    case 'add': addLog(k, +el.dataset.m, el.dataset.course ? { course: el.dataset.course } : {}); break;
    case 'course': S.ui.course = v || null; save(); render(); break;
    case 'kind': S.ui.kind = v; save(); render(); break;
    case 'undo': { const t = $('#toast'); if (t._undo) t._undo(); t.classList.remove('show'); break; }
    case 'del': S.logs = S.logs.filter((l) => l.id !== el.dataset.id); save(); render(); break;
    case 'timer-start': S.timer = { acct: k, start: Date.now() }; save(); render(); break;
    case 'timer-stop': timerStop(); break;
    case 'timer-cancel': S.timer = null; save(); render(); break;
    case 'hole-edit': holeEdit = true; holePick = (S.holes[todayKey()] || {}).type || null; render(); break;
    case 'hole-close': holeEdit = false; holePick = null; render(); break;
    case 'hole-type':
      if (v === 'none') { S.holes[todayKey()] = { type: v }; holeEdit = false; holePick = null; save(); render(); toast('已记录'); }
      else { holePick = v; S.holes[todayKey()] = { type: v }; save(); render(); }
      break;
    case 'hole-dur': S.holes[todayKey()] = { type: holePick || S.holes[todayKey()].type, dur: +v }; holeEdit = false; holePick = null; save(); render(); toast('已记录'); break;
    case 'week': weekOffset = Math.min(0, weekOffset + +v); render(); break;
    case 'proj-new': { const t = (prompt('当前创作项目叫什么？') || '').trim(); if (t) { S.project.active = { title: t.slice(0, 60), status: 'idea' }; save(); render(); } break; }
    case 'proj-edit': { const t = (prompt('项目名称', S.project.active.title) || '').trim(); if (t) { S.project.active.title = t.slice(0, 60); save(); render(); } break; }
    case 'proj-status': S.project.active.status = v; save(); render(); break;
    case 'proj-clear': S.project.active = null; save(); render(); break;
    case 'proj-promote': {
      const i = +el.dataset.i; const name = S.project.parking[i]; const cur = S.project.active;
      if (cur && !confirm(`当前项目「${cur.title}」会被放回停车场，换成「${name}」？`)) break;
      S.project.parking.splice(i, 1);
      if (cur && cur.status !== 'done') S.project.parking.unshift(cur.title);
      S.project.active = { title: name, status: 'idea' }; save(); render(); break;
    }
    case 'park-del': S.project.parking.splice(+el.dataset.i, 1); save(); render(); break;
    case 'theme': S.settings.theme = v; save(); render(); break;
    case 'export-json': shareOrDownload(JSON.stringify(exportObj(), null, 2), `time-budget-${todayKey()}.json`, 'application/json'); break;
    case 'export-csv': shareOrDownload(toCSV(), `time-budget-${todayKey()}.csv`, 'text/csv'); break;
    case 'copy-json': (navigator.clipboard ? navigator.clipboard.writeText(JSON.stringify(exportObj(), null, 2)).then(() => toast('已复制')).catch(() => toast('复制失败，请用导出')) : toast('此环境不支持复制，请用导出')); break;
    case 'import': $('#file').click(); break;
    case 'reset': if (confirm('确定清空全部记录？建议先导出备份。') && confirm('再确认一次：清空后无法恢复。')) { S = def(); save(); render(); toast('已清空'); } break;
  }
});

document.addEventListener('submit', (e) => {
  const f = e.target.closest('[data-form="park"]');
  if (!f) return;
  e.preventDefault();
  const t = f.t.value.trim();
  if (!t) return;
  S.project.parking.push(t.slice(0, 60)); save(); render();
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset && el.dataset.budget) {
    const h = parseFloat(el.value);
    if (Number.isFinite(h) && h >= 0) { S.settings.budget[el.dataset.budget] = Math.round(h * 60); save(); render(); }
  }
  if (el.id === 'file' && el.files && el.files[0]) {
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const obj = JSON.parse(rd.result);
        if (!obj || !Array.isArray(obj.logs)) throw new Error('bad');
        const n = sanitize(obj);
        if (!confirm(`导入 ${n.logs.length} 条记录、${Object.keys(n.holes).length} 天黑洞？这会覆盖当前数据。`)) return;
        S = n; S.timer = null; save(); render(); toast('导入完成');
      } catch (err) { toast('这个文件看起来不是本应用导出的 JSON'); }
    };
    rd.readAsText(el.files[0]); el.value = '';
  }
});

document.addEventListener('visibilitychange', () => { if (!document.hidden) { S = load(); render(); } });

/* ================= 启动 ================= */
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
render();
})();
