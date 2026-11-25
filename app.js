import * as store from './store.js';

// ═════════════════════════ Utilidades ═════════════════════════
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eurFmt = (() => {
  // useGrouping 'always' → "8.964,90 €" (en es-ES, por defecto, 4 cifras salen sin punto)
  try { return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', useGrouping: 'always' }); }
  catch { return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }); }
})();
const money = (n) => eurFmt.format(Math.abs(n) < 0.005 ? 0 : n || 0);
const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + eurFmt.format(Math.abs(n));
const pct = (n) => (n > 0 ? '+' : '') + n.toLocaleString('es-ES', { maximumFractionDigits: 2 }) + ' %';
const round2 = (n) => Math.round(n * 100) / 100;
const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => toISO(new Date());
const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
const fmtDate = (s) => (s ? parseISO(s).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const fmtShort = (s) => (s ? parseISO(s).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '');
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const monthLabel = (y, m) => cap(new Date(y, m, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }));
const monthKey = (y, m) => `${y}-${String(m + 1).padStart(2, '0')}`;
const endOfMonth = (y, m) => toISO(new Date(y, m + 1, 0));

/** Acepta "1234,56", "1.234,56", "1234.56" */
function parseAmount(s) {
  s = String(s ?? '').trim().replace(/\s|€/g, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  return Number(s);
}
const amountInput = (n) => (n === undefined || n === null || n === '' ? '' : (Number.isInteger(+n) ? String(+n) : (+n).toFixed(2)).replace('.', ','));

function addPeriod(dateStr, freq, anchorDay) {
  const d = parseISO(dateStr);
  if (freq === 'weekly') { d.setDate(d.getDate() + 7); return toISO(d); }
  const months = freq === 'quarterly' ? 3 : freq === 'yearly' ? 12 : 1;
  let y = d.getFullYear(), m = d.getMonth() + months;
  y += Math.floor(m / 12); m %= 12;
  const last = new Date(y, m + 1, 0).getDate();
  return toISO(new Date(y, m, Math.min(anchorDay || d.getDate(), last)));
}

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}

// ═════════════════════════ Catálogos ═════════════════════════
const KINDS = {
  corriente: { label: 'Cuenta corriente', plural: 'Cuentas corrientes', icon: '🏦', available: true },
  ahorro: { label: 'Ahorro', plural: 'Ahorro', icon: '🐷', available: true },
  deposito: { label: 'Depósito', plural: 'Depósitos', icon: '🔒', available: false },
  inversion: { label: 'Inversión', plural: 'Inversión', icon: '📈', available: false },
  robo: { label: 'Cartera automatizada', plural: 'Carteras automatizadas (robo-advisors)', icon: '🤖', available: false },
  pension: { label: 'Plan de pensiones', plural: 'Planes de pensiones', icon: '🏛️', available: false },
  efectivo: { label: 'Efectivo', plural: 'Efectivo', icon: '💶', available: true },
  otro: { label: 'Otro', plural: 'Otros', icon: '📁', available: true },
};
const TYPES = {
  expense: { label: 'Gasto', icon: '🧾' },
  income: { label: 'Ingreso', icon: '💰' },
  transfer: { label: 'Traspaso', icon: '🔁' },
  yield: { label: 'Rendimiento', icon: '✨' },
  set: { label: 'Actualizar saldo', icon: '🎯' },
};
const EXPENSE_CATS = ['Vivienda', 'Suministros', 'Alimentación', 'Transporte', 'Salud', 'Seguros', 'Suscripciones', 'Ocio', 'Compras', 'Impuestos', 'Otros'];
const EXTERNAL_CAT = 'Desde otra cuenta mía';
const INCOME_CATS = ['Nómina', 'Ingreso extra', 'Aportación empresa', 'Devoluciones', EXTERNAL_CAT, 'Otros'];
const FREQS = { weekly: 'Semanal', monthly: 'Mensual', quarterly: 'Trimestral', yearly: 'Anual' };
const INVEST_KINDS = ['inversion', 'robo', 'pension'];
const VAL_FREQS = { monthly: { label: 'Cada mes', days: 31 }, quarterly: { label: 'Cada trimestre', days: 92 }, semiannual: { label: 'Cada semestre', days: 183 }, yearly: { label: 'Cada año', days: 366 } };
const valFreq = (a) => VAL_FREQS[a.valuationFreq] || VAL_FREQS.quarterly;
const PENSION_LIMITS = { individual: 1500, empleo: 10000 }; // límites anuales deducibles vigentes en 2026
const isInvest = (a) => INVEST_KINDS.includes(a.kind);
const showGain = (a) => isInvest(a) || a.kind === 'deposito';
const RISK_LABEL = (r) => (r <= 3 ? 'conservador' : r <= 6 ? 'moderado' : 'dinámico');

// ═════════════════════════ Estado ═════════════════════════
let S = store.getState();
let nav = { tab: 'home' };
let summaryMonth = (() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; })();
let showArchived = false;

const acc = (id) => S.accounts.find((a) => a.id === id);
const accName = (id) => acc(id)?.name || '(cuenta borrada)';
const accountsSorted = (includeArchived = false) => S.accounts
  .filter((a) => includeArchived || !a.archived)
  .sort((a, b) => Object.keys(KINDS).indexOf(a.kind) - Object.keys(KINDS).indexOf(b.kind) || a.name.localeCompare(b.name, 'es'));

/** El saldo inicial de una cuenta ya incluye lo ocurrido antes de su fecha: esos movimientos no se vuelven a sumar en ESA cuenta. */
function applies(accountId, date) {
  const a = S.accounts.find((x) => x.id === accountId);
  return !!a && (!a.initialDate || date >= a.initialDate);
}

function sortedMovements() {
  return [...S.movements].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt || 0) - (b.createdAt || 0)));
}

/** Saldo, capital aportado y ganancia por cuenta (opcionalmente hasta una fecha). */
function computeBalances(until = null) {
  const res = {};
  for (const a of S.accounts) {
    const before = until && a.initialDate && a.initialDate > until;
    const b = before ? 0 : +a.initialBalance || 0;
    const hasContrib = a.initialContributed !== undefined && a.initialContributed !== null && a.initialContributed !== '';
    res[a.id] = { balance: b, contributed: before ? 0 : hasContrib ? +a.initialContributed : b };
  }
  for (const m of sortedMovements()) {
    if (until && m.date > until) break;
    const amt = +m.amount || 0;
    const A = applies(m.accountId, m.date) ? res[m.accountId] : null;
    const B = m.toAccountId && applies(m.toAccountId, m.date) ? res[m.toAccountId] : null;
    switch (m.type) {
      case 'income': if (A) { A.balance += amt; A.contributed += amt; } break;
      case 'expense': if (A) { A.balance -= amt; A.contributed -= amt; } break;
      case 'transfer':
        if (A) { A.balance -= amt; A.contributed -= amt; }
        if (B) { B.balance += amt; B.contributed += amt; }
        break;
      case 'yield': if (A) A.balance += amt; break;
      case 'set': if (A) A.balance = amt; break;
    }
  }
  for (const a of S.accounts) {
    const r = res[a.id];
    r.balance = round2(r.balance); r.contributed = round2(r.contributed);
    r.gain = round2(r.balance - r.contributed);
    // En carteras automatizadas el % se calcula como la entidad: sobre lo invertido, sin contar el efectivo
    const ci = a.kind === 'robo' ? cashInfo(a, r.balance) : null;
    r.cash = ci ? ci.cash : 0;
    r.pctBase = round2(r.contributed - r.cash);
    r.gainPct = r.pctBase > 0 ? (r.gain / r.pctBase) * 100 : null;
  }
  return res;
}

function totals(bal) {
  let total = 0, avail = 0;
  for (const a of S.accounts) { const b = bal[a.id]?.balance || 0; total += b; if (a.available) avail += b; }
  return { total: round2(total), avail: round2(avail), locked: round2(total - avail) };
}

function monthStats(y, m) {
  const k = monthKey(y, m);
  const r = { income: 0, fixed: 0, extra: 0, yields: 0, byCat: {} };
  for (const mv of S.movements) {
    if (!mv.date?.startsWith(k)) continue;
    const amt = +mv.amount || 0;
    if (mv.type === 'income') { if (mv.category !== EXTERNAL_CAT) r.income += amt; } // dinero propio de otra cuenta: no es ingreso
    else if (mv.type === 'yield') r.yields += amt;
    else if (mv.type === 'expense') {
      if (mv.fixed) r.fixed += amt; else r.extra += amt;
      const c = mv.category || 'Otros'; r.byCat[c] = (r.byCat[c] || 0) + amt;
    }
  }
  r.expenses = r.fixed + r.extra;
  r.saved = r.income - r.expenses;
  r.rate = r.income > 0 && r.saved / r.income >= -1 ? (r.saved / r.income) * 100 : null; // sin sentido si los gastos superan el doble de los ingresos
  return r;
}

const pendingRecurring = () => S.recurring
  .filter((r) => r.active !== false && r.nextDate && r.nextDate <= today())
  .sort((a, b) => (a.nextDate < b.nextDate ? -1 : 1));

function valueReminders() {
  const t = today();
  return S.accounts.filter((a) => isInvest(a) && !a.archived)
    .map((a) => ({ a, last: lastValueUpdate(a) }))
    .filter((x) => !x.last || daysBetween(x.last, t) > valFreq(x.a).days);
}

function depositAlerts(bal) {
  const t = today();
  return S.accounts
    .filter((a) => a.kind === 'deposito' && !a.archived && a.maturityDate)
    .map((a) => ({ a, days: daysBetween(t, a.maturityDate), bal: bal[a.id]?.balance || 0 }))
    .filter((x) => x.days <= 30)
    .sort((x, y) => x.days - y.days);
}

function estimatedInterest(a, principal) {
  if (!a.tae || !a.maturityDate) return 0;
  const start = a.startDate || a.initialDate || today();
  const days = Math.max(0, daysBetween(start, a.maturityDate));
  return round2(principal * (+a.tae / 100) * (days / 365));
}

// ═════════════════════════ Render principal ═════════════════════════
function render() {
  const view = $('#view');
  $$('#tabbar [data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === nav.tab));
  if (!store.isReady()) { view.innerHTML = '<div class="loading">Cargando…</div>'; return; }
  let title = 'Mis Finanzas', back = false, html = '';
  if (nav.tab === 'home') html = viewHome();
  else if (nav.tab === 'accounts' && nav.accountId) { const a = acc(nav.accountId); if (!a) { nav = { tab: 'accounts' }; return render(); } title = a.name; back = true; html = viewAccount(a); }
  else if (nav.tab === 'accounts') { title = 'Cuentas'; html = viewAccounts(); }
  else if (nav.tab === 'summary') { title = 'Resumen'; html = viewSummary(); }
  else if (nav.tab === 'more' && nav.sub === 'recurring') { title = 'Fijos y automáticos'; back = true; html = viewRecurring(); }
  else if (nav.tab === 'more' && nav.sub === 'movements') { title = 'Todos los movimientos'; back = true; html = viewAllMovements(); }
  else if (nav.tab === 'more') { title = 'Más'; html = viewMore(); }
  $('#title').innerHTML = (back ? '<button class="back" data-action="back" aria-label="Volver">‹</button>' : '') + esc(title);
  view.innerHTML = html;
  bindCharts();
}

// ─── Inicio ───
const KIND_SVG = {
  corriente: '<path d="M3 21h18M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 10l9-6 9 6z"/>',
  ahorro: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
  deposito: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  inversion: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
  robo: '<rect x="5" y="8" width="14" height="11" rx="2"/><path d="M12 4v4M9 13h.01M15 13h.01M9 16h6"/>',
  pension: '<path d="M3 12a9 9 0 0 1 18 0zM12 12v7a2 2 0 0 0 4 0"/>',
  efectivo: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
  otro: '<path d="M4 6h5l2 2h9v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/>',
};
const kindIcon = (k) => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${KIND_SVG[k] || KIND_SVG.otro}</svg>`;

function accountTile(a, b, flag) {
  let sub = a.available ? 'Disponible' : 'Inmovilizado';
  if (a.kind === 'deposito' && a.maturityDate) sub = `Vence ${fmtDate(a.maturityDate)}`;
  else if (showGain(a) && b.gain !== 0) sub = `<span class="${b.gain >= 0 ? 'up' : 'down'}">${signed(b.gain)}${b.gainPct !== null ? ` (${pct(b.gainPct)})` : ''}</span>`;
  return `<button class="tile k-${a.kind}" data-action="open-account" data-id="${a.id}">
    ${flag ? `<span class="tflag">${esc(flag)}</span>` : ''}${kindIcon(a.kind)}<span class="tn">${esc(a.name)}</span><span class="tv">${money(b.balance)}</span><span class="ts">${sub}</span></button>`;
}

function viewHome() {
  if (!S.accounts.length) {
    return `<div class="card empty"><div class="big-emoji">👋</div>
      <h3>Bienvenido</h3><p>Empieza creando tus cuentas: la de la nómina, ahorro, depósitos, inversión…<br>Con el saldo que tengan hoy.</p>
      <button class="btn" data-action="new-account">Crear mi primera cuenta</button></div>`;
  }
  const bal = computeBalances(), t = totals(bal);
  const pend = pendingRecurring(), alerts = depositAlerts(bal), reminders = valueReminders(), pensions = pensionAlerts();

  let h = `<section class="card hero">
    <div class="label">Patrimonio total</div>
    <div class="big">${money(t.total)}</div>
    <div class="split">
      <div><div class="k">Disponible</div><div class="v">${money(t.avail)}</div></div>
      <div><div class="k">Inmovilizado</div><div class="v">${money(t.locked)}</div></div>
    </div></section>`;

  if (pend.length) {
    h += `<section class="card"><h2>Pendientes de confirmar (${pend.length})</h2>
      ${pend.map((r) => `<div class="pending">
        <div class="row-icon">${TYPES[r.type].icon}</div>
        <div class="grow"><div class="row-title">${esc(r.name)}</div>
        <div class="row-sub">${fmtShort(r.nextDate)} · ${esc(r.type === 'transfer' ? `${accName(r.accountId)} → ${accName(r.toAccountId)}` : accName(r.accountId))}</div></div>
        <div class="row-amt ${r.type === 'income' ? 'pos' : ''}">${money(+r.amount)}</div>
        <button class="btn small" data-action="rec-confirm" data-id="${r.id}" title="Confirmar">✓</button>
        <button class="btn small secondary" data-action="rec-edit-confirm" data-id="${r.id}" title="Cambiar importe">✎</button>
      </div>`).join('')}
      <div class="btn-row" style="margin-top:8px"><button class="link" data-action="rec-skip-all">Saltar todos</button></div></section>`;
  }

  // Los avisos se muestran como etiqueta pequeña en el recuadro de cada cuenta
  const flags = {};
  for (const { a, days } of alerts) flags[a.id] = days < 0 ? 'Vencido' : days === 0 ? 'Vence hoy' : `Vence en ${days} días`;
  for (const { a } of reminders) flags[a.id] = 'Toca valorar';
  h += `<div class="tiles">${accountsSorted().map((a) => accountTile(a, bal[a.id], flags[a.id])).join('')}
</div>
    <div class="add-row"><button class="btn secondary" data-action="new-account">+ Nueva cuenta</button></div>`;
  return h;
}

function movRow(m, ctxAccountId = null) {
  const T = TYPES[m.type] || TYPES.expense;
  let title, sub, cls = '', amt;
  const a = +m.amount || 0;
  switch (m.type) {
    case 'expense': title = m.note || m.category || 'Gasto'; sub = `${m.category || ''}${m.fixed ? ' · fijo' : ''}`; cls = 'neg'; amt = signed(-a); break;
    case 'income': title = m.note || m.category || 'Ingreso'; sub = m.category || ''; cls = 'pos'; amt = signed(a); break;
    case 'transfer':
      title = m.note || 'Traspaso'; sub = `${accName(m.accountId)} → ${accName(m.toAccountId)}`;
      // Dentro de una cuenta, se indica claramente de dónde viene o hacia dónde va
      if (ctxAccountId === m.toAccountId) { cls = 'pos'; amt = signed(a); sub = `Desde ${accName(m.accountId)}`; }
      else if (ctxAccountId === m.accountId) { cls = 'neg'; amt = signed(-a); sub = `Hacia ${accName(m.toAccountId)}`; }
      else amt = money(a);
      break;
    case 'yield': title = m.note || 'Rendimiento'; sub = 'Intereses / rentabilidad'; cls = 'pos'; amt = signed(a); break;
    case 'set': title = m.note || 'Saldo actualizado'; sub = 'Actualización de saldo'; amt = `= ${money(a)}`; break;
  }
  const where = ctxAccountId || m.type === 'transfer' ? '' : ` · ${accName(m.accountId)}`;
  let badge = '';
  if (ctxAccountId && !applies(ctxAccountId, m.date)) { cls = 'muted'; badge = ' <span class="badge" title="Anterior al saldo inicial de esta cuenta: no cambia su saldo">histórico</span>'; }
  return `<li class="row" data-action="edit-mov" data-id="${m.id}">
    <div class="row-icon">${T.icon}</div>
    <div class="row-main"><div class="row-title">${esc(title)}${badge}</div><div class="row-sub">${fmtShort(m.date)}${sub ? ' · ' + esc(sub) : ''}${esc(where)}</div></div>
    <div class="row-amt ${cls}">${amt}</div></li>`;
}

// ─── Cuentas ───
function viewAccounts() {
  const bal = computeBalances(), t = totals(bal);
  const list = accountsSorted(showArchived);
  if (!list.length) return `<div class="card empty"><p>No tienes cuentas todavía.</p><button class="btn" data-action="new-account">Nueva cuenta</button></div>`;
  let h = `<section class="card hero"><div class="split">
    <div><div class="k">Total</div><div class="v">${money(t.total)}</div></div>
    <div><div class="k">Disponible</div><div class="v">${money(t.avail)}</div></div></div></section>`;
  for (const kind of Object.keys(KINDS)) {
    const group = list.filter((a) => a.kind === kind);
    if (!group.length) continue;
    const sum = group.reduce((s, a) => s + (bal[a.id]?.balance || 0), 0);
    h += `<div class="group-title"><span>${KINDS[kind].plural}</span><span>${money(sum)}</span></div><section class="card"><ul class="list">`;
    for (const a of group) {
      const b = bal[a.id];
      let sub = a.available ? 'Disponible' : 'Inmovilizado';
      if (a.kind === 'deposito' && a.maturityDate) sub = `Vence ${fmtDate(a.maturityDate)}${a.tae ? ` · ${String(a.tae).replace('.', ',')}% TAE` : ''}`;
      if (a.kind === 'pension') sub = [a.entity, a.pensionType === 'empleo' ? 'de empleo' : 'individual', `${money(contributedInYear(a.id, new Date().getFullYear()))} aportados este año`].filter(Boolean).join(' · ');
      if (a.kind === 'robo') sub = [a.entity, a.risk ? `perfil ${a.risk}/10` : '', a.feePct ? `${amountInput(a.feePct)}% com.` : ''].filter(Boolean).join(' · ') || 'Inmovilizado';
      if (a.archived) sub = 'Archivada';
      const g = showGain(a) && b.gain !== 0 ? `<small class="${b.gain >= 0 ? 'pos' : 'neg'}">${signed(b.gain)}${b.gainPct !== null ? ` (${pct(b.gainPct)})` : ''}</small>` : '';
      h += `<li class="row" data-action="open-account" data-id="${a.id}"><div class="row-icon">${KINDS[a.kind]?.icon || '📁'}</div>
        <div class="row-main"><div class="row-title">${esc(a.name)}</div><div class="row-sub">${esc(sub)}</div></div>
        <div class="row-amt">${money(b.balance)}${g}</div></li>`;
    }
    h += '</ul></section>';
  }
  const archivedCount = S.accounts.filter((a) => a.archived).length;
  h += `<div class="btn-row" style="justify-content:space-between;margin:6px 2px 16px">
    <button class="btn" data-action="new-account">+ Nueva cuenta</button>
    ${archivedCount ? `<button class="btn ghost" data-action="toggle-archived">${showArchived ? 'Ocultar' : 'Ver'} archivadas (${archivedCount})</button>` : ''}</div>`;
  return h;
}

function viewAccount(a) {
  const bal = computeBalances(), b = bal[a.id];
  const movs = sortedMovements().filter((m) => m.accountId === a.id || m.toAccountId === a.id).reverse();
  const vi = isInvest(a) ? valuationInfo(a) : null;
  let h = `<section class="card hero"><div class="label">${esc(KINDS[a.kind]?.label || '')} · ${a.available ? 'Disponible' : 'Inmovilizado'}${a.archived ? ' · Archivada' : ''}${vi && vi.since ? ' · <strong>valor estimado</strong>' : ''}</div>
    <div class="big">${money(b.balance)}</div>
    ${vi && vi.since ? `<p class="hint" style="margin:-6px 0 12px">Última valoración ${money(vi.lastValue)} (${fmtShort(vi.lastDate)}) + ${money(vi.since)} aportados desde entonces.</p>` : ''}`;
  if (showGain(a)) {
    h += `<div class="split">
      <div><div class="k">Capital aportado</div><div class="v">${money(b.contributed)}</div></div>
      <div><div class="k">Ganancia</div><div class="v ${b.gain >= 0 ? 'pos' : 'neg'}">${signed(b.gain)}${b.gainPct !== null ? `<br><small>${pct(b.gainPct)}</small>` : ''}</div></div></div>`;
  }
  if (isInvest(a)) {
    const ids = new Set([a.id]), tir = annualReturn(ids);
    h += `<div class="split" style="margin-top:10px">
      <div><div class="k">Rentabilidad anual (TIR)</div><div class="v ${tir === null ? '' : tir >= 0 ? 'pos' : 'neg'}">${tir === null ? '—' : pct(tir)}</div></div>
      <div><div class="k">Próxima valoración</div><div class="v">${vi.next ? (vi.next <= today() ? '<span class="neg">Ya toca</span>' : fmtShort(vi.next)) : '—'}</div></div></div>
      <p class="hint" style="margin:8px 0 0">La ganancia solo cambia cuando actualizas el valor (${valFreq(a).label.toLowerCase()}); las aportaciones de en medio suman al capital, no a la ganancia. ${tir === null ? 'La TIR aparece con al menos 3 meses de historial.' : 'La TIR tiene en cuenta cuándo hiciste cada aportación.'}</p>`;
  }
  h += '</section>';
  if (a.kind === 'robo' || a.kind === 'pension') {
    const fee = a.feePct ? round2(b.balance * a.feePct / 100) : null;
    const eq = a.equityPct !== null && a.equityPct !== undefined && a.equityPct !== '' ? +a.equityPct : null;
    const ci = a.kind === 'robo' ? cashInfo(a, b.balance) : null;
    h += `<section class="card"><h2>Cartera</h2><div class="stats">
      <div><div class="k">Entidad</div><div class="v">${esc(a.entity || '—')}</div></div>
      <div><div class="k">${a.kind === 'pension' ? 'Tipo de plan' : 'Perfil de riesgo'}</div><div class="v">${a.kind === 'pension' ? (a.pensionType === 'empleo' ? 'De empleo' : 'Individual') : a.risk ? `${a.risk}/10 <small class="muted">${RISK_LABEL(a.risk)}</small>` : '—'}</div></div>
      <div><div class="k">Comisión anual</div><div class="v">${a.feePct ? amountInput(a.feePct) + ' %' : '—'}</div></div></div>
      ${fee !== null ? `<p class="hint" style="margin:10px 0 0">Al valor actual, las comisiones suponen unos <strong>${money(fee)} al año</strong> (${money(fee / 12)} al mes).</p>` : ''}
      ${ci ? `<div class="split" style="margin-top:12px">
        <div><div class="k">Fondos (valor actual)</div><div class="v">${money(b.balance - ci.cash)}</div></div>
        <div><div class="k">Efectivo sin invertir${ci.real ? '' : ' (estimado)'}</div><div class="v">${money(ci.cash)}</div></div></div>
        <p class="hint" style="margin:8px 0 0">${ci.real ? `Según tu última valoración (${fmtShort(ci.date)}).` : `Estimado con la regla de tu cartera: ${a.cashFixed ? money(+a.cashFixed) : ''}${a.cashFixed && a.cashPct ? ' + ' : ''}${a.cashPct ? amountInput(a.cashPct) + ' % del valor' : ''}. Al actualizar el valor puedes indicar el efectivo real.`}</p>` : ''}
      ${eq !== null ? `<div class="catbar" style="margin-top:14px"><div class="top"><span>Renta variable ${eq}%${ci ? ` · ${money((b.balance - ci.cash) * eq / 100)}` : ''}</span><span>Renta fija ${100 - eq}%${ci ? ` · ${money((b.balance - ci.cash) * (100 - eq) / 100)}` : ''}</span></div>
        <div class="track"><div class="fill" style="width:${eq}%"></div></div></div>${ci ? '<p class="hint" style="margin:4px 0 0">Reparto sobre la parte invertida.</p>' : ''}` : ''}</section>`;
  }
  if (a.kind === 'pension') {
    const y = new Date().getFullYear(), done = contributedInYear(a.id, y), limit = pensionLimit(a);
    h += `<section class="card"><h2>Aportaciones ${y}</h2>
      <div class="catbar"><div class="top"><span>${money(done)} de ${money(limit)}</span><span class="muted">${Math.min(100, Math.round((done / limit) * 100))}%</span></div>
      <div class="track"><div class="fill" style="width:${Math.min(100, (done / limit) * 100)}%"></div></div></div>
      <p class="hint" style="margin:8px 0 0">${done >= limit ? 'Has llegado al límite deducible de este año.' : `Puedes aportar ${money(limit - done)} más este año y reducirlos de tu base imponible del IRPF.`}
      Límite general: 1.500 € al año entre todos tus planes individuales; hasta 10.000 € con un plan de empleo de tu empresa. La aportación de la empresa regístrala como <em>Ingreso → Aportación empresa</em> en esta cuenta.</p>
      <div class="btn-row" style="margin-top:10px"><button class="btn small secondary" data-action="new-mov-pension" data-id="${a.id}">Hacer aportación</button></div></section>`;
  }
  if (a.kind === 'inversion' || a.kind === 'robo') {
    const y = new Date().getFullYear();
    const n = S.movements.filter((m) => (m.type === 'transfer' && m.toAccountId === a.id) || (m.type === 'income' && m.accountId === a.id)).length;
    h += `<section class="card"><h2>Aportaciones</h2><div class="stats">
      <div><div class="k">Este año</div><div class="v">${money(contributedInYear(a.id, y))}</div></div>
      <div><div class="k">Total aportado</div><div class="v">${money(b.contributed)}</div></div>
      <div><div class="k">Nº aportaciones</div><div class="v">${n}</div></div></div></section>`;
  }
  if (isInvest(a)) h += `<section class="card"><h2>Evolución</h2>${chartValueVsContributed('chart-acc', investSeries(new Set([a.id])))}</section>`;
  if (a.kind === 'deposito') {
    const days = a.maturityDate ? daysBetween(today(), a.maturityDate) : null;
    const est = estimatedInterest(a, b.contributed > 0 ? b.contributed : b.balance);
    h += `<section class="card"><h2>Depósito</h2><div class="stats">
      <div><div class="k">TAE</div><div class="v">${a.tae ? String(a.tae).replace('.', ',') + ' %' : '—'}</div></div>
      <div><div class="k">Vencimiento</div><div class="v">${a.maturityDate ? fmtShort(a.maturityDate) : '—'}</div></div>
      <div><div class="k">${days !== null && days < 0 ? 'Vencido' : 'Quedan'}</div><div class="v">${days === null ? '—' : Math.abs(days) + ' días'}</div></div></div>
      ${est ? `<p class="hint" style="margin:10px 0 0">Intereses brutos estimados al vencimiento: <strong>${money(est)}</strong> (antes de la retención de IRPF).</p>` : ''}
      ${a.maturityDate && !a.archived ? `<div class="btn-row" style="margin-top:10px"><button class="btn small secondary" data-action="maturity" data-id="${a.id}">Gestionar vencimiento</button></div>` : ''}</section>`;
  }
  h += `<div class="btn-row" style="margin:0 0 12px">
    ${isInvest(a) ? `<button class="btn" data-action="new-contribution" data-id="${a.id}">+ Aportación</button>` : `<button class="btn" data-action="new-mov-account" data-id="${a.id}">+ Movimiento</button>`}
    <button class="btn secondary" data-action="set-balance" data-id="${a.id}">${isInvest(a) ? 'Actualizar valor' : 'Ajustar saldo'}</button>
    <button class="btn ghost" data-action="edit-account" data-id="${a.id}">Editar</button></div>`;
  h += flowsCard(a);
  const recs = S.recurring.filter((r) => r.accountId === a.id || r.toAccountId === a.id);
  if (recs.length) h += `<section class="card"><h2>Fijos y automáticos</h2><ul class="list">${recs.map(recRow).join('')}</ul></section>`;
  h += `<section class="card"><h2>Movimientos</h2>${movs.length ? `<ul class="list">${movs.slice(0, nav.showAll ? undefined : 25).map((m) => movRow(m, a.id)).join('')}</ul>${!nav.showAll && movs.length > 25 ? `<button class="link" data-action="show-all-acc" style="margin-top:8px">Ver los ${movs.length} movimientos</button>` : ''}` : '<div class="empty">Sin movimientos todavía.</div>'}
    <p class="hint" style="margin:10px 0 0">Saldo inicial: ${money(+a.initialBalance || 0)}${a.initialDate ? ` el ${fmtDate(a.initialDate)}` : ''}${movs.some((m) => !applies(a.id, m.date)) ? '. Los marcados como <span class="badge">histórico</span> son anteriores a esa fecha: ya están incluidos en el saldo inicial y no lo cambian.' : ''}</p></section>`;
  return h;
}

// ─── Resumen mensual de aportaciones / traspasos (botones de Inicio) ───
const isSavingsAcc = (a) => !!a && (INVEST_KINDS.includes(a.kind) || a.kind === 'deposito');
/** kind 'contrib': dinero que entra en inversiones/depósitos desde cuentas normales. 'moves': el resto de traspasos. */
function monthTransfers(y, m, kind) {
  const k = monthKey(y, m);
  return S.movements.filter((mv) => {
    if (mv.type !== 'transfer' || !mv.date?.startsWith(k)) return false;
    const isContrib = isSavingsAcc(acc(mv.toAccountId)) && !isSavingsAcc(acc(mv.accountId));
    return kind === 'contrib' ? isContrib : !isContrib;
  }).sort((a, b) => (a.date < b.date ? 1 : -1));
}
let flowSheet = null;
function openFlowSheet() {
  const { k, y, m } = flowSheet;
  const list = monthTransfers(y, m, k);
  const total = list.reduce((x, mv) => x + (+mv.amount || 0), 0);
  const groups = {};
  for (const mv of list) {
    const key = k === 'contrib' ? mv.toAccountId : `${mv.accountId}>${mv.toAccountId}`;
    (groups[key] ||= { total: 0, items: [] });
    groups[key].total += +mv.amount || 0; groups[key].items.push(mv);
  }
  const body = Object.entries(groups).sort((a, b) => b[1].total - a[1].total).map(([key, g]) => {
    const [from, to] = k === 'contrib' ? [null, key] : key.split('>');
    const title = k === 'contrib' ? accName(to) : `${accName(from)} → ${accName(to)}`;
    const icon = KINDS[acc(to)?.kind]?.icon || '📁';
    return `<div class="fs-group"><div class="row" style="cursor:default"><div class="row-icon">${icon}</div>
        <div class="row-main"><div class="row-title">${esc(title)}</div><div class="row-sub">${g.items.length} ${k === 'contrib' ? (g.items.length === 1 ? 'aportación' : 'aportaciones') : (g.items.length === 1 ? 'traspaso' : 'traspasos')}</div></div>
        <div class="row-amt">${money(g.total)}</div></div>
      <ul class="fs-items">${g.items.map((mv) => `<li><span>${fmtShort(mv.date)}${k === 'contrib' ? ` · desde ${esc(accName(mv.accountId))}` : ''}${mv.note ? ` · ${esc(mv.note)}` : ''}</span><span>${money(+mv.amount)}</span></li>`).join('')}</ul></div>`;
  }).join('');
  openSheet(k === 'contrib' ? 'Aportaciones' : 'Traspasos', `
    <div class="month-nav"><button data-action="fs-prev" aria-label="Mes anterior">‹</button><strong>${monthLabel(y, m)}</strong><button data-action="fs-next" aria-label="Mes siguiente">›</button></div>
    <div class="card" style="background:var(--bg);box-shadow:none"><div class="k muted" style="font-size:13px">${k === 'contrib' ? 'Total aportado a inversiones y depósitos' : 'Total movido entre tus cuentas'}</div>
      <div style="font-size:26px;font-weight:700">${money(total)}</div></div>
    ${body || `<div class="empty">${k === 'contrib' ? 'No hay aportaciones' : 'No hay traspasos'} en este mes.</div>`}
    <p class="hint" style="margin-top:10px">${k === 'contrib' ? 'Cuenta el dinero que pasa de tus cuentas normales a carteras, ETFs, planes de pensiones y depósitos.' : 'Cuenta los traspasos entre tus cuentas normales y lo que vuelve de inversiones o depósitos.'}</p>`);
}

// ─── Entradas y salidas por traspasos de una cuenta ───
let flowPeriod = 'all';
function flowsCard(a) {
  const all = S.movements.filter((m) => m.type === 'transfer' && (m.accountId === a.id || m.toAccountId === a.id));
  if (!all.length) return '';
  const y = String(new Date().getFullYear()), mk = today().slice(0, 7);
  const inPeriod = (m) => flowPeriod === 'all' || (flowPeriod === 'year' ? m.date.startsWith(y) : m.date.startsWith(mk));
  const movs = all.filter(inPeriod);
  const group = (list, key) => {
    const g = {};
    for (const m of list) { const id = m[key]; (g[id] ||= { total: 0, n: 0 }); g[id].total += +m.amount || 0; g[id].n++; }
    return Object.entries(g).sort((x, z) => z[1].total - x[1].total);
  };
  const ins = group(movs.filter((m) => m.toAccountId === a.id), 'accountId');
  const outs = group(movs.filter((m) => m.accountId === a.id), 'toAccountId');
  const sum = (arr) => arr.reduce((s2, [, v]) => s2 + v.total, 0);
  const rows = (arr, sign) => arr.map(([id, v]) => `<li class="row" data-action="open-account" data-id="${id}"><div class="row-icon">${KINDS[acc(id)?.kind]?.icon || '📁'}</div>
      <div class="row-main"><div class="row-title">${esc(accName(id))}</div><div class="row-sub">${v.n} ${v.n === 1 ? 'traspaso' : 'traspasos'}</div></div>
      <div class="row-amt ${sign > 0 ? 'pos' : 'neg'}">${signed(sign * v.total)}</div></li>`).join('');
  const tIn = sum(ins), tOut = sum(outs);
  const chip = (k, l) => `<button type="button" class="${flowPeriod === k ? 'on' : ''}" data-action="flow-period" data-p="${k}">${l}</button>`;
  return `<section class="card"><h2>Traspasos</h2>
    <div class="seg" style="margin-bottom:10px">${chip('all', 'Todo')}${chip('year', 'Este año')}${chip('month', 'Este mes')}</div>
    <div class="stats"><div><div class="k">Entradas</div><div class="v pos">${money(tIn)}</div></div>
      <div><div class="k">Salidas</div><div class="v neg">${money(tOut)}</div></div>
      <div><div class="k">Neto</div><div class="v">${signed(tIn - tOut)}</div></div></div>
    ${ins.length ? `<div class="group-title" style="margin:14px 0 2px"><span>Recibido de</span></div><ul class="list">${rows(ins, 1)}</ul>` : ''}
    ${outs.length ? `<div class="group-title" style="margin:14px 0 2px"><span>Enviado a</span></div><ul class="list">${rows(outs, -1)}</ul>` : ''}
    ${!ins.length && !outs.length ? '<div class="empty">Sin traspasos en este periodo.</div>' : ''}
    <p class="hint" style="margin:8px 0 0">Incluye todo el historial de traspasos que hayas apuntado, también los anteriores al saldo inicial.</p></section>`;
}

// ─── Resumen ───
function viewSummary() {
  const { y, m } = summaryMonth;
  const ms = monthStats(y, m);
  const cats = Object.entries(ms.byCat).sort((a, b) => b[1] - a[1]);
  const max = cats.length ? cats[0][1] : 1;
  let h = `<div class="month-nav"><button data-action="month-prev" aria-label="Mes anterior">‹</button><strong>${monthLabel(y, m)}</strong><button data-action="month-next" aria-label="Mes siguiente">›</button></div>
    <section class="card"><div class="stats">
      <div><div class="k">Ingresos</div><div class="v pos">${money(ms.income)}</div></div>
      <div><div class="k">Gastos</div><div class="v neg">${money(ms.expenses)}</div></div>
      <div><div class="k">Ahorro</div><div class="v">${money(ms.saved)}</div></div>
    </div>
    <div class="stats" style="margin-top:12px">
      <div><div class="k">Gastos fijos</div><div class="v">${money(ms.fixed)}</div></div>
      <div><div class="k">Gastos extra</div><div class="v">${money(ms.extra)}</div></div>
      <div><div class="k">Tasa de ahorro</div><div class="v">${ms.rate === null ? '—' : Math.round(ms.rate) + ' %'}</div></div>
    </div>
    ${ms.yields ? `<p class="hint" style="margin:12px 0 0">Rendimientos cobrados este mes: <strong class="pos">${money(ms.yields)}</strong></p>` : ''}</section>
    <section class="card"><h2>Gastos por categoría</h2>
    ${cats.length ? cats.map(([c, v]) => `<div class="catbar"><div class="top"><span>${esc(c)}</span><span>${money(v)} <span class="muted">${Math.round((v / ms.expenses) * 100)}%</span></span></div>
      <div class="track"><div class="fill" style="width:${Math.max(2, (v / max) * 100)}%"></div></div></div>`).join('') : '<div class="empty">Sin gastos este mes.</div>'}</section>`;
  h += `<section class="card"><h2>Evolución del patrimonio</h2>${chartPatrimonio()}</section>`;
  h += viewInvestOverview();
  return h;
}

function patrimonioSeries() {
  const now = new Date(); const pts = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear(), m = d.getMonth();
    const until = i === 0 ? today() : endOfMonth(y, m);
    const t = totals(computeBalances(until));
    pts.push({ label: d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', ''), full: monthLabel(y, m), v: t.total });
  }
  // Descarta los meses anteriores a la primera cuenta
  const first = S.accounts.reduce((min, a) => (a.initialDate && a.initialDate < min ? a.initialDate : min), today());
  const firstKey = first.slice(0, 7);
  return pts.filter((p, idx) => { const d = new Date(now.getFullYear(), now.getMonth() - (11 - idx), 1); return monthKey(d.getFullYear(), d.getMonth()) >= firstKey; });
}

// ─── Gráficos (SVG propio, sin librerías) ───
const CHARTS = {};
const niceCeil = (v) => { if (v <= 0) return 0; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; };
const shortNum = (v) => (Math.abs(v) >= 1000 ? (v / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + 'k' : String(Math.round(v)));
const CW = 340, CH = 170, PL = 44, PB = 22, PT = 8;

function chartPatrimonio() {
  const pts = patrimonioSeries();
  if (!pts.length || !S.accounts.length) return '<div class="empty">Aún no hay datos.</div>';
  const maxV = Math.max(...pts.map((p) => p.v), 0), minV = Math.min(...pts.map((p) => p.v), 0);
  const top = niceCeil(maxV) || 1, bottom = minV < 0 ? -niceCeil(-minV) : 0;
  const yS = (v) => PT + (CH - PT - PB) * (1 - (v - bottom) / (top - bottom));
  const n = pts.length, slot = (CW - PL) / n, bw = Math.min(22, slot * 0.6);
  let svg = `<svg viewBox="0 0 ${CW} ${CH}" role="img" aria-label="Patrimonio total a fin de cada mes">`;
  const ticks = bottom < 0 ? [bottom, 0, top] : [0, top / 2, top];
  for (const tv of ticks) svg += `<line class="grid" x1="${PL}" x2="${CW}" y1="${yS(tv)}" y2="${yS(tv)}"/><text class="axis" x="${PL - 6}" y="${yS(tv) + 4}" text-anchor="end">${shortNum(tv)}</text>`;
  const step = n > 6 ? 2 : 1;
  pts.forEach((p, i) => {
    const x = PL + slot * i + (slot - bw) / 2;
    const y0 = yS(0), y1 = yS(p.v);
    const yTop = Math.min(y0, y1), h = Math.max(1, Math.abs(y1 - y0));
    const r = Math.min(4, h, bw / 2);
    const path = p.v >= 0
      ? `M${x},${y0} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + bw - r} Q${x + bw},${yTop} ${x + bw},${yTop + r} V${y0} Z`
      : `M${x},${y0} V${yTop + h - r} Q${x},${yTop + h} ${x + r},${yTop + h} H${x + bw - r} Q${x + bw},${yTop + h} ${x + bw},${yTop + h - r} V${y0} Z`;
    svg += `<path class="bar" data-i="${i}" d="${path}"/>`;
    svg += `<rect class="hit" data-i="${i}" data-x="${x + bw / 2}" x="${PL + slot * i}" y="${PT}" width="${slot}" height="${CH - PT - PB}"/>`;
    if (i % step === (n - 1) % step) svg += `<text class="axis" x="${x + bw / 2}" y="${CH - 6}" text-anchor="middle">${esc(p.label)}</text>`;
  });
  svg += '</svg>';
  CHARTS['chart-pat'] = { type: 'bar', pts, tip: (p) => `${esc(p.full)}<br><strong>${money(p.v)}</strong>` };
  const table = `<details><summary>Ver como tabla</summary><table class="data">${pts.map((p) => `<tr><td>${esc(p.full)}</td><td>${money(p.v)}</td></tr>`).join('')}</table></details>`;
  return `<div class="chart" data-chart="chart-pat">${svg}<div class="tip" hidden></div></div>${table}`;
}

/** Línea de valor (azul) frente a capital aportado (gris discontinua). pts: [{label, full, v, c}] */
function chartValueVsContributed(id, pts) {
  if (pts.length < 2) return '<div class="empty">El gráfico aparecerá cuando haya al menos dos meses de datos.</div>';
  const maxV = Math.max(...pts.flatMap((p) => [p.v, p.c]), 0);
  const top = niceCeil(maxV) || 1;
  const yS = (v) => PT + (CH - PT - PB) * (1 - v / top);
  const n = pts.length, xS = (i) => PL + 6 + ((CW - PL - 12) * i) / (n - 1);
  const line = (key) => pts.map((p, i) => `${i ? 'L' : 'M'}${xS(i).toFixed(1)},${yS(Math.max(0, p[key])).toFixed(1)}`).join(' ');
  let svg = `<svg viewBox="0 0 ${CW} ${CH}" role="img" aria-label="Valor de la inversión frente al capital aportado">`;
  for (const tv of [0, top / 2, top]) svg += `<line class="grid" x1="${PL}" x2="${CW}" y1="${yS(tv)}" y2="${yS(tv)}"/><text class="axis" x="${PL - 6}" y="${yS(tv) + 4}" text-anchor="end">${shortNum(tv)}</text>`;
  svg += `<line class="xh" x1="0" x2="0" y1="${PT}" y2="${CH - PB}" visibility="hidden"/>`;
  svg += `<path class="ln-c" d="${line('c')}"/><path class="ln-v" d="${line('v')}"/>`;
  const last = pts[n - 1];
  svg += `<circle class="dot" cx="${xS(n - 1)}" cy="${yS(Math.max(0, last.v))}" r="4"/>`;
  svg += `<circle class="dot hov" cx="0" cy="0" r="4" visibility="hidden"/>`;
  const every = Math.ceil(n / 6);
  pts.forEach((p, i) => {
    const w = (CW - PL) / n;
    svg += `<rect class="hit" data-i="${i}" data-x="${xS(i)}" data-y="${yS(Math.max(0, p.v))}" x="${xS(i) - w / 2}" y="${PT}" width="${w}" height="${CH - PT - PB}"/>`;
    if ((n - 1 - i) % every === 0) svg += `<text class="axis" x="${xS(i)}" y="${CH - 6}" text-anchor="middle">${esc(p.label)}</text>`;
  });
  svg += '</svg>';
  CHARTS[id] = { type: 'line', pts, tip: (p) => `${esc(p.full)}<br>Valor: <strong>${money(p.v)}</strong><br>Aportado: ${money(p.c)}<br>Ganancia: ${signed(p.v - p.c)}` };
  const legend = '<div class="legend"><span><i class="lg-v"></i>Valor</span><span><i class="lg-c"></i>Capital aportado</span></div>';
  const table = `<details><summary>Ver como tabla</summary><table class="data"><tr><td></td><td>Valor</td><td>Aportado</td></tr>${pts.map((p) => `<tr><td>${esc(p.full)}</td><td>${money(p.v)}</td><td>${money(p.c)}</td></tr>`).join('')}</table></details>`;
  return `${legend}<div class="chart" data-chart="${id}">${svg}<div class="tip" hidden></div></div>${table}`;
}

function bindCharts() {
  $$('.chart[data-chart]').forEach((box) => {
    const cfg = CHARTS[box.dataset.chart]; if (!cfg) return;
    const tip = $('.tip', box), svg = $('svg', box);
    const show = (hit) => {
      const i = +hit.dataset.i, p = cfg.pts[i];
      const scale = svg.getBoundingClientRect().width / CW;
      let anchorY = PT;
      if (cfg.type === 'bar') $$('.bar', box).forEach((b) => b.classList.toggle('hl', +b.dataset.i === i));
      else {
        const xh = $('.xh', box), dot = $('.dot.hov', box);
        xh.setAttribute('x1', hit.dataset.x); xh.setAttribute('x2', hit.dataset.x); xh.setAttribute('visibility', 'visible');
        dot.setAttribute('cx', hit.dataset.x); dot.setAttribute('cy', hit.dataset.y); dot.setAttribute('visibility', 'visible');
        anchorY = +hit.dataset.y;
      }
      tip.innerHTML = cfg.tip(p);
      const left = Math.min(Math.max(+hit.dataset.x * scale, 70), svg.getBoundingClientRect().width - 70);
      tip.style.left = `${left}px`; tip.style.top = `${anchorY * scale - 6}px`; tip.hidden = false;
    };
    const hide = () => {
      tip.hidden = true; $$('.bar', box).forEach((b) => b.classList.remove('hl'));
      $$('.xh, .dot.hov', box).forEach((e) => e.setAttribute('visibility', 'hidden'));
    };
    $$('.hit', box).forEach((h) => { h.addEventListener('pointerenter', () => show(h)); h.addEventListener('click', () => show(h)); });
    box.addEventListener('pointerleave', hide);
  });
}

/** Serie mensual de valor y aportado para un conjunto de cuentas. */
function investSeries(ids) {
  const accs = S.accounts.filter((a) => ids.has(a.id));
  const dates = [...accs.map((a) => a.initialDate || today()), ...S.movements.filter((m) => ids.has(m.accountId) || ids.has(m.toAccountId)).map((m) => m.date)];
  if (!dates.length) return [];
  const first = parseISO(dates.sort()[0]); const now = new Date();
  const pts = [];
  for (let d = new Date(first.getFullYear(), first.getMonth(), 1); d <= now; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    const y = d.getFullYear(), m = d.getMonth();
    const isCurrent = y === now.getFullYear() && m === now.getMonth();
    const bal = computeBalances(isCurrent ? today() : endOfMonth(y, m));
    let v = 0, c = 0; for (const a of accs) { v += bal[a.id].balance; c += bal[a.id].contributed; }
    pts.push({ label: d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', ''), full: monthLabel(y, m), v: round2(v), c: round2(c) });
  }
  return pts.slice(-24);
}

// ─── Rentabilidad anualizada (TIR / XIRR) ───
/** Flujos desde el punto de vista del inversor: negativo = dinero que entra en la cartera. */
function investFlows(ids) {
  const flows = [];
  for (const a of S.accounts) if (ids.has(a.id) && +a.initialBalance) flows.push({ date: a.initialDate || today(), amount: -(+a.initialBalance) });
  for (const m of S.movements) {
    const amt = +m.amount || 0;
    const inFrom = ids.has(m.accountId) && applies(m.accountId, m.date), inTo = ids.has(m.toAccountId) && applies(m.toAccountId, m.date);
    if (m.type === 'transfer') { if (inTo && !inFrom) flows.push({ date: m.date, amount: -amt }); else if (inFrom && !inTo) flows.push({ date: m.date, amount: amt }); }
    else if (m.type === 'income' && inFrom) flows.push({ date: m.date, amount: -amt });
    else if (m.type === 'expense' && inFrom) flows.push({ date: m.date, amount: amt });
  }
  const bal = computeBalances();
  let final = 0; for (const id of ids) final += bal[id]?.balance || 0;
  flows.push({ date: today(), amount: final });
  return flows.sort((x, y) => (x.date < y.date ? -1 : 1));
}
function xirr(flows) {
  if (flows.length < 2 || !flows.some((f) => f.amount < 0) || !flows.some((f) => f.amount > 0)) return null;
  const t0 = parseISO(flows[0].date);
  const yrs = flows.map((f) => (parseISO(f.date) - t0) / (365 * 86400000));
  const npv = (r) => flows.reduce((s, f, i) => s + f.amount / Math.pow(1 + r, yrs[i]), 0);
  let lo = -0.99, hi = 10, flo = npv(lo);
  if (flo * npv(hi) > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2, fm = npv(mid);
    if (Math.abs(fm) < 1e-6) return mid;
    if (flo * fm < 0) hi = mid; else { lo = mid; flo = fm; }
  }
  return (lo + hi) / 2;
}
/** TIR anual en %, o null si hay menos de 3 meses de historial. */
function annualReturn(ids) {
  const flows = investFlows(ids);
  if (!flows.length || daysBetween(flows[0].date, today()) < 90) return null;
  const r = xirr(flows);
  return r === null ? null : r * 100;
}
/** Aportado a una cuenta en un año natural (traspasos de entrada + ingresos, p. ej. aportación de la empresa). */
function contributedInYear(id, year) {
  const y = String(year);
  return round2(S.movements.filter((m) => m.date.startsWith(y) && applies(id, m.date) && ((m.type === 'transfer' && m.toAccountId === id && m.accountId !== id) || (m.type === 'income' && m.accountId === id)))
    .reduce((s, m) => s + (+m.amount || 0), 0));
}
const pensionLimit = (a) => +a.annualLimit || PENSION_LIMITS[a.pensionType || 'individual'];
function pensionAlerts() {
  const now = new Date(); if (now.getMonth() < 9) return []; // de octubre a diciembre
  const y = now.getFullYear();
  return S.accounts.filter((a) => a.kind === 'pension' && !a.archived)
    .map((a) => ({ a, done: contributedInYear(a.id, y), limit: pensionLimit(a) }))
    .filter((x) => x.done < x.limit);
}
/** Efectivo sin invertir dentro de una cartera automatizada: el real de la última valoración o la estimación fijo + % del valor. */
function cashInfo(a, balance) {
  const sets = S.movements.filter((m) => m.accountId === a.id && m.type === 'set').sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : (x.createdAt || 0) - (y.createdAt || 0)));
  const last = sets[sets.length - 1];
  if (last && last.cash !== null && last.cash !== undefined && last.cash !== '') return { cash: round2(Math.min(+last.cash, balance)), real: true, date: last.date };
  const hasRule = (+a.cashFixed || 0) > 0 || (+a.cashPct || 0) > 0;
  if (!hasRule) return null;
  return { cash: round2(Math.max(0, Math.min(balance, (+a.cashFixed || 0) + balance * (+a.cashPct || 0) / 100))), real: false };
}
/** Datos de la última valoración real y lo aportado (neto) después de ella. */
function valuationInfo(a) {
  const sets = S.movements.filter((m) => m.accountId === a.id && m.type === 'set').sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : (x.createdAt || 0) - (y.createdAt || 0)));
  const lastSet = sets[sets.length - 1];
  const lastDate = lastSet ? lastSet.date : a.initialDate || '';
  const lastValue = lastSet ? +lastSet.amount : +a.initialBalance || 0;
  let since = 0;
  for (const m of S.movements) {
    if (!(m.date > lastDate || (m.date === lastDate && lastSet && (m.createdAt || 0) > (lastSet.createdAt || 0)))) continue;
    const amt = +m.amount || 0;
    if (m.type === 'transfer') { if (m.toAccountId === a.id) since += amt; else if (m.accountId === a.id) since -= amt; }
    else if (m.type === 'income' && m.accountId === a.id) since += amt;
    else if (m.type === 'expense' && m.accountId === a.id) since -= amt;
  }
  const next = lastDate ? toISO(new Date(parseISO(lastDate).getTime() + valFreq(a).days * 86400000)) : null;
  return { lastDate, lastValue: round2(lastValue), since: round2(since), next };
}
const lastValueUpdate = (a) => S.movements.filter((m) => m.accountId === a.id && m.type === 'set').reduce((d, m) => (m.date > d ? m.date : d), a.initialDate || '');


function viewInvestOverview() {
  const invs = accountsSorted().filter((a) => isInvest(a) || a.kind === 'deposito');
  if (!invs.length) return '';
  const bal = computeBalances();
  let v = 0, c = 0, fees = 0;
  for (const a of invs) { v += bal[a.id].balance; c += bal[a.id].contributed; if (a.feePct) fees += bal[a.id].balance * a.feePct / 100; }
  const gain = v - c, ids = new Set(invs.map((a) => a.id)), tir = annualReturn(ids);
  const pctBase = invs.reduce((sum, a) => sum + bal[a.id].pctBase, 0);
  const rows = invs.map((a) => {
    const b = bal[a.id], t = isInvest(a) ? annualReturn(new Set([a.id])) : null;
    return `<li class="row" data-action="open-account" data-id="${a.id}"><div class="row-icon">${KINDS[a.kind].icon}</div>
      <div class="row-main"><div class="row-title">${esc(a.name)}</div><div class="row-sub">${money(b.balance)} · ${Math.round(v ? (b.balance / v) * 100 : 0)}% del total${t !== null ? ` · TIR ${pct(t)}` : ''}</div></div>
      <div class="row-amt ${b.gain >= 0 ? 'pos' : 'neg'}">${signed(b.gain)}${b.gainPct !== null ? `<small>${pct(b.gainPct)}</small>` : ''}</div></li>`;
  }).join('');
  return `<section class="card"><h2>Inversiones (hoy)</h2><div class="stats">
      <div><div class="k">Valor</div><div class="v">${money(v)}</div></div>
      <div><div class="k">Aportado</div><div class="v">${money(c)}</div></div>
      <div><div class="k">Ganancia</div><div class="v ${gain >= 0 ? 'pos' : 'neg'}">${signed(gain)}</div></div></div>
    <div class="stats" style="margin-top:12px">
      <div><div class="k">Rentabilidad</div><div class="v">${pctBase > 0 ? pct((gain / pctBase) * 100) : '—'}</div></div>
      <div><div class="k">TIR anual</div><div class="v">${tir === null ? '—' : pct(tir)}</div></div>
      <div><div class="k">Comisiones/año</div><div class="v">${fees ? money(fees) : '—'}</div></div></div>
    <ul class="list" style="margin-top:10px">${rows}</ul></section>
    <section class="card"><h2>Evolución de tus inversiones</h2>${chartValueVsContributed('chart-inv', investSeries(ids))}</section>`;
}

// ─── Más ───
function viewMore() {
  const email = store.hasCloud ? store.currentEmail() : null;
  return `<section class="card"><ul class="list">
      <li class="row" data-action="go-recurring"><div class="row-icon">🔄</div><div class="row-main"><div class="row-title">Fijos y automáticos</div><div class="row-sub">Nómina, gastos fijos, aportaciones periódicas (${S.recurring.length})</div></div><div class="row-amt muted">›</div></li>
      <li class="row" data-action="all-movs"><div class="row-icon">📜</div><div class="row-main"><div class="row-title">Todos los movimientos</div><div class="row-sub">${S.movements.length} registrados</div></div><div class="row-amt muted">›</div></li>
    </ul></section>
    <section class="card"><h2>Copia de seguridad</h2>
      <p class="hint" style="margin:0 0 10px">Descarga todos tus datos en un archivo, o restaura uno anterior.</p>
      <div class="btn-row"><button class="btn secondary" data-action="export">Descargar copia</button>
      <button class="btn secondary" data-action="import">Restaurar copia</button>
      <button class="btn ghost" data-action="export-csv">Movimientos en CSV</button></div>
      <input type="file" id="import-file" accept="application/json,.json" hidden></section>
    <section class="card"><h2>Sincronización</h2>
      ${store.hasCloud
        ? `<p style="margin:0 0 10px">☁️ Sincronizado con la nube como <strong>${esc(email || '')}</strong>.</p>
           ${store.localDataExists() ? '<button class="btn secondary small" data-action="migrate-local">Subir datos del modo local a la nube</button> ' : ''}
           <button class="btn danger small" data-action="logout">Cerrar sesión</button>`
        : `<p style="margin:0">📱 <strong>Modo local</strong>: los datos solo se guardan en este navegador. Para sincronizar móvil y ordenador, configura Firebase siguiendo el README.</p>`}
    </section>
    <p class="hint" style="text-align:center">Mis Finanzas · v2.4</p>`;
}

function recRow(r) {
  const T = TYPES[r.type];
  const where = r.type === 'transfer' ? `${accName(r.accountId)} → ${accName(r.toAccountId)}` : accName(r.accountId);
  return `<li class="row" data-action="edit-rec" data-id="${r.id}"><div class="row-icon">${T.icon}</div>
    <div class="row-main"><div class="row-title">${esc(r.name)} ${r.active === false ? '<span class="badge">pausado</span>' : ''}</div>
    <div class="row-sub">${FREQS[r.frequency] || ''} · próximo ${fmtShort(r.nextDate)} · ${esc(where)}</div></div>
    <div class="row-amt ${r.type === 'income' ? 'pos' : r.type === 'expense' ? 'neg' : ''}">${money(+r.amount)}</div></li>`;
}

function viewRecurring() {
  const list = [...S.recurring].sort((a, b) => (a.nextDate < b.nextDate ? -1 : 1));
  const monthly = (r) => (+r.amount || 0) * ({ weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 }[r.frequency] || 1);
  const act = list.filter((r) => r.active !== false);
  const inc = act.filter((r) => r.type === 'income').reduce((s, r) => s + monthly(r), 0);
  const exp = act.filter((r) => r.type === 'expense').reduce((s, r) => s + monthly(r), 0);
  const tr = act.filter((r) => r.type === 'transfer').reduce((s, r) => s + monthly(r), 0);
  return `<section class="card"><h2>Media mensual</h2><div class="stats">
      <div><div class="k">Ingresos fijos</div><div class="v pos">${money(inc)}</div></div>
      <div><div class="k">Gastos fijos</div><div class="v neg">${money(exp)}</div></div>
      <div><div class="k">Aportaciones</div><div class="v">${money(tr)}</div></div></div></section>
    <section class="card">${list.length ? `<ul class="list">${list.map(recRow).join('')}</ul>` : '<div class="empty">Añade tu nómina, el alquiler, los recibos o tus aportaciones automáticas. Cuando les toque, aparecerán en Inicio para confirmarlos con un toque.</div>'}</section>
    <button class="btn" data-action="new-rec">+ Nuevo fijo / automático</button>`;
}

function viewAllMovements() {
  const movs = sortedMovements().reverse();
  if (!movs.length) return '<div class="card empty">Sin movimientos.</div>';
  let h = '', cur = '';
  for (const m of movs) {
    const k = m.date.slice(0, 7);
    if (k !== cur) { if (cur) h += '</ul></section>'; cur = k; const [y, mm] = k.split('-').map(Number); h += `<div class="group-title"><span>${monthLabel(y, mm - 1)}</span></div><section class="card"><ul class="list">`; }
    h += movRow(m);
  }
  return h + '</ul></section>';
}

// ═════════════════════════ Hoja modal ═════════════════════════
const sheet = $('#sheet');
function openSheet(title, body, onMount) {
  $('#sheet-body').innerHTML = `<div class="sheet-head"><h3>${esc(title)}</h3><button class="x" data-close aria-label="Cerrar">✕</button></div>${body}`;
  if (!sheet.open) sheet.showModal();
  onMount?.($('#sheet-body'));
}
function closeSheet() { if (sheet.open) sheet.close(); }
sheet.addEventListener('click', (e) => { if (e.target === sheet || e.target.closest('[data-close]')) closeSheet(); });

const accountOptions = (sel, { exclude, includeArchived } = {}) => accountsSorted(includeArchived)
  .filter((a) => a.id !== exclude || a.id === sel)
  .map((a) => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
const catOptions = (list, sel) => list.map((c) => `<option ${c === sel ? 'selected' : ''}>${esc(c)}</option>`).join('');

// ─── Movimiento ───
function openMovementForm({ movement = null, preset = {}, fromRecurring = null } = {}) {
  if (!S.accounts.length) { toast('Primero crea una cuenta'); openAccountForm(); return; }
  const m = movement || { type: 'expense', date: today(), ...preset };
  const editing = !!movement;
  const defAcc = m.accountId || accountsSorted().find((a) => a.kind === 'corriente')?.id || accountsSorted()[0]?.id;
  const bal = computeBalances();
  const body = `<form id="f-mov" autocomplete="off">
    <div class="seg">${Object.entries(TYPES).map(([k, t]) => `<button type="button" data-type="${k}" class="${m.type === k ? 'on' : ''}">${t.label}</button>`).join('')}</div>
    <input type="hidden" name="type" value="${m.type}">
    <label class="amount"><span data-amount-label>Importe (€)</span><input name="amount" inputmode="decimal" placeholder="0,00" value="${amountInput(m.amount)}" required></label>
    <label><span data-acc-label>Cuenta</span><select name="accountId">${accountOptions(defAcc, { includeArchived: editing })}</select></label>
    <p class="hint" data-show="set" data-current></p>
    <label data-show="set" data-only-robo><span>De ello, efectivo sin invertir (€, opcional)</span><input name="cash" inputmode="decimal" placeholder="Si lo dejas vacío, se estima" value="${amountInput(m.cash)}"></label>
    <label data-show="transfer"><span>Cuenta destino</span><select name="toAccountId">${accountOptions(m.toAccountId || accountsSorted().find((a) => a.id !== defAcc)?.id, { includeArchived: editing })}</select></label>
    <label data-show="expense"><span>Categoría</span><select name="catExpense">${catOptions(EXPENSE_CATS, m.type === 'expense' ? m.category : '')}</select></label>
    <label data-show="income"><span>Categoría</span><select name="catIncome">${catOptions(INCOME_CATS, m.type === 'income' ? m.category : 'Nómina')}</select></label>
    <label class="check" data-show="expense"><input type="checkbox" name="fixed" ${m.fixed ? 'checked' : ''}> Es un gasto fijo (recibo, cuota…)</label>
    <div class="two"><label><span>Fecha</span><input type="date" name="date" value="${m.date}" required></label>
    <label><span>Concepto</span><input name="note" value="${esc(m.note || '')}" placeholder="Opcional"></label></div>
    <p class="err" hidden></p>
    <div class="actions">${editing ? '<button type="button" class="btn danger" data-del>Eliminar</button>' : ''}<span class="spacer"></span>
      <button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn">Guardar</button></div></form>`;
  openSheet(editing ? 'Editar movimiento' : fromRecurring ? `Confirmar: ${fromRecurring.name}` : m.type === 'set' ? (acc(m.accountId) && isInvest(acc(m.accountId)) ? 'Actualizar valor' : 'Ajustar saldo') : m.type === 'transfer' && m.toAccountId && isInvest(acc(m.toAccountId) || {}) ? 'Nueva aportación' : 'Nuevo movimiento', body, (root) => {
    const f = $('#f-mov', root);
    const sync = () => {
      const t = f.type.value;
      $$('[data-show]', f).forEach((el) => { el.hidden = !el.dataset.show.split(' ').includes(t); });
      if (acc(f.accountId.value)?.kind !== 'robo') $('[data-only-robo]', f).hidden = true;
      $$('.seg button', f).forEach((b) => b.classList.toggle('on', b.dataset.type === t));
      $('[data-amount-label]', f).textContent = t === 'set' ? (isInvest(acc(f.accountId.value) || {}) ? 'Valor total actual (€)' : 'Saldo actual real (€)') : 'Importe (€)';
      $('[data-acc-label]', f).textContent = t === 'transfer' ? 'Desde' : 'Cuenta';
      if (t === 'set') {
        const ca = acc(f.accountId.value);
        $('[data-current]', f).textContent = ca && isInvest(ca)
          ? `Valor estimado ahora: ${money(bal[ca.id]?.balance || 0)} (última valoración + aportaciones). Escribe el valor real que te indique tu entidad: la diferencia es tu ganancia o pérdida del periodo.`
          : `Saldo que calcula la app: ${money(bal[f.accountId.value]?.balance || 0)}. Escribe el saldo real y la diferencia se registrará como ajuste.`;
      }
    };
    $$('.seg button', f).forEach((b) => b.addEventListener('click', () => { f.type.value = b.dataset.type; sync(); f.amount.focus(); }));
    f.accountId.addEventListener('change', sync);
    sync();
    if (!editing) setTimeout(() => f.amount.focus(), 50);
    $('[data-del]', f)?.addEventListener('click', () => {
      if (confirm('¿Eliminar este movimiento?')) { store.remove('movements', movement.id); closeSheet(); toast('Movimiento eliminado'); }
    });
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const err = $('.err', f);
      const type = f.type.value, amount = parseAmount(f.amount.value);
      if (!Number.isFinite(amount) || (type !== 'set' && amount <= 0)) { err.textContent = 'Introduce un importe válido.'; err.hidden = false; return; }
      if (type === 'transfer' && f.accountId.value === f.toAccountId.value) { err.textContent = 'Las cuentas de origen y destino deben ser distintas.'; err.hidden = false; return; }
      const data = {
        type, amount: round2(amount), date: f.date.value, accountId: f.accountId.value,
        toAccountId: type === 'transfer' ? f.toAccountId.value : null,
        category: type === 'expense' ? f.catExpense.value : type === 'income' ? f.catIncome.value : null,
        fixed: type === 'expense' ? f.fixed.checked : false,
        note: f.note.value.trim(),
      };
      const cashTxt = f.cash.value.trim();
      data.cash = type === 'set' && acc(data.accountId)?.kind === 'robo' && cashTxt && Number.isFinite(parseAmount(cashTxt)) ? round2(parseAmount(cashTxt)) : null;
      if (editing) store.update('movements', movement.id, data);
      else {
        if (fromRecurring) data.recurringId = fromRecurring.id;
        store.add('movements', data);
        if (fromRecurring) advanceRecurring(fromRecurring);
      }
      closeSheet(); toast(editing ? 'Cambios guardados' : 'Movimiento añadido');
    });
  });
}

// ─── Cuenta ───
function openAccountForm(a = null) {
  const editing = !!a;
  const x = a || { kind: 'corriente', available: true, initialDate: today() };
  const hasMovs = editing && S.movements.some((m) => m.accountId === a.id || m.toAccountId === a.id);
  const body = `<form id="f-acc" autocomplete="off">
    <label><span>Nombre</span><input name="name" value="${esc(x.name || '')}" placeholder="Ej. Nómina BBVA, Depósito 12m…" required></label>
    <label><span>Tipo</span><select name="kind">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}" ${x.kind === k ? 'selected' : ''}>${v.icon} ${v.label}</option>`).join('')}</select></label>
    <label class="check"><input type="checkbox" name="available" ${x.available ? 'checked' : ''}> Dinero disponible (puedo usarlo ya)</label>
    <div class="two"><label class="amount"><span data-ib-label>Saldo inicial (€)</span><input name="initialBalance" inputmode="decimal" placeholder="0,00" value="${amountInput(x.initialBalance)}"></label>
    <label><span>A fecha de</span><input type="date" name="initialDate" value="${x.initialDate || today()}"></label></div>
    <div data-kind="pension">
      <div class="two"><label><span>Tipo de plan</span><select name="pensionType"><option value="individual" ${x.pensionType !== 'empleo' ? 'selected' : ''}>Individual</option><option value="empleo" ${x.pensionType === 'empleo' ? 'selected' : ''}>De empleo (empresa)</option></select></label>
      <label><span>Límite anual deducible (€)</span><input name="annualLimit" inputmode="decimal" placeholder="1.500" value="${amountInput(x.annualLimit)}"></label></div>
      <p class="hint">Si lo dejas vacío: 1.500 € (individual) o 10.000 € (empleo).</p></div>
    <div data-kind="robo pension">
      <label><span>Entidad / gestora</span><input name="entity" value="${esc(x.entity || '')}" placeholder="Ej. Indexa Capital, MyInvestor, Indexa Más Rentabilidad…"></label>
      <div class="two"><label data-kind="robo"><span>Perfil de riesgo (1–10)</span><input name="risk" type="number" min="1" max="10" step="1" value="${x.risk || ''}"></label>
      <label><span>Comisión total anual (%)</span><input name="feePct" inputmode="decimal" placeholder="0,6" value="${amountInput(x.feePct)}"></label></div>
      <label><span>% en renta variable (el resto, renta fija)</span><input name="equityPct" type="number" min="0" max="100" step="1" placeholder="Ej. 75" value="${x.equityPct ?? ''}"></label>
      <div data-kind="robo"><span class="hint" style="display:block;margin:0 0 4px">Efectivo que la cartera mantiene sin invertir</span>
      <div class="two"><label><span>Cantidad fija (€)</span><input name="cashFixed" inputmode="decimal" value="${amountInput(x.cashFixed === 0 ? '' : x.cashFixed ?? 150)}"></label>
      <label><span>+ % del valor</span><input name="cashPct" inputmode="decimal" value="${amountInput(x.cashPct === 0 ? '' : x.cashPct ?? 0.5)}"></label></div>
      <p class="hint">Por ejemplo 150 € + 0,5 %. Sirve para saber cuánto está realmente invertido. Déjalo vacío si tu cartera no guarda efectivo.</p></div>
      <p class="hint">Consejo: crea también la aportación automática en Más → Fijos y automáticos.</p></div>
    <div data-kind="inversion robo pension">
      <label><span>Actualizar el valor</span><select name="valuationFreq">${Object.entries(VAL_FREQS).map(([k, v]) => `<option value="${k}" ${(x.valuationFreq || 'quarterly') === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
      <p class="hint">Solo te avisaré cuando toque. Entre valoraciones, basta con apuntar las aportaciones.</p>
      <label><span>Capital aportado hasta ahora (€, opcional)</span><input name="initialContributed" inputmode="decimal" placeholder="Si lo dejas vacío, = saldo inicial" value="${amountInput(x.initialContributed)}"></label>
      <p class="hint">Sirve para calcular la rentabilidad: si tu fondo vale 5.200 € pero metiste 5.000 €, pon 5.000.</p></div>
    <div data-kind="deposito">
      <div class="two"><label><span>TAE (%)</span><input name="tae" inputmode="decimal" placeholder="2,5" value="${amountInput(x.tae)}"></label>
      <label><span>Fecha de inicio</span><input type="date" name="startDate" value="${x.startDate || x.initialDate || today()}"></label></div>
      <label><span>Fecha de vencimiento</span><input type="date" name="maturityDate" value="${x.maturityDate || ''}"></label>
      <p class="hint">Te avisaré 30 días antes del vencimiento.</p></div>
    ${editing ? `<label class="check"><input type="checkbox" name="archived" ${x.archived ? 'checked' : ''}> Archivada (oculta, p. ej. depósito cancelado)</label>` : ''}
    <p class="err" hidden></p>
    <div class="actions">${editing ? '<button type="button" class="btn danger" data-del>Eliminar</button>' : ''}<span class="spacer"></span>
      <button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn">Guardar</button></div></form>`;
  openSheet(editing ? 'Editar cuenta' : 'Nueva cuenta', body, (root) => {
    const f = $('#f-acc', root);
    const sync = (fromKindChange) => {
      $$('[data-kind]', f).forEach((el) => { el.hidden = !el.dataset.kind.split(' ').includes(f.kind.value); });
      $('[data-ib-label]', f).textContent = INVEST_KINDS.includes(f.kind.value) ? (f.kind.value === 'robo' ? 'Valor total actual, con efectivo (€)' : 'Valor actual (€)') : 'Saldo inicial (€)';
      if (fromKindChange) f.available.checked = KINDS[f.kind.value].available;
    };
    f.kind.addEventListener('change', () => sync(true)); sync(false);
    $('[data-del]', f)?.addEventListener('click', () => {
      if (hasMovs) { alert('Esta cuenta tiene movimientos. Puedes marcarla como "Archivada" para ocultarla sin perder el historial.'); return; }
      if (confirm(`¿Eliminar la cuenta "${a.name}"?`)) { store.remove('accounts', a.id); closeSheet(); nav = { tab: 'accounts' }; render(); toast('Cuenta eliminada'); }
    });
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const err = $('.err', f);
      const ib = f.initialBalance.value.trim() ? parseAmount(f.initialBalance.value) : 0;
      if (!Number.isFinite(ib)) { err.textContent = 'Saldo inicial no válido.'; err.hidden = false; return; }
      const kind = f.kind.value;
      const data = { name: f.name.value.trim(), kind, available: f.available.checked, initialBalance: round2(ib), initialDate: f.initialDate.value || today() };
      const ic = f.initialContributed.value.trim();
      data.initialContributed = INVEST_KINDS.includes(kind) && ic ? round2(parseAmount(ic)) : null;
      data.valuationFreq = INVEST_KINDS.includes(kind) ? f.valuationFreq.value : null;
      if (kind === 'pension') {
        const lim = f.annualLimit.value.trim() ? parseAmount(f.annualLimit.value) : null;
        Object.assign(data, { pensionType: f.pensionType.value, annualLimit: Number.isFinite(lim) && lim > 0 ? lim : null });
      } else Object.assign(data, { pensionType: null, annualLimit: null });
      if (kind === 'robo' || kind === 'pension') {
        const fee = f.feePct.value.trim() ? parseAmount(f.feePct.value) : null;
        const risk = parseInt(f.risk.value, 10), eq = parseInt(f.equityPct.value, 10);
        Object.assign(data, { entity: f.entity.value.trim(), feePct: Number.isFinite(fee) ? fee : null,
          risk: kind === 'robo' && risk >= 1 && risk <= 10 ? risk : null, equityPct: eq >= 0 && eq <= 100 ? eq : null });
      } else Object.assign(data, { entity: null, feePct: null, risk: null, equityPct: null });
      if (kind === 'robo') {
        const cf = f.cashFixed.value.trim() ? parseAmount(f.cashFixed.value) : null, cp = f.cashPct.value.trim() ? parseAmount(f.cashPct.value) : null;
        Object.assign(data, { cashFixed: Number.isFinite(cf) ? cf : 0, cashPct: Number.isFinite(cp) ? cp : 0 }); // 0 = sin efectivo (vacío a propósito)
      } else Object.assign(data, { cashFixed: null, cashPct: null });
      if (kind === 'deposito') {
        data.tae = f.tae.value.trim() ? parseAmount(f.tae.value) : null;
        data.startDate = f.startDate.value || null; data.maturityDate = f.maturityDate.value || null;
      } else { data.tae = null; data.startDate = null; data.maturityDate = null; }
      if (editing) { data.archived = f.archived.checked; store.update('accounts', a.id, data); }
      else { data.archived = false; const id = store.add('accounts', data); nav = { tab: 'accounts', accountId: id }; }
      closeSheet(); render(); toast(editing ? 'Cuenta guardada' : 'Cuenta creada');
    });
  });
}

// ─── Recurrentes ───
function advanceRecurring(r) {
  store.update('recurring', r.id, { nextDate: addPeriod(r.nextDate, r.frequency, r.anchorDay), lastDone: r.nextDate });
}
function confirmRecurring(r) {
  store.add('movements', {
    type: r.type, amount: +r.amount, date: r.nextDate, accountId: r.accountId,
    toAccountId: r.type === 'transfer' ? r.toAccountId : null, category: r.category || null,
    fixed: r.type === 'expense', note: r.name, recurringId: r.id,
  });
  advanceRecurring(r);
}

function openRecurringForm(r = null) {
  if (!S.accounts.length) { toast('Primero crea una cuenta'); openAccountForm(); return; }
  const editing = !!r;
  const x = r || { type: 'expense', frequency: 'monthly', nextDate: today(), active: true };
  const defAcc = x.accountId || accountsSorted().find((a) => a.kind === 'corriente')?.id;
  const body = `<form id="f-rec" autocomplete="off">
    <div class="seg">${['expense', 'income', 'transfer'].map((k) => `<button type="button" data-type="${k}" class="${x.type === k ? 'on' : ''}">${k === 'transfer' ? 'Aportación / traspaso' : TYPES[k].label}</button>`).join('')}</div>
    <input type="hidden" name="type" value="${x.type}">
    <label><span>Nombre</span><input name="name" value="${esc(x.name || '')}" placeholder="Ej. Nómina, Alquiler, Aportación fondo" required></label>
    <label class="amount"><span>Importe (€)</span><input name="amount" inputmode="decimal" placeholder="0,00" value="${amountInput(x.amount)}" required></label>
    <p class="hint">Si el importe varía (luz, agua), pon el habitual: podrás cambiarlo al confirmarlo.</p>
    <label><span data-acc-label>Cuenta</span><select name="accountId">${accountOptions(defAcc)}</select></label>
    <label data-show="transfer"><span>Cuenta destino</span><select name="toAccountId">${accountOptions(x.toAccountId || accountsSorted().find((a) => a.id !== defAcc)?.id)}</select></label>
    <label data-show="expense"><span>Categoría</span><select name="catExpense">${catOptions(EXPENSE_CATS, x.type === 'expense' ? x.category : '')}</select></label>
    <label data-show="income"><span>Categoría</span><select name="catIncome">${catOptions(INCOME_CATS, x.type === 'income' ? x.category : 'Nómina')}</select></label>
    <div class="two"><label><span>Frecuencia</span><select name="frequency">${Object.entries(FREQS).map(([k, v]) => `<option value="${k}" ${x.frequency === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <label><span>Próxima fecha</span><input type="date" name="nextDate" value="${x.nextDate}" required></label></div>
    <label class="check"><input type="checkbox" name="active" ${x.active !== false ? 'checked' : ''}> Activo</label>
    <p class="err" hidden></p>
    <div class="actions">${editing ? '<button type="button" class="btn danger" data-del>Eliminar</button>' : ''}<span class="spacer"></span>
      <button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn">Guardar</button></div></form>`;
  openSheet(editing ? 'Editar fijo / automático' : 'Nuevo fijo / automático', body, (root) => {
    const f = $('#f-rec', root);
    const sync = () => {
      const t = f.type.value;
      $$('[data-show]', f).forEach((el) => { el.hidden = el.dataset.show !== t; });
      $$('.seg button', f).forEach((b) => b.classList.toggle('on', b.dataset.type === t));
      $('[data-acc-label]', f).textContent = t === 'transfer' ? 'Desde' : 'Cuenta';
    };
    $$('.seg button', f).forEach((b) => b.addEventListener('click', () => { f.type.value = b.dataset.type; sync(); }));
    sync();
    $('[data-del]', f)?.addEventListener('click', () => {
      if (confirm(`¿Eliminar "${r.name}"? Los movimientos ya registrados se mantienen.`)) { store.remove('recurring', r.id); closeSheet(); toast('Eliminado'); }
    });
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const err = $('.err', f), type = f.type.value, amount = parseAmount(f.amount.value);
      if (!Number.isFinite(amount) || amount <= 0) { err.textContent = 'Introduce un importe válido.'; err.hidden = false; return; }
      if (type === 'transfer' && f.accountId.value === f.toAccountId.value) { err.textContent = 'Las cuentas deben ser distintas.'; err.hidden = false; return; }
      const data = {
        type, name: f.name.value.trim(), amount: round2(amount), accountId: f.accountId.value,
        toAccountId: type === 'transfer' ? f.toAccountId.value : null,
        category: type === 'expense' ? f.catExpense.value : type === 'income' ? f.catIncome.value : null,
        frequency: f.frequency.value, nextDate: f.nextDate.value, anchorDay: parseISO(f.nextDate.value).getDate(),
        active: f.active.checked,
      };
      if (editing) store.update('recurring', r.id, data); else store.add('recurring', data);
      closeSheet(); toast('Guardado');
    });
  });
}

// ─── Vencimiento de depósito ───
function openMaturityForm(a) {
  const b = computeBalances()[a.id];
  const principal = b.contributed > 0 ? b.contributed : b.balance;
  const gross = estimatedInterest(a, principal);
  const net = round2(gross * 0.81);
  const others = accountsSorted().filter((x) => x.id !== a.id);
  const body = `<form id="f-mat">
    <p class="hint" style="margin:0 0 12px">Saldo actual del depósito: <strong>${money(b.balance)}</strong>. Vencimiento: ${fmtDate(a.maturityDate)}.</p>
    <label class="amount"><span>Intereses netos cobrados (€)</span><input name="interest" inputmode="decimal" value="${amountInput(net)}"></label>
    <p class="hint">Estimación: ${money(gross)} brutos − 19% de retención ≈ ${money(net)}. Corrígelo con lo que diga tu banco.</p>
    <div class="seg"><button type="button" data-opt="transfer" class="on">Cancelar y traspasar</button><button type="button" data-opt="renew">Renovar</button></div>
    <input type="hidden" name="opt" value="transfer">
    <div data-opt-show="transfer"><label><span>Traspasar todo a</span><select name="to">${others.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></label>
      <label class="check"><input type="checkbox" name="archive" checked> Archivar el depósito después</label></div>
    <div data-opt-show="renew"><div class="two"><label><span>Nueva TAE (%)</span><input name="tae" inputmode="decimal" value="${amountInput(a.tae)}"></label>
      <label><span>Nuevo vencimiento</span><input type="date" name="maturity" value="${a.maturityDate ? addPeriod(a.maturityDate, 'yearly') : ''}"></label></div>
      <p class="hint">Los intereses se suman al depósito.</p></div>
    <div class="actions"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn">Confirmar</button></div></form>`;
  openSheet(`Vencimiento: ${a.name}`, body, (root) => {
    const f = $('#f-mat', root);
    const sync = () => { $$('[data-opt-show]', f).forEach((el) => { el.hidden = el.dataset.optShow !== f.opt.value; }); $$('[data-opt]', f).forEach((bt) => bt.classList.toggle('on', bt.dataset.opt === f.opt.value)); };
    $$('[data-opt]', f).forEach((bt) => bt.addEventListener('click', () => { f.opt.value = bt.dataset.opt; sync(); }));
    sync();
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const interest = f.interest.value.trim() ? parseAmount(f.interest.value) : 0;
      const date = a.maturityDate && a.maturityDate <= today() ? a.maturityDate : today();
      if (Number.isFinite(interest) && interest > 0) store.add('movements', { type: 'yield', amount: round2(interest), date, accountId: a.id, note: 'Intereses al vencimiento' });
      const total = round2(b.balance + (Number.isFinite(interest) ? interest : 0));
      if (f.opt.value === 'transfer') {
        if (!f.to.value) { alert('Necesitas otra cuenta a la que traspasar.'); return; }
        if (total > 0) store.add('movements', { type: 'transfer', amount: total, date, accountId: a.id, toAccountId: f.to.value, note: `Vencimiento ${a.name}` });
        store.update('accounts', a.id, { archived: f.archive.checked, maturityDate: f.archive.checked ? a.maturityDate : null });
      } else {
        store.update('accounts', a.id, { tae: f.tae.value.trim() ? parseAmount(f.tae.value) : a.tae, startDate: date, maturityDate: f.maturity.value || null });
      }
      closeSheet(); toast('Vencimiento registrado');
    });
  });
}

// ─── Copias ───
function download(name, text, type) {
  const blob = new Blob([text], { type }); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportCSV() {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Fecha', 'Tipo', 'Importe', 'Cuenta', 'Cuenta destino', 'Categoría', 'Fijo', 'Concepto']];
  for (const m of sortedMovements()) rows.push([m.date, TYPES[m.type]?.label, String(m.amount).replace('.', ','), accName(m.accountId), m.toAccountId ? accName(m.toAccountId) : '', m.category || '', m.fixed ? 'Sí' : '', m.note || '']);
  download(`movimientos-${today()}.csv`, '﻿' + rows.map((r) => r.map(q).join(';')).join('\n'), 'text/csv');
}

// ═════════════════════════ Eventos ═════════════════════════
document.addEventListener('click', async (e) => {
  const tab = e.target.closest('[data-tab]');
  if (tab) { nav = { tab: tab.dataset.tab }; render(); window.scrollTo(0, 0); return; }
  const el = e.target.closest('[data-action]'); if (!el) return;
  const id = el.dataset.id;
  switch (el.dataset.action) {
    case 'back': nav = { tab: nav.tab }; render(); break;
    case 'new-mov': openMovementForm({ preset: nav.accountId ? { accountId: nav.accountId } : {} }); break;
    case 'new-mov-account': openMovementForm({ preset: { accountId: id } }); break;
    case 'new-contribution': openMovementForm({ preset: { type: 'transfer', toAccountId: id, accountId: accountsSorted().find((a) => a.kind === 'corriente')?.id, note: `Aportación ${acc(id)?.name || ''}`.trim() } }); break;
    case 'new-mov-pension': openMovementForm({ preset: { type: 'transfer', toAccountId: id, accountId: accountsSorted().find((a) => a.kind === 'corriente')?.id, note: 'Aportación plan de pensiones' } }); break;
    case 'set-balance': openMovementForm({ preset: { accountId: id, type: 'set' } }); break;
    case 'edit-mov': { const m = S.movements.find((x) => x.id === id); if (m) openMovementForm({ movement: m }); break; }
    case 'new-account': openAccountForm(); break;
    case 'edit-account': openAccountForm(acc(id)); break;
    case 'open-account': nav = { tab: 'accounts', accountId: id }; render(); window.scrollTo(0, 0); break;
    case 'show-all-acc': nav = { ...nav, showAll: true }; render(); break;
    case 'fs-open': { const d = new Date(); flowSheet = { k: el.dataset.k, y: d.getFullYear(), m: d.getMonth() }; openFlowSheet(); break; }
    case 'fs-prev': flowSheet = flowSheet.m === 0 ? { ...flowSheet, y: flowSheet.y - 1, m: 11 } : { ...flowSheet, m: flowSheet.m - 1 }; openFlowSheet(); break;
    case 'fs-next': flowSheet = flowSheet.m === 11 ? { ...flowSheet, y: flowSheet.y + 1, m: 0 } : { ...flowSheet, m: flowSheet.m + 1 }; openFlowSheet(); break;
    case 'flow-period': flowPeriod = el.dataset.p; render(); break;
    case 'toggle-archived': showArchived = !showArchived; render(); break;
    case 'go-summary': nav = { tab: 'summary' }; render(); break;
    case 'go-recurring': nav = { tab: 'more', sub: 'recurring' }; render(); break;
    case 'all-movs': nav = { tab: 'more', sub: 'movements' }; render(); window.scrollTo(0, 0); break;
    case 'new-rec': openRecurringForm(); break;
    case 'edit-rec': openRecurringForm(S.recurring.find((x) => x.id === id)); break;
    case 'rec-confirm': { const r = S.recurring.find((x) => x.id === id); if (r) { confirmRecurring(r); toast(`${r.name} registrado`); } break; }
    case 'rec-edit-confirm': {
      const r = S.recurring.find((x) => x.id === id);
      if (r) openMovementForm({ fromRecurring: r, preset: { type: r.type, amount: r.amount, accountId: r.accountId, toAccountId: r.toAccountId, category: r.category, fixed: r.type === 'expense', note: r.name, date: r.nextDate } });
      break;
    }
    case 'rec-skip-all': if (confirm('¿Saltar todos los pendientes sin registrarlos?')) { pendingRecurring().forEach(advanceRecurring); toast('Saltados'); } break;
    case 'maturity': openMaturityForm(acc(id)); break;
    case 'month-prev': summaryMonth = summaryMonth.m === 0 ? { y: summaryMonth.y - 1, m: 11 } : { y: summaryMonth.y, m: summaryMonth.m - 1 }; render(); break;
    case 'month-next': summaryMonth = summaryMonth.m === 11 ? { y: summaryMonth.y + 1, m: 0 } : { y: summaryMonth.y, m: summaryMonth.m + 1 }; render(); break;
    case 'export': download(`mis-finanzas-${today()}.json`, JSON.stringify(store.exportData(), null, 2), 'application/json'); break;
    case 'export-csv': exportCSV(); break;
    case 'import': $('#import-file').click(); break;
    case 'migrate-local':
      if (confirm('¿Subir a la nube los datos que tenías en modo local en este navegador? Se añadirán a los actuales.')) {
        await store.importData(store.readLocalData(), { replace: false }); toast('Datos subidos');
      }
      break;
    case 'logout': if (confirm('¿Cerrar sesión?')) store.signOut(); break;
  }
});

document.addEventListener('change', async (e) => {
  if (e.target.id !== 'import-file') return;
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.accounts) || !Array.isArray(data.movements)) throw new Error('formato');
    if (!confirm(`Se reemplazarán TODOS tus datos actuales por la copia (${data.accounts.length} cuentas, ${data.movements.length} movimientos). ¿Continuar?`)) return;
    await store.importData(data, { replace: true }); toast('Copia restaurada');
  } catch { alert('El archivo no es una copia válida de Mis Finanzas.'); }
});

// ═════════════════════════ Login (modo nube) ═════════════════════════
const AUTH_ERRORS = {
  'auth/invalid-credential': 'Email o contraseña incorrectos.', 'auth/wrong-password': 'Contraseña incorrecta.',
  'auth/user-not-found': 'No existe una cuenta con ese email.', 'auth/email-already-in-use': 'Ya existe una cuenta con ese email.',
  'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.', 'auth/invalid-email': 'Email no válido.',
  'auth/too-many-requests': 'Demasiados intentos. Espera un poco.', 'auth/network-request-failed': 'Sin conexión.',
  'auth/operation-not-allowed': 'Activa "Correo electrónico/contraseña" en Firebase → Authentication.',
};
function viewLogin() {
  $('#tabbar').hidden = true; $('#title').textContent = 'Mis Finanzas';
  $('#view').innerHTML = `<div class="login card"><div class="logo">💶</div><p>Inicia sesión para sincronizar tus datos entre dispositivos.</p>
    <form id="f-login"><label><span>Email</span><input type="email" name="email" autocomplete="username" required></label>
    <label><span>Contraseña</span><input type="password" name="pw" autocomplete="current-password" required minlength="6"></label>
    <p class="err" hidden></p><button class="btn block">Entrar</button></form>
    <div class="btn-row" style="justify-content:space-between;margin-top:12px"><button class="link" id="b-signup">Crear cuenta</button><button class="link" id="b-reset">He olvidado la contraseña</button></div></div>`;
  const f = $('#f-login'), err = $('.err', f);
  const fail = (e) => { err.textContent = AUTH_ERRORS[e.code] || e.message; err.hidden = false; };
  f.addEventListener('submit', (e) => { e.preventDefault(); err.hidden = true; store.signIn(f.email.value.trim(), f.pw.value).catch(fail); });
  $('#b-signup').addEventListener('click', () => { if (!f.reportValidity()) return; store.signUp(f.email.value.trim(), f.pw.value).catch(fail); });
  $('#b-reset').addEventListener('click', () => {
    if (!f.email.value) { fail({ message: 'Escribe tu email arriba.' }); return; }
    store.resetPassword(f.email.value.trim()).then(() => toast('Te he enviado un email')).catch(fail);
  });
}

// ═════════════════════════ Arranque ═════════════════════════
let loggedIn = false;
store.onChange((s) => { S = s; if (loggedIn) render(); });
store.onError((e) => { console.error(e); toast('Error al guardar: ' + (e.code || e.message)); });

function updateOnline() {
  const el = $('#sync'); el.hidden = navigator.onLine; el.textContent = 'Sin conexión · se sincronizará luego';
}
window.addEventListener('online', updateOnline); window.addEventListener('offline', updateOnline);

store.init((user) => {
  loggedIn = !!user;
  if (!user) { viewLogin(); return; }
  $('#tabbar').hidden = false; updateOnline(); render();
}).catch((e) => {
  console.error(e);
  $('#view').innerHTML = `<div class="card empty"><p>No se pudo cargar Firebase. Comprueba tu conexión o la configuración en <code>firebase-config.js</code>.</p><p class="err">${esc(e.message)}</p></div>`;
});

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
