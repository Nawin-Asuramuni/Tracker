// ============================================================
// FIREBASE KONFIGURATION – deine Zugangsdaten
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, getDocs, doc,
  updateDoc, deleteDoc, onSnapshot, orderBy, query, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBxiDftvsNOfElvrt8hhLaUA0HDoSyuK-g",
  authDomain: "tracking-74513.firebaseapp.com",
  projectId: "tracking-74513",
  storageBucket: "tracking-74513.firebasestorage.app",
  messagingSenderId: "621239887005",
  appId: "1:621239887005:web:5b962abff5c9109a546074",
  measurementId: "G-ZF74396S74"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// ============================================================
// DEFAULT SETTINGS INIT (vor allem anderen)
// ============================================================
(function initDefaultSettings() {
  const existing = JSON.parse(localStorage.getItem('crmSettings') || '{}');
  if (!existing.apptTypes || existing.apptTypes.length === 0) {
    existing.apptTypes = [
      { name: 'Erstgespräch',    color: '#3b82f6', duration: 30 },
      { name: 'Beratungstermin', color: '#a78bfa', duration: 60 },
      { name: 'Folgegespräch',   color: '#22c55e', duration: 20 },
    ];
    localStorage.setItem('crmSettings', JSON.stringify(existing));
  }
})();

// ============================================================
// STATE
// ============================================================
let contacts = [];
let callSlots = [];
let currentContactId = null;
let editingContactId = null;
let editingHistoryContactId = null;
let currentPage = 'dashboard';

// ============================================================
// HELPERS
// ============================================================
function toast(msg, type = 'success') {
  const icon = type === 'success' ? 'ti-check' : 'ti-alert-circle';
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<i class="ti ${icon}"></i> ${msg}`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function fmtDate(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

function statusBadge(status) {
  if (!status) return '<span class="badge badge-neu">—</span>';
  const s = status.toLowerCase();
  let cls = 'badge-neu';
  if (s.includes('kontakt')) cls = 'badge-kontaktiert';
  else if (s.includes('termin')) cls = 'badge-termin';
  else if (s.includes('angebot')) cls = 'badge-angebot';
  else if (s.includes('abgeschlossen') || s.includes('erfolg')) cls = 'badge-abgeschlossen';
  else if (s.includes('absag') || s.includes('nein') || s.includes('verloren')) cls = 'badge-abgesagt';
  return `<span class="badge ${cls}">${status}</span>`;
}

function now() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0,16);
}

// ============================================================
// FIRESTORE DATA LOADING
// ============================================================
async function loadContacts() {
  const q = query(collection(db, 'contacts'), orderBy('createdAt', 'desc'));
  onSnapshot(q, snap => {
    contacts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (currentPage === 'dashboard') renderDashboard();
    if (currentPage === 'contacts') renderContacts();
    if (currentPage === 'calendar') renderCalendar();
    if (currentPage === 'export') renderExport();
  }, err => {
    console.warn('Firestore not connected, using local data:', err.message);
  });
}

async function loadCallSlots() {
  const q = query(collection(db, 'callSlots'), orderBy('datetime', 'asc'));
  onSnapshot(q, snap => {
    callSlots = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (currentPage === 'calendar') renderCalendar();
    // Buchungs-Dialog aktualisieren falls offen
    if (document.getElementById('callSlotModal')?.classList.contains('open')) {
      const step2 = document.getElementById('cs_step2');
      if (step2 && step2.style.display !== 'none') _csRenderCal();
    }
  }, () => {});
}

// ============================================================
// NAVIGATION
// ============================================================
const pages = {
  dashboard: { title: 'Dashboard', render: renderDashboard },
  contacts:  { title: 'Kontakte',  render: renderContacts },
  calendar:  { title: 'Wochenplan', render: renderCalendar },
  export:    { title: 'Export / Monday', render: renderExport },
  settings:  { title: 'Einstellungen', render: renderSettings },
};

function navigate(page) {
  currentPage = page;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  document.getElementById('pageTitle').textContent = pages[page].title;
  closeSidebar();
  pages[page].render();
}

document.querySelectorAll('.nav-item').forEach(n => {
  n.addEventListener('click', e => { e.preventDefault(); navigate(n.dataset.page); });
});

document.getElementById('topAddBtn').addEventListener('click', () => {
  if (currentPage === 'calendar') openCallSlotModal();
  else openContactModal();
});

// ============================================================
// SIDEBAR
// ============================================================
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('overlay').classList.add('show');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlay').classList.remove('show');
}
document.getElementById('menuBtn').addEventListener('click', openSidebar);
document.getElementById('sidebarClose').addEventListener('click', closeSidebar);
document.getElementById('overlay').addEventListener('click', closeSidebar);

// ============================================================
// DASHBOARD
// ============================================================
function renderDashboard() {
  const total = contacts.length;
  const neu = contacts.filter(c => c.status === 'neu').length;
  const termin = contacts.filter(c => c.status === 'termin').length;
  const abgeschlossen = contacts.filter(c => c.status === 'abgeschlossen').length;
  const abgesagt = contacts.filter(c => c.status === 'abgesagt').length;

  const recent = [...contacts].slice(0, 5);

  document.getElementById('content').innerHTML = `
    <div class="stats-grid">
      <div class="stat-card blue"><div class="stat-label">Gesamt</div><div class="stat-value">${total}</div><div class="stat-sub">Kontakte</div></div>
      <div class="stat-card amber"><div class="stat-label">Neu</div><div class="stat-value">${neu}</div><div class="stat-sub">Offen</div></div>
      <div class="stat-card purple"><div class="stat-label">Termine</div><div class="stat-value">${termin}</div><div class="stat-sub">Vereinbart</div></div>
      <div class="stat-card green"><div class="stat-label">Abgeschlossen</div><div class="stat-value">${abgeschlossen}</div><div class="stat-sub">Erfolgreich</div></div>
      <div class="stat-card red"><div class="stat-label">Abgesagt</div><div class="stat-value">${abgesagt}</div><div class="stat-sub">Verloren</div></div>
    </div>

    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
      <h2 style="font-size:15px;font-weight:600;">Letzte Kontakte</h2>
      <button class="btn-ghost" style="font-size:13px;padding:6px 12px;" onclick="navigate('contacts')">Alle anzeigen</button>
    </div>

    ${recent.length === 0 ? `<div class="empty-state"><i class="ti ti-users"></i><p>Noch keine Kontakte. Lege deinen ersten an!</p></div>` : `
    <div class="contacts-table-wrap">
      <table class="contacts-table">
        <thead><tr><th>Name</th><th>Telefon</th><th>Status</th><th>Thema</th><th></th></tr></thead>
        <tbody>
          ${recent.map(c => `
            <tr>
              <td><div class="contact-name">${c.vorname} ${c.nachname}</div><div class="contact-sub">${c.ort || ''}</div></td>
              <td><a class="call-btn" href="tel:${c.telefon}"><i class="ti ti-phone"></i>${c.telefon || '—'}</a></td>
              <td>${statusBadge(c.status)}</td>
              <td style="color:var(--text2);font-size:13px;">${c.thema || '—'}</td>
              <td><button class="btn-icon" onclick="showContact('${c.id}')"><i class="ti ti-eye"></i></button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`}

    <div style="margin-top:24px;display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
      <h2 style="font-size:15px;font-weight:600;">Anrufe diese Woche</h2>
      <button class="btn-ghost" style="font-size:13px;padding:6px 12px;" onclick="navigate('calendar')">Wochenplan öffnen</button>
    </div>
    ${renderCalendarMini()}
  `;
}

function renderCalendarMini() {
  const today = new Date();
  const weekSlots = callSlots.filter(s => {
    const d = new Date(s.datetime);
    const diff = (d - today) / 86400000;
    return diff >= -1 && diff <= 7;
  }).slice(0, 4);

  if (weekSlots.length === 0) return `<p style="color:var(--text3);font-size:14px;">Keine Anrufe geplant. <button class="btn-ghost" style="font-size:13px;padding:4px 10px;" onclick="navigate('calendar')">Einplanen</button></p>`;
  return `<div style="display:flex;flex-direction:column;gap:8px;">${weekSlots.map(s => {
    const contact = contacts.find(c => c.id === s.contactId);
    const name = contact ? `${contact.vorname} ${contact.nachname}` : 'Unbekannt';
    return `<div class="call-slot ${s.type === 'flex' ? 'flex' : ''}" style="display:flex;gap:10px;align-items:center;">
      <i class="ti ti-phone" style="font-size:14px;"></i>
      <span style="flex:1;font-weight:500;">${name}</span>
      <span style="font-size:11px;opacity:0.7;">${fmtDate(s.datetime)}</span>
      ${s.type === 'flex' ? '<span style="font-size:10px;opacity:0.6;">[Flexibel]</span>' : ''}
    </div>`;
  }).join('')}</div>`;
}

// ============================================================
// CONTACTS PAGE
// ============================================================
function renderContacts(filter = '', statusFilter = '') {
  const filtered = contacts.filter(c => {
    const search = `${c.vorname} ${c.nachname} ${c.telefon} ${c.email} ${c.ort} ${c.thema}`.toLowerCase();
    const matchSearch = !filter || search.includes(filter.toLowerCase());
    const matchStatus = !statusFilter || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  document.getElementById('content').innerHTML = `
    <div class="contacts-header">
      <div class="search-box">
        <i class="ti ti-search"></i>
        <input type="text" id="searchInput" placeholder="Suchen..." value="${filter}" />
      </div>
      <select class="filter-select" id="statusFilter">
        <option value="">Alle Status</option>
        ${[...new Set(contacts.map(c => c.status).filter(Boolean))].map(s => `<option value="${s}" ${statusFilter===s?'selected':''}>${s}</option>`).join('')}
      </select>
      <button class="btn-primary" onclick="openContactModal()"><i class="ti ti-plus"></i> Neu</button>
    </div>

    ${filtered.length === 0 ? `<div class="empty-state"><i class="ti ti-user-off"></i><p>Keine Kontakte gefunden.</p></div>` : `
    <div class="contacts-table-wrap">
      <table class="contacts-table">
        <thead><tr><th>Name</th><th>Telefon</th><th>E-Mail</th><th>Thema</th><th>Status</th><th>Quelle</th><th></th></tr></thead>
        <tbody>
          ${filtered.map(c => `
            <tr>
              <td><div class="contact-name">${c.vorname} ${c.nachname}</div><div class="contact-sub">${c.ort || ''}</div></td>
              <td><a class="call-btn" href="tel:${c.telefon}"><i class="ti ti-phone"></i>${c.telefon || '—'}</a></td>
              <td style="font-size:13px;color:var(--text2);">${c.email || '—'}</td>
              <td style="font-size:13px;color:var(--text2);">${c.thema || '—'}</td>
              <td>${statusBadge(c.status)}</td>
              <td style="font-size:12px;color:var(--text3);">${c.quelle || '—'}</td>
              <td style="display:flex;gap:6px;">
                <button class="btn-icon" onclick="showContact('${c.id}')"><i class="ti ti-eye"></i></button>
                <button class="btn-icon" onclick="openContactModal('${c.id}')"><i class="ti ti-edit"></i></button>
                <button class="btn-icon danger" onclick="deleteContact('${c.id}')"><i class="ti ti-trash"></i></button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`}
  `;

  document.getElementById('searchInput').addEventListener('input', e => renderContacts(e.target.value, document.getElementById('statusFilter').value));
  document.getElementById('statusFilter').addEventListener('change', e => renderContacts(document.getElementById('searchInput').value, e.target.value));
}

// ============================================================
// CONTACT DETAIL
// ============================================================
window.showContact = function(id) {
  currentContactId = id;
  const c = contacts.find(x => x.id === id);
  if (!c) return;

  const history = (c.history || []).sort((a,b) => new Date(b.datetime) - new Date(a.datetime));

  document.getElementById('content').innerHTML = `
    <button class="back-btn" onclick="navigate('contacts')"><i class="ti ti-arrow-left"></i> Zurück</button>

    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px;">
      <div>
        <h2 style="font-size:20px;font-weight:600;">${c.vorname} ${c.nachname}</h2>
        <div style="margin-top:4px;">${statusBadge(c.status)}</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <a class="call-btn" href="tel:${c.telefon}"><i class="ti ti-phone"></i> Anrufen</a>
        <button class="btn-ghost" onclick="addHistoryEntry('${c.id}')"><i class="ti ti-history"></i> Eintrag</button>
        <button class="btn-ghost" onclick="openContactModal('${c.id}')"><i class="ti ti-edit"></i> Bearbeiten</button>
        <button class="btn-ghost" onclick="openCallSlotModal('${c.id}')"><i class="ti ti-calendar-plus"></i> Einplanen</button>
        <button class="btn-ghost" onclick="generateBookingLink('${c.id}')" style="color:var(--purple);border-color:rgba(167,139,250,0.4);">
          <i class="ti ti-link"></i> Buchungslink
        </button>
      </div>
    </div>

    <div class="contact-detail">
      <div>
        <div class="detail-card" style="margin-bottom:16px;">
          <h3>Kontaktdaten</h3>
          <div class="detail-row"><span class="detail-key">Telefon</span><span class="detail-val"><a href="tel:${c.telefon}">${c.telefon || '—'}</a></span></div>
          <div class="detail-row"><span class="detail-key">E-Mail</span><span class="detail-val"><a href="mailto:${c.email}">${c.email || '—'}</a></span></div>
          <div class="detail-row"><span class="detail-key">Ort</span><span class="detail-val">${c.ort || '—'}</span></div>
          <div class="detail-row"><span class="detail-key">Thema</span><span class="detail-val">${c.thema || '—'}</span></div>
          <div class="detail-row"><span class="detail-key">Quelle</span><span class="detail-val">${c.quelle || '—'}</span></div>
          ${c.absagegrund ? `<div class="detail-row"><span class="detail-key">Absagegrund</span><span class="detail-val" style="color:var(--red)">${c.absagegrund}</span></div>` : ''}
          ${c.wiedervorlage ? `<div class="detail-row"><span class="detail-key" style="color:var(--purple);">📅 Wiedervorlage</span><span class="detail-val" style="color:var(--purple);font-weight:500;">${fmtDate(c.wiedervorlage)}${c.wvType ? ` · ${c.wvType}` : ''}${c.wvNote ? ` – ${c.wvNote}` : ''}</span></div>` : ''}
        </div>
        ${c.notizen ? `<div class="detail-card">
          <h3>Notizen</h3>
          <p style="font-size:14px;color:var(--text2);line-height:1.6;">${c.notizen}</p>
        </div>` : ''}
      </div>

      <div>
        <div class="detail-card">
          <h3 style="display:flex;align-items:center;justify-content:space-between;">
            Kontaktverlauf
            <button class="btn-icon" onclick="addHistoryEntry('${c.id}')"><i class="ti ti-plus"></i></button>
          </h3>
          ${history.length === 0 ? `<p style="color:var(--text3);font-size:14px;">Noch kein Verlauf.</p>` : `
          <div class="history-list">
            ${history.map(h => `
              <div class="history-item type-${h.type}">
                <div class="history-meta">
                  <span class="history-type">${h.type === 'anruf' ? '📞' : h.type === 'email' ? '📧' : h.type === 'termin' ? '📅' : h.type === 'whatsapp' ? '💬' : '📝'} ${h.type.charAt(0).toUpperCase()+h.type.slice(1)}</span>
                  <span class="history-date">${fmtDate(h.datetime)}</span>
                </div>
                <div class="history-note">${h.note || ''}</div>
                ${h.followup ? `<div class="history-followup"><i class="ti ti-calendar-event"></i> Folgetermin: ${fmtDate(h.followup)}</div>` : ''}
              </div>
            `).join('')}
          </div>`}
        </div>
      </div>
    </div>
  `;
};

// ============================================================
// CONTACT MODAL
// ── Custom mini-calendar picker for Wiedervorlage ──
let _wvPickerYear = null, _wvPickerMonth = null, _wvPickerDay = null;

function initWvPicker(existingIso) {
  const base = existingIso ? new Date(existingIso) : new Date();
  _wvPickerYear  = base.getFullYear();
  _wvPickerMonth = base.getMonth();
  _wvPickerDay   = existingIso ? base.getDate() : null;

  // ── Build day-header row (Mo–So) ──
  const dayHeadersEl = document.getElementById('wv_dayheaders');
  if (dayHeadersEl) {
    dayHeadersEl.innerHTML = ['Mo','Di','Mi','Do','Fr','Sa','So']
      .map(d => `<div style="text-align:center;font-size:10px;color:var(--text3);font-weight:600;padding:2px 0;">${d}</div>`)
      .join('');
  }

  // ── Build hour options (07–19) ──
  const hourSel = document.getElementById('wv_hour');
  if (hourSel && hourSel.options.length === 0) {
    Array.from({length:13}, (_,i) => i+7).forEach(h => {
      const o = document.createElement('option');
      o.value = h; o.textContent = String(h).padStart(2,'0');
      hourSel.appendChild(o);
    });
  }

  // ── Build minute options (00/15/30/45) ──
  const minSel = document.getElementById('wv_minute');
  if (minSel && minSel.options.length === 0) {
    ['00','15','30','45'].forEach(m => {
      const o = document.createElement('option');
      o.value = m; o.textContent = m;
      minSel.appendChild(o);
    });
  }

  if (existingIso) {
    const h = base.getHours(), m = base.getMinutes();
    document.getElementById('wv_hour').value = h >= 7 && h <= 19 ? h : 9;
    // snap minute to nearest 15
    const snap = [0,15,30,45].reduce((a,b) => Math.abs(b-m)<Math.abs(a-m)?b:a, 0);
    document.getElementById('wv_minute').value = String(snap).padStart(2,'0');
  } else {
    document.getElementById('wv_hour').value = 9;
    document.getElementById('wv_minute').value = '00';
  }

  renderWvCalendar();

  // Month nav
  document.getElementById('wv_prevMonth').onclick = () => {
    _wvPickerMonth--; if (_wvPickerMonth < 0) { _wvPickerMonth = 11; _wvPickerYear--; }
    renderWvCalendar();
  };
  document.getElementById('wv_nextMonth').onclick = () => {
    _wvPickerMonth++; if (_wvPickerMonth > 11) { _wvPickerMonth = 0; _wvPickerYear++; }
    renderWvCalendar();
  };

  // Time change → update hidden input
  ['wv_hour','wv_minute'].forEach(id => document.getElementById(id).addEventListener('change', syncWvHidden));
}

function renderWvCalendar() {
  const months = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  document.getElementById('wv_monthLabel').textContent = `${months[_wvPickerMonth]} ${_wvPickerYear}`;

  const firstDow = new Date(_wvPickerYear, _wvPickerMonth, 1).getDay(); // 0=Sun
  const leadingBlanks = firstDow === 0 ? 6 : firstDow - 1; // Monday-first
  const daysInMonth = new Date(_wvPickerYear, _wvPickerMonth + 1, 0).getDate();
  const todayStr = new Date().toDateString();

  let cells = '';
  for (let b = 0; b < leadingBlanks; b++) cells += `<div></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const isSelected = _wvPickerDay === d;
    const isToday = new Date(_wvPickerYear, _wvPickerMonth, d).toDateString() === todayStr;
    const isPast = new Date(_wvPickerYear, _wvPickerMonth, d) < new Date(new Date().setHours(0,0,0,0));
    cells += `<div onclick="window._wvSelectDay(${d})" style="
      text-align:center;padding:5px 2px;border-radius:7px;font-size:13px;cursor:${isPast?'default':'pointer'};
      transition:all .12s;
      background:${isSelected?'var(--accent)':'transparent'};
      color:${isSelected?'#fff':isPast?'var(--text3)':isToday?'var(--accent)':'var(--text)'};
      font-weight:${isSelected||isToday?'600':'400'};
      outline:${isToday&&!isSelected?'1px solid var(--accent)':'none'};
      opacity:${isPast?'0.4':'1'};
    " onmouseover="if(!${isPast}&&!${isSelected})this.style.background='var(--bg2)'" onmouseout="this.style.background='${isSelected?'var(--accent)':'transparent'}'">${d}</div>`;
  }
  document.getElementById('wv_daygrid').innerHTML = cells;
}

window._wvSelectDay = function(d) {
  const isPast = new Date(_wvPickerYear, _wvPickerMonth, d) < new Date(new Date().setHours(0,0,0,0));
  if (isPast) return;
  _wvPickerDay = d;
  renderWvCalendar();
  syncWvHidden();
};

function syncWvHidden() {
  if (!_wvPickerDay) { document.getElementById('f_wiedervorlage').value = ''; document.getElementById('wv_selected_display').textContent = ''; return; }
  const h = document.getElementById('wv_hour').value;
  const m = document.getElementById('wv_minute').value;
  const pad = n => String(n).padStart(2,'0');
  const iso = `${_wvPickerYear}-${pad(_wvPickerMonth+1)}-${pad(_wvPickerDay)}T${pad(h)}:${m}`;
  document.getElementById('f_wiedervorlage').value = iso;
  const display = new Date(iso).toLocaleDateString('de-DE',{weekday:'short',day:'2-digit',month:'short',year:'numeric'});
  document.getElementById('wv_selected_display').textContent = `✓ ${display} ${pad(h)}:${m}`;
}

// ============================================================
window.openContactModal = function(id = null) {
  editingContactId = id;
  const c = id ? contacts.find(x => x.id === id) : null;
  document.getElementById('modalTitle').textContent = id ? 'Kontakt bearbeiten' : 'Kontakt anlegen';

  document.getElementById('f_vorname').value = c?.vorname || '';
  document.getElementById('f_nachname').value = c?.nachname || '';
  document.getElementById('f_telefon').value = c?.telefon || '';
  document.getElementById('f_email').value = c?.email || '';
  document.getElementById('f_ort').value = c?.ort || '';
  document.getElementById('f_thema').value = c?.thema || '';
  document.getElementById('f_quelle').value = c?.quelle || '';
  document.getElementById('f_status').value = c?.status || 'Neu';
  document.getElementById('f_absagegrund').value = c?.absagegrund || '';
  document.getElementById('f_notizen').value = c?.notizen || '';

  // ── Terminarten aus Einstellungen befüllen ──
  const cfg = JSON.parse(localStorage.getItem('crmSettings') || '{}');
  const apptTypes = cfg.apptTypes || [];
  const typeSel = document.getElementById('f_wv_type');
  typeSel.innerHTML = `<option value="">– kein Termin –</option>` +
    apptTypes.map(t =>
      `<option value="${t.name}" data-color="${t.color}" data-duration="${t.duration}" style="color:${t.color};">` +
      `${t.name} (${t.duration} Min.)</option>`
    ).join('') +
    // Immer vorhandene Basis-Optionen falls keine Terminarten definiert
    (apptTypes.length === 0 ? `
      <option value="Anruf">📞 Anruf</option>
      <option value="Termin">📅 Termin (persönlich)</option>
      <option value="E-Mail">📧 E-Mail</option>
      <option value="WhatsApp">💬 WhatsApp</option>` : '');

  // Restore saved value
  if (c?.wvType) typeSel.value = c.wvType;

  document.getElementById('f_wv_note').value = c?.wvNote || '';
  document.getElementById('f_wv_confirm').checked = c?.wvConfirm || false;
  document.getElementById('f_wv_reminder').checked = c?.wvReminder || false;

  // ── Custom picker init ──
  initWvPicker(c?.wiedervorlage || null);

  // ── Show/hide email options ──
  const toggleEmailOptions = () => {
    const type = typeSel.value;
    const show = !!type;
    document.getElementById('f_wv_email_options').style.display = show ? 'block' : 'none';
    if (show && !c) {
      document.getElementById('f_wv_confirm').checked = cfg.autoConfirm || false;
      document.getElementById('f_wv_reminder').checked = cfg.autoReminder || false;
    }
  };
  typeSel.addEventListener('change', toggleEmailOptions);
  toggleEmailOptions();

  document.getElementById('contactModal').classList.add('open');
};



document.getElementById('saveContact').addEventListener('click', async () => {
  const wvType = document.getElementById('f_wv_type').value;
  const data = {
    vorname: document.getElementById('f_vorname').value.trim(),
    nachname: document.getElementById('f_nachname').value.trim(),
    telefon: document.getElementById('f_telefon').value.trim(),
    email: document.getElementById('f_email').value.trim(),
    ort: document.getElementById('f_ort').value.trim(),
    thema: document.getElementById('f_thema').value.trim(),
    quelle: document.getElementById('f_quelle').value,
    status: document.getElementById('f_status').value,
    absagegrund: document.getElementById('f_absagegrund').value.trim(),
    notizen: document.getElementById('f_notizen').value.trim(),
    wiedervorlage: document.getElementById('f_wiedervorlage').value || null,
    wvType: wvType || null,
    wvNote: document.getElementById('f_wv_note').value.trim() || null,
    wvConfirm: (wvType === 'termin' || wvType === 'anruf') ? document.getElementById('f_wv_confirm').checked : false,
    wvReminder: (wvType === 'termin' || wvType === 'anruf') ? document.getElementById('f_wv_reminder').checked : false,
  };

  if (!data.vorname || !data.nachname) { toast('Bitte Vor- und Nachname eingeben.', 'error'); return; }

  // If a Wiedervorlage with email is set, add a history entry and a callSlot
  const wvDate = data.wiedervorlage;
  if (wvDate && wvType) {
    const historyEntry = {
      type: wvType,
      datetime: wvDate,
      note: data.wvNote || 'Wiedervorlage',
      followup: null,
      wvConfirm: data.wvConfirm,
      wvReminder: data.wvReminder,
    };
    // Will be merged into history below after contact id is known
    data._pendingHistory = historyEntry;
  }

  try {
    let contactId = editingContactId;
    if (editingContactId) {
      const existingContact = contacts.find(c => c.id === editingContactId);
      const updatedHistory = existingContact?.history || [];
      if (data._pendingHistory) {
        updatedHistory.push(data._pendingHistory);
      }
      const { _pendingHistory, ...saveData } = data;
      await updateDoc(doc(db, 'contacts', editingContactId), { ...saveData, history: updatedHistory });
      toast('Kontakt aktualisiert!');
    } else {
      const { _pendingHistory, ...saveData } = data;
      saveData.createdAt = serverTimestamp();
      saveData.history = data._pendingHistory ? [data._pendingHistory] : [];
      const ref = await addDoc(collection(db, 'contacts'), saveData);
      contactId = ref.id;
      toast('Kontakt gespeichert!');
    }

    // Create callSlot if Wiedervorlage set
    if (wvDate && wvType && contactId && !contactId.startsWith('local_')) {
      // Dauer aus den Einstellungen lesen (Terminart-spezifisch)
      const s = JSON.parse(localStorage.getItem('crmSettings') || '{}');
      const apptTypeDef = (s.apptTypes || []).find(t => t.name === wvType);
      const apptDuration = apptTypeDef?.duration || 30;

      // ── Kollisionsprüfung ──────────────────────────────────
      const newStart = new Date(wvDate).getTime();
      const newEnd   = newStart + apptDuration * 60000;
      const conflict = callSlots.find(sl => {
        const exStart = new Date(sl.datetime).getTime();
        const exEnd   = exStart + (sl.apptDuration || 30) * 60000;
        return newStart < exEnd && newEnd > exStart;
      });
      if (conflict) {
        const conflictTime = new Date(conflict.datetime).toLocaleString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
        const conflictName = contacts.find(c => c.id === conflict.contactId);
        const nameStr = conflictName ? ` (${conflictName.vorname} ${conflictName.nachname})` : '';
        toast(`⚠️ Zeitkonflikt: Dieser Termin überschneidet sich mit einem bestehenden Termin am ${conflictTime}${nameStr}.`, 'error');
        return;
      }
      // ──────────────────────────────────────────────────────

      const slotDoc = {
        contactId,
        datetime: wvDate,
        type: 'fix',
        note: data.wvNote || '',
        apptType: wvType,
        apptDuration,
        sendConfirm: data.wvConfirm,
        sendReminder: data.wvReminder,
      };
      await addDoc(collection(db, 'callSlots'), slotDoc).catch(() => {});

      // Google Kalender Sync
      const contactForSync = contacts.find(c => c.id === contactId) || { ...data, id: contactId };
      await syncToGoogleCalendar(slotDoc, contactForSync);

      // Sofort-Bestätigung per E-Mail
      if (data.wvConfirm && data.email) {
        sendConfirmationEmail({ ...data, id: contactId }, slotDoc);
      }
    }

    document.getElementById('contactModal').classList.remove('open');
  } catch (e) {
    // Fallback offline
    const localId = 'local_' + Date.now();
    if (editingContactId) {
      const idx = contacts.findIndex(c => c.id === editingContactId);
      if (idx !== -1) {
        const history = [...(contacts[idx].history || [])];
        if (data._pendingHistory) history.push(data._pendingHistory);
        const { _pendingHistory, ...saveData } = data;
        contacts[idx] = { ...contacts[idx], ...saveData, history };
      }
    } else {
      const { _pendingHistory, ...saveData } = data;
      const history = data._pendingHistory ? [data._pendingHistory] : [];
      contacts.unshift({ id: localId, createdAt: new Date().toISOString(), history, ...saveData });
      if (wvDate && wvType) {
        callSlots.push({ id: 'local_cs_' + Date.now(), contactId: localId, datetime: wvDate, type: 'fix', note: data.wvNote || '' });
      }
    }
    toast('Gespeichert (offline).');
    document.getElementById('contactModal').classList.remove('open');
    if (currentPage === 'contacts') renderContacts();
    if (currentPage === 'dashboard') renderDashboard();
  }
});

document.getElementById('closeModal').addEventListener('click', () => document.getElementById('contactModal').classList.remove('open'));
document.getElementById('cancelModal').addEventListener('click', () => document.getElementById('contactModal').classList.remove('open'));

// ============================================================
// HISTORY MODAL
// ============================================================
window.addHistoryEntry = function(contactId) {
  editingHistoryContactId = contactId;
  document.getElementById('h_datetime').value = now();
  document.getElementById('h_followup').value = '';
  document.getElementById('h_note').value = '';
  document.getElementById('h_type').value = 'anruf';
  document.getElementById('h_gcal').checked = false;
  document.getElementById('historyModal').classList.add('open');
};

document.getElementById('saveHistory').addEventListener('click', async () => {
  const entry = {
    type: document.getElementById('h_type').value,
    datetime: document.getElementById('h_datetime').value,
    note: document.getElementById('h_note').value.trim(),
    followup: document.getElementById('h_followup').value || null,
  };

  const c = contacts.find(x => x.id === editingHistoryContactId);
  if (!c) return;

  const history = [...(c.history || []), entry];

  // Google Calendar
  const gcal = document.getElementById('h_gcal').checked;
  if (gcal && entry.followup) {
    const settings = JSON.parse(localStorage.getItem('crmSettings') || '{}');
    openGoogleCalendar(c, entry, settings);
  }

  try {
    await updateDoc(doc(db, 'contacts', editingHistoryContactId), { history, status: c.status });
    toast('Eintrag gespeichert!');
  } catch {
    const idx = contacts.findIndex(x => x.id === editingHistoryContactId);
    if (idx !== -1) contacts[idx].history = history;
    toast('Eintrag gespeichert (offline).');
  }

  document.getElementById('historyModal').classList.remove('open');
  if (currentContactId === editingHistoryContactId) showContact(editingHistoryContactId);
});

document.getElementById('closeHistoryModal').addEventListener('click', () => document.getElementById('historyModal').classList.remove('open'));
document.getElementById('cancelHistoryModal').addEventListener('click', () => document.getElementById('historyModal').classList.remove('open'));

// ============================================================
// GOOGLE CALENDAR – API-Sync
// ============================================================
function openGoogleCalendar(contact, entry, settings) {
  // Fallback: open Google Calendar web UI (used from history modal without API key)
  const title = encodeURIComponent(`Folgetermin: ${contact.vorname} ${contact.nachname} – ${contact.thema || 'Gespräch'}`);
  const start = entry.followup.replace(/[-:T]/g, '').slice(0, 15) + '00Z';
  const end = new Date(new Date(entry.followup).getTime() + 30 * 60000).toISOString().replace(/[-:T]/g, '').slice(0, 15) + '00Z';
  const details = encodeURIComponent(`Kontakt: ${contact.telefon}\n${entry.note || ''}`);
  const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&details=${details}`;
  window.open(url, '_blank');
}

// ============================================================
// TERMIN BENACHRICHTIGUNG – Gmail API (Google OAuth)
// ============================================================

// ICS-Kalender-Datei generieren
function generateICS(contact, slotData) {
  const dt = new Date(slotData.datetime);
  const dtEnd = new Date(dt.getTime() + (slotData.apptDuration || 30) * 60000);

  const pad = n => String(n).padStart(2, '0');
  const fmt = d => `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
  const uid = `termin-${Date.now()}@leadtracker`;

  const s = JSON.parse(localStorage.getItem('crmSettings') || '{}');
  const organizer = s.gmailSender || s.myEmail || 'nawin.telis@gmail.com';
  const title = `${slotData.apptType || 'Termin'}: ${contact.vorname} ${contact.nachname}`.trim();
  const desc = (slotData.note || '').replace(/\n/g, '\\n');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LeadTracker//DE',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTART:${fmt(dt)}`,
    `DTEND:${fmt(dtEnd)}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${desc}`,
    `ORGANIZER;CN=Nawin:mailto:${organizer}`,
    contact.email ? `ATTENDEE;CN=${contact.vorname} ${contact.nachname};RSVP=TRUE:mailto:${contact.email}` : '',
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    'DESCRIPTION:Terminerinnerung',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
}

// Gmail OAuth Token holen – stille Erneuerung, Pop-up nur beim ersten Mal
async function getGmailToken() {
  const s = JSON.parse(localStorage.getItem('crmSettings') || '{}');
  const clientId = s.gcalOAuthClientId || '';
  const senderEmail = s.gmailSender || 'nawin.telis@gmail.com';
  if (!clientId) return null;

  const cacheKey = 'gmailOAuthToken';

  // Gecachten Token verwenden, wenn noch > 2 Minuten gültig
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
    if (cached && cached.expires > Date.now() + 120000) return cached.token;
  } catch {}

  // Hilfsfunktion: Token anfordern (silent oder mit Pop-up)
  const requestToken = (promptMode) => new Promise((resolve) => {
    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/gmail.send',
      hint: senderEmail,
      callback: (resp) => {
        if (resp.error || !resp.access_token) { resolve(null); return; }
        localStorage.setItem(cacheKey, JSON.stringify({
          token: resp.access_token,
          expires: Date.now() + ((resp.expires_in || 3600) * 1000),
        }));
        resolve(resp.access_token);
      },
      error_callback: () => resolve(null),
    });
    tokenClient.requestAccessToken({ prompt: promptMode });
  });

  const doRequest = async () => {
    // Erst lautlos versuchen (kein Pop-up)
    const silentToken = await requestToken('none');
    if (silentToken) return silentToken;
    // Falls stille Erneuerung scheitert → einmalig Pop-up
    return await requestToken('');
  };

  if (typeof google !== 'undefined' && google?.accounts?.oauth2) {
    return await doRequest();
  } else {
    return new Promise((resolve) => {
      const sc = document.createElement('script');
      sc.src = 'https://accounts.google.com/gsi/client';
      sc.onload = () => doRequest().then(resolve);
      sc.onerror = () => resolve(null);
      document.head.appendChild(sc);
    });
  }
}

// E-Mail als RFC 2822 bauen und als base64url kodieren (für Gmail API)
// inlineImage: { cid, base64DataUrl } – wird als Inline-Bild eingebettet
function buildGmailMessage(to, toName, from, subject, htmlBody, icsContent, inlineImage) {
  const outerBoundary = `outer_${Date.now()}`;
  const relBoundary  = `related_${Date.now() + 1}`;

  // Wenn ein Inline-Bild vorhanden: multipart/related um html+bild, dann multipart/mixed drum herum
  // Sonst: einfach multipart/mixed
  let htmlPart;
  if (inlineImage) {
    // Bild-Daten: aus "data:image/xxx;base64,XXXX" nur den Base64-Teil nehmen
    const b64 = inlineImage.base64DataUrl.split(',')[1] || '';
    const mime = (inlineImage.base64DataUrl.match(/^data:(image\/[^;]+);/) || [])[1] || 'image/png';
    htmlPart = [
      `--${relBoundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      htmlBody,
      '',
      `--${relBoundary}`,
      `Content-Type: ${mime}`,
      'Content-Transfer-Encoding: base64',
      `Content-ID: <${inlineImage.cid}>`,
      'Content-Disposition: inline',
      '',
      b64,
      '',
      `--${relBoundary}--`,
    ].join('\r\n');
    htmlPart = [
      `Content-Type: multipart/related; boundary="${relBoundary}"`,
      '',
      htmlPart,
    ].join('\r\n');
  } else {
    htmlPart = [
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      htmlBody,
    ].join('\r\n');
  }

  const parts = [
    `From: ${from}`,
    `To: ${toName} <${to}>`,
    `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${outerBoundary}"`,
    '',
    `--${outerBoundary}`,
    htmlPart,
    '',
  ];

  if (icsContent) {
    const icsBase64 = btoa(unescape(encodeURIComponent(icsContent)));
    parts.push(
      `--${outerBoundary}`,
      'Content-Type: text/calendar; method=REQUEST; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      'Content-Disposition: attachment; filename="Termin.ics"',
      '',
      icsBase64,
      '',
    );
  }

  parts.push(`--${outerBoundary}--`);

  const raw = parts.join('\r\n');
  return btoa(unescape(encodeURIComponent(raw)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Hauptfunktion: E-Mail über Gmail versenden
async function sendConfirmationEmail(contact, slotData) {
  const s = JSON.parse(localStorage.getItem('crmSettings') || '{}');

  if (!contact?.email) {
    toast('⚠️ Kein E-Mail für diesen Kontakt hinterlegt.', 'error');
    return;
  }

  const from = s.gmailSender || 'nawin.telis@gmail.com';
  const dt = new Date(slotData.datetime);
  const datum = dt.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const uhrzeit = dt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

  const subject = (s.confirmSubject || 'Terminbestätigung – {datum}')
    .replace('{datum}', datum).replace('{uhrzeit}', uhrzeit);

  const bodyText = (s.emailConfirmText ||
`Hallo {vorname},

hiermit bestätige ich unseren gemeinsamen Termin am {datum} um {uhrzeit} Uhr.

Im Anhang findest du eine Kalender-Datei – einfach anklicken und der Termin wird direkt in deinen Kalender eingetragen.

Bei Fragen stehe ich dir gerne zur Verfügung.

{signatur}`)
    .replace(/{vorname}/g, contact.vorname || '')
    .replace(/{nachname}/g, contact.nachname || '')
    .replace(/{datum}/g, datum)
    .replace(/{uhrzeit}/g, uhrzeit)
    .replace(/{signatur}/g, s.emailSig || '');

  // Bild inline einbetten: {bild} → <img src="cid:sigimage"> als MIME-Part
  const sigImageBase64 = s.emailSigImage || '';
  const hasSigImage = !!sigImageBase64 && bodyText.includes('{bild}');
  const sigImageCid = 'sigimage@leadtracker';

  // Signaturtext: {bild} durch img-Tag ersetzen (für htmlBody), oder entfernen (kein Bild)
  const htmlBodyRaw = bodyText
    .replace(/{bild}/g, hasSigImage ? `<img src="cid:${sigImageCid}" style="max-height:80px;max-width:200px;display:block;margin-top:6px;" alt="Signatur" />` : '')
    .replace(/\n/g, '<br>');
  const htmlBody = htmlBodyRaw;

  const icsContent = generateICS(contact, slotData);

  toast(`📧 E-Mail wird über Gmail gesendet...`);

  const token = await getGmailToken();
  if (!token) {
    toast('⚠️ Gmail-Login fehlgeschlagen – Mailclient wird als Fallback geöffnet.', 'error');
    const mailtoUrl = `mailto:${contact.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`;
    window.open(mailtoUrl, '_blank');
    return;
  }

  const rawMessage = buildGmailMessage(
    contact.email,
    `${contact.vorname} ${contact.nachname}`,
    from,
    subject,
    htmlBody,
    slotData.withIcs !== false ? icsContent : null,
    hasSigImage ? { cid: sigImageCid, base64DataUrl: sigImageBase64 } : null
  );

  try {
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: rawMessage }),
    });

    if (res.ok) {
      toast(`✅ Terminbestätigung an ${contact.vorname} gesendet – inkl. Kalender-Einladung!`, 'success');
    } else {
      const err = await res.json().catch(() => ({}));
      if (res.status === 401) {
        localStorage.removeItem('gmailOAuthToken');
        toast('🔄 Token abgelaufen – bitte erneut versuchen.', 'error');
      } else {
        toast(`❌ Gmail Fehler: ${err?.error?.message || res.status}`, 'error');
      }
    }
  } catch (e) {
    console.error('Gmail Sendefehler:', e);
    toast('❌ Verbindungsfehler beim E-Mail-Versand.', 'error');
  }
}

// ============================================================
// GOOGLE OAUTH – Termine automatisch eintragen
// ============================================================
async function getGCalOAuthToken(hint) {
  const s = JSON.parse(localStorage.getItem('crmSettings') || '{}');
  const clientId = s.gcalOAuthClientId || '';
  if (!clientId) return null;

  const cacheKey = 'gcalOAuthToken_' + hint;
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
    if (cached && cached.expires > Date.now() + 60000) return cached.token;
  } catch {}

  return new Promise((resolve) => {
    const doRequest = () => {
      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/calendar.events',
        hint,
        callback: (resp) => {
          if (resp.error || !resp.access_token) { resolve(null); return; }
          localStorage.setItem(cacheKey, JSON.stringify({
            token: resp.access_token,
            expires: Date.now() + (resp.expires_in * 1000),
          }));
          resolve(resp.access_token);
        },
      });
      tokenClient.requestAccessToken({ prompt: '' });
    };
    if (typeof google !== 'undefined' && google?.accounts?.oauth2) {
      doRequest();
    } else {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.onload = doRequest;
      s.onerror = () => resolve(null);
      document.head.appendChild(s);
    }
  });
}

async function syncToGoogleCalendar(slotData, contactData) {
  const s = JSON.parse(localStorage.getItem('crmSettings') || '{}');

  const start = new Date(slotData.datetime);
  const end = new Date(start.getTime() + (slotData.apptDuration || 30) * 60000);

  const event = {
    summary: `${slotData.apptType || 'Termin'}: ${contactData?.vorname || ''} ${contactData?.nachname || ''}`.trim(),
    description: [slotData.note || '', contactData?.telefon ? `Tel: ${contactData.telefon}` : ''].filter(Boolean).join('\n'),
    start: { dateTime: start.toISOString(), timeZone: 'Europe/Berlin' },
    end:   { dateTime: end.toISOString(),   timeZone: 'Europe/Berlin' },
    reminders: {
      useDefault: false,
      overrides: [{ method: 'popup', minutes: 30 }],
    },
  };

  const calendars = [
    { id: s.gcalId,  email: s.gcalId  },
    { id: s.gcalId2, email: s.gcalId2 },
  ].filter(c => c.id);
  if (calendars.length === 0) return;

  let successCount = 0;
  const gcalEventIds = {};
  for (const cal of calendars) {
    const token = await getGCalOAuthToken(cal.email);
    if (!token) continue;
    try {
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(event) }
      );
      if (res.ok) {
        successCount++;
        const created = await res.json();
        if (created.id) gcalEventIds[cal.id] = created.id;
      } else {
        const err = await res.json();
        console.warn(`GCal Fehler (${cal.id}):`, err);
        if (res.status === 401) localStorage.removeItem('gcalOAuthToken_' + cal.email);
      }
    } catch(e) { console.warn('GCal sync error:', e.message); }
  }

  if (successCount > 0) {
    toast(`✅ In ${successCount > 1 ? 'beiden Google Kalendern' : 'Google Kalender'} eingetragen (⏰ 30 Min. Erinnerung)!`, 'success');
    if (Object.keys(gcalEventIds).length > 0 && slotData.firestoreId) {
      try {
        await updateDoc(doc(db, 'callSlots', slotData.firestoreId), { gcalEventIds });
      } catch(e) { console.warn('gcalEventIds speichern fehlgeschlagen:', e.message); }
    }
    setTimeout(() => loadGoogleCalendarEvents(), 1500);
  } else {
    openGoogleCalendar(
      { vorname: contactData?.vorname||'', nachname: contactData?.nachname||'', telefon: contactData?.telefon||'', thema: slotData.apptType||'' },
      { followup: slotData.datetime, note: slotData.note }, s
    );
  }
}

// ============================================================
// GOOGLE CALENDAR IMPORT – Termine aus beiden Kalendern lesen
// ============================================================
let googleCalendarEvents = [];

async function loadGoogleCalendarEvents() {
  const s = JSON.parse(localStorage.getItem('crmSettings') || '{}');
  if (!s.gcalKey) return;

  const calendars = [
    { id: s.gcalId,  key: s.gcalKey,  label: 'Kalender 1' },
    { id: s.gcalId2, key: s.gcalKey2, label: 'Kalender 2' },
  ].filter(c => c.id && c.key);
  if (calendars.length === 0) return;

  const now = new Date();
  const timeMin = encodeURIComponent(new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString());
  const timeMax = encodeURIComponent(new Date(now.getFullYear(), now.getMonth() + 3, 0).toISOString());

  googleCalendarEvents = [];

  for (const cal of calendars) {
    const calId = cal.id;
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events?key=${cal.key}&timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime&maxResults=100`;
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const events = (data.items || []).map(e => ({
          id: e.id,
          title: e.summary || '(kein Titel)',
          datetime: e.start?.dateTime || e.start?.date || '',
          end: e.end?.dateTime || e.end?.date || '',
          calendarId: calId,
          calendarLabel: cal.label,
          source: 'google',
          htmlLink: e.htmlLink,
        }));
        googleCalendarEvents.push(...events);
      }
    } catch(e) {
      console.warn(`Google Calendar Import fehlgeschlagen (${calId}):`, e.message);
    }
  }

  // Re-render calendar if open
  if (currentPage === 'calendar') renderCalendar();

  // Buchungs-Dialog aktualisieren falls offen (GCal-Termine jetzt verfügbar)
  if (document.getElementById('callSlotModal')?.classList.contains('open')) {
    const step2 = document.getElementById('cs_step2');
    if (step2 && step2.style.display !== 'none') _csRenderCal();
  }
}

// ============================================================
// CALENDAR PAGE
// ============================================================
let calWeekOffset = 0;

window.setCalWeekOffset = function(w) {
  calWeekOffset = w;
  renderCalendar();
};

window.calPrevWeek = function() {
  calWeekOffset--;
  renderCalendar();
};

window.calNextWeek = function() {
  calWeekOffset++;
  renderCalendar();
};

window.calGoToday = function() {
  calWeekOffset = 0;
  renderCalendar();
};

function renderCalendar() {
  const s = JSON.parse(localStorage.getItem('crmSettings') || '{}');
  const availDays = s.availDays || [1,2,3,4,5];
  const blockedDates = s.blockedDates || [];
  const dayConfigs = s.dayConfigs || {};

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const baseMon = new Date(today);
  const dow = today.getDay() === 0 ? 6 : today.getDay() - 1;
  baseMon.setDate(today.getDate() - dow);
  const monday = new Date(baseMon);
  monday.setDate(baseMon.getDate() + calWeekOffset * 7);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i); return d;
  });

  const names = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const weekStr = `${monday.toLocaleDateString('de-DE', { day:'2-digit', month:'long' })} – ${days[6].toLocaleDateString('de-DE', { day:'2-digit', month:'long', year:'numeric' })}`;
  const weekLabel = calWeekOffset === 0 ? 'Diese Woche' : calWeekOffset === 1 ? 'Nächste Woche' : calWeekOffset === 2 ? 'Übernächste Woche' : calWeekOffset < 0 ? `${Math.abs(calWeekOffset)} Woche${Math.abs(calWeekOffset)>1?'n':''} zurück` : `+${calWeekOffset} Wochen`;

  const slotsByDay = days.map(d => callSlots.filter(sl => {
    const slStart = new Date(sl.datetime);
    const slEnd = new Date(slStart.getTime() + (sl.apptDuration || 30) * 60000);
    const dStart = new Date(d); dStart.setHours(0,0,0,0);
    const dEnd = new Date(d); dEnd.setHours(23,59,59,999);
    return slStart <= dEnd && slEnd > dStart;
  }));

  // All-day events (date-only string, no 'T') shown in banner row
  const gcalAllDay = days.map(d => googleCalendarEvents.filter(e => {
    if (!e.datetime || e.datetime.includes('T')) return false;
    const eStart = new Date(e.datetime + 'T00:00:00');
    const eEnd = e.end ? new Date(e.end + 'T00:00:00') : new Date(eStart.getTime() + 86400000);
    const dMid = new Date(d); dMid.setHours(12,0,0,0);
    return eStart <= dMid && eEnd > dMid;
  }));

  // Timed events: appear on every day they span
  const gcalByDay = days.map(d => googleCalendarEvents.filter(e => {
    if (!e.datetime || !e.datetime.includes('T')) return false;
    const eStart = new Date(e.datetime);
    const eEnd = e.end && e.end.includes('T') ? new Date(e.end) : new Date(eStart.getTime() + 30*60000);
    const dStart = new Date(d); dStart.setHours(0,0,0,0);
    const dEnd = new Date(d); dEnd.setHours(23,59,59,999);
    return eStart <= dEnd && eEnd > dStart;
  }));
  const totalWeek = slotsByDay.reduce((a, b) => a + b.length, 0);

  // Compute global earliest start and latest end across all active days
  function timeToMinutes(t) {
    if (!t) return null;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }
  function minutesToTime(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }

  let globalStart = null;
  let globalEnd = null;

  days.forEach((d, i) => {
    const dayNum = d.getDay();
    const isUnavailable = !availDays.includes(dayNum);
    const dateStr = d.toISOString().slice(0,10);
    const isBlocked = blockedDates.includes(dateStr);
    if (isUnavailable || isBlocked) return;
    const dc = dayConfigs[dayNum] || {};
    const startMin = timeToMinutes(dc.start || '09:00');
    const endMin = timeToMinutes(dc.end || '18:00');
    if (globalStart === null || startMin < globalStart) globalStart = startMin;
    if (globalEnd === null || endMin > globalEnd) globalEnd = endMin;
    // Also consider actual slot times
    slotsByDay[i].forEach(sl => {
      const slDate = new Date(sl.datetime);
      const slMin = slDate.getHours() * 60 + slDate.getMinutes();
      const slEndMin = slMin + (sl.apptDuration || 30);
      if (slMin < globalStart) globalStart = slMin;
      if (slEndMin > globalEnd) globalEnd = slEndMin;
    });
  });

  // Fallback if no available days
  if (globalStart === null) { globalStart = 9 * 60; globalEnd = 18 * 60; }

  // Round to 30-min boundaries
  globalStart = Math.floor(globalStart / 30) * 30;
  globalEnd = Math.ceil(globalEnd / 30) * 30;

  // Generate time slots array (30-min increments)
  const timeSlots = [];
  for (let t = globalStart; t < globalEnd; t += 30) {
    timeSlots.push(t);
  }

  const ROW_HEIGHT = 44; // px per 30-min slot
  const HEADER_HEIGHT = 72; // px for day header

  document.getElementById('content').innerHTML = `
    <!-- Header -->
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;flex-wrap:wrap;">
      <button onclick="calPrevWeek()" class="btn-ghost" style="padding:8px 14px;font-size:14px;display:flex;align-items:center;gap:6px;" title="Vorherige Woche">
        <i class="ti ti-chevron-left"></i> Zurück
      </button>
      <div style="flex:1;min-width:0;text-align:center;">
        <div style="font-size:18px;font-weight:700;">${weekStr}</div>
        <div style="font-size:13px;color:var(--text3);margin-top:2px;">${weekLabel} · ${totalWeek} Termin${totalWeek!==1?'e':''}</div>
      </div>
      <button onclick="calNextWeek()" class="btn-ghost" style="padding:8px 14px;font-size:14px;display:flex;align-items:center;gap:6px;" title="Nächste Woche">
        Vor <i class="ti ti-chevron-right"></i>
      </button>
      <button class="btn-primary" onclick="openCallSlotModal()"><i class="ti ti-plus"></i> Einplanen</button>
    </div>

    <!-- Week nav pills -->
    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;align-items:center;">
      ${[-1,0,1,2].map(w => {
        const active = calWeekOffset === w;
        const lbl = w === -1 ? '← Letzte Woche' : w === 0 ? 'Diese Woche' : w === 1 ? 'Nächste Woche' : 'Übernächste Woche';
        return `<button onclick="setCalWeekOffset(${w})"
          style="font-size:13px;padding:7px 16px;border-radius:20px;border:1.5px solid ${active?'var(--accent)':'var(--border2)'};
          background:${active?'rgba(59,130,246,0.15)':'var(--surface)'};color:${active?'var(--accent)':'var(--text2)'};
          cursor:pointer;transition:all .15s;font-weight:${active?'600':'400'};
          box-shadow:${active?'0 0 0 3px rgba(59,130,246,0.15)':'none'};">${lbl}</button>`;
      }).join('')}
      ${calWeekOffset !== 0 ? `<button onclick="calGoToday()" style="font-size:13px;padding:7px 16px;border-radius:20px;border:1.5px solid var(--border2);background:var(--surface);color:var(--text2);cursor:pointer;margin-left:auto;"><i class="ti ti-calendar-event"></i> Heute</button>` : ''}
    </div>

    <!-- Timeline grid -->
    <div style="overflow-x:auto;overflow-y:auto;max-height:75vh;">
      <div style="display:grid;grid-template-columns:52px repeat(7,minmax(110px,1fr));min-width:830px;position:relative;">

        <!-- Corner cell -->
        <div style="position:sticky;top:0;z-index:10;background:var(--bg);border-bottom:2px solid var(--border);height:${HEADER_HEIGHT}px;"></div>

        <!-- Day headers -->
        ${days.map((d, i) => {
          const isToday = d.toDateString() === new Date().toDateString();
          const dayNum = d.getDay();
          const isUnavailable = !availDays.includes(dayNum);
          const dateStr = d.toISOString().slice(0,10);
          const isBlocked = blockedDates.includes(dateStr);
          return `
          <div style="
            position:sticky;top:0;z-index:10;
            height:${HEADER_HEIGHT}px;
            background:${isToday ? 'rgba(59,130,246,0.1)' : 'var(--bg)'};
            border-bottom:2px solid ${isToday ? 'var(--accent)' : 'var(--border)'};
            border-left:1px solid var(--border);
            padding:10px 10px 8px;
            display:flex;flex-direction:column;justify-content:center;
            ${isUnavailable||isBlocked ? 'opacity:0.4;' : ''}
          ">
            <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:${isToday?'var(--accent)':'var(--text3)'};">${names[i]}</div>
            <div style="font-size:28px;font-weight:900;color:${isToday?'var(--accent)':'var(--text)'};line-height:1.05;margin-top:1px;">${d.getDate()}</div>
            <div style="font-size:11px;color:var(--text3);margin-top:1px;">${d.toLocaleDateString('de-DE',{month:'short',year:'numeric'})}${isBlocked?' · 🚫':isUnavailable?' · –':''}</div>
          </div>`;
        }).join('')}

        <!-- All-day events banner row -->
        <div style="font-size:10px;color:var(--text3);padding:4px 4px;text-align:right;border-bottom:1px solid var(--border);background:var(--bg);position:sticky;top:${HEADER_HEIGHT}px;z-index:9;display:flex;align-items:center;justify-content:flex-end;">ganztägig</div>
        ${days.map((d, i) => {
          const allDayHere = gcalAllDay[i];
          return `<div style="
            border-left:1px solid var(--border);
            border-bottom:1px solid var(--border);
            background:var(--bg);
            position:sticky;top:${HEADER_HEIGHT}px;z-index:9;
            min-height:24px;padding:2px 4px;display:flex;flex-direction:column;gap:2px;
          ">${allDayHere.map(e => {
            const color = e.calendarLabel === 'Kalender 2' ? '#10b981' : '#f97316';
            return `<div title="${e.title}" onclick="window.open('${e.htmlLink||''}','_blank')" style="
              background:${color}33;border-left:3px solid ${color};border-radius:4px;
              padding:1px 5px;font-size:10px;font-weight:600;color:${color};
              cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
            ">${e.title}</div>`;
          }).join('')}</div>`;
        }).join('')}

        <!-- Time labels + rows -->
        ${timeSlots.map((slotMin, rowIdx) => {
          const isHour = slotMin % 60 === 0;
          const timeLabel = minutesToTime(slotMin);

          // Time label cell
          const timeLabelCell = `
          <div style="
            height:${ROW_HEIGHT}px;
            display:flex;align-items:flex-start;justify-content:flex-end;
            padding-right:8px;padding-top:4px;
            position:relative;
          ">
            ${isHour ? `<span style="font-size:11px;font-weight:600;color:var(--text3);white-space:nowrap;">${timeLabel}</span>` : `<span style="font-size:10px;color:var(--border2);white-space:nowrap;">${timeLabel}</span>`}
          </div>`;

          // Day columns for this row
          const dayCells = days.map((d, i) => {
            const dayNum = d.getDay();
            const isUnavailable = !availDays.includes(dayNum);
            const dateStr = d.toISOString().slice(0,10);
            const isBlocked = blockedDates.includes(dateStr);
            const isToday = d.toDateString() === new Date().toDateString();
            const dc = dayConfigs[dayNum] || {};
            const dayStartMin = timeToMinutes(dc.start || '09:00');
            const dayEndMin = timeToMinutes(dc.end || '18:00');
            const breakStartMin = dc.breakStart ? timeToMinutes(dc.breakStart) : null;
            const breakEndMin = dc.breakEnd ? timeToMinutes(dc.breakEnd) : null;

            const inWorkHours = !isUnavailable && !isBlocked && slotMin >= dayStartMin && slotMin < dayEndMin;
            const inBreak = inWorkHours && breakStartMin !== null && slotMin >= breakStartMin && slotMin < breakEndMin;

            // Find slots that START in this time cell
            const slotsHere = slotsByDay[i].filter(sl => {
              const slDate = new Date(sl.datetime);
              const slMin = slDate.getHours() * 60 + slDate.getMinutes();
              return slMin >= slotMin && slMin < slotMin + 30;
            });

            let cellBg = 'transparent';
            if (isUnavailable || isBlocked) cellBg = 'rgba(0,0,0,0.03)';
            else if (inBreak) cellBg = 'rgba(245,158,11,0.07)';
            else if (inWorkHours) cellBg = isToday ? 'rgba(59,130,246,0.03)' : 'rgba(255,255,255,0.01)';

            const clickIso = (() => {
              const dd = new Date(d);
              dd.setHours(Math.floor(slotMin/60), slotMin%60, 0, 0);
              return dd.toISOString();
            })();

            // Google Calendar events in this cell
            // For multi-day events, on continuation days show from globalStart
            const gcalHere = gcalByDay[i].filter(e => {
              if (!e.datetime) return false;
              const eDate = new Date(e.datetime);
              const isSameDay = eDate.toDateString() === d.toDateString();
              if (isSameDay) {
                // Start day: show at actual start time
                const eMin = eDate.getHours() * 60 + eDate.getMinutes();
                return eMin >= slotMin && eMin < slotMin + 30;
              } else {
                // Continuation day: show at the very first time slot (globalStart)
                return slotMin === globalStart;
              }
            });

            return `
            <div style="
              height:${ROW_HEIGHT}px;
              background:${cellBg};
              border-left:1px solid var(--border);
              border-bottom:1px solid ${isHour ? 'var(--border)' : 'rgba(255,255,255,0.04)'};
              position:relative;
              ${isUnavailable||isBlocked ? 'opacity:0.35;' : ''}
            ">
              ${inBreak && !slotsHere.length ? `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--text3);opacity:0.6;">🍽</div>` : ''}
              ${gcalHere.map(e => {
                const eDate = new Date(e.datetime);
                const eEndDate = e.end && e.end.includes('T') ? new Date(e.end) : new Date(eDate.getTime() + 30*60000);
                const gcalColor = e.calendarLabel === 'Kalender 2' ? '#10b981' : '#f97316';
                const isSameDay = eDate.toDateString() === d.toDateString();
                const isMultiDay = eDate.toDateString() !== eEndDate.toDateString();

                // Clamp display to this day's visible range
                const dayVisStart = new Date(d); dayVisStart.setHours(Math.floor(globalStart/60), globalStart%60, 0, 0);
                const dayVisEnd = new Date(d); dayVisEnd.setHours(Math.floor(globalEnd/60), globalEnd%60, 0, 0);
                const dispStart = isSameDay ? eDate : dayVisStart;
                const dispEnd = eEndDate.toDateString() === d.toDateString() ? eEndDate : dayVisEnd;

                const startMin = dispStart.getHours() * 60 + dispStart.getMinutes();
                const endMin = dispEnd.getHours() * 60 + dispEnd.getMinutes();
                const durMin = Math.max(30, endMin - startMin);
                const slotCount = Math.ceil(durMin / 30);
                const heightPx = slotCount * ROW_HEIGHT - 4;
                const offsetPx = ((startMin - slotMin) / 30) * ROW_HEIGHT;

                const continuesPrev = !isSameDay;
                const continuesNext = eEndDate.toDateString() !== d.toDateString() && eEndDate > dayVisEnd;

                const timeLabel = continuesPrev
                  ? `↩ seit ${eDate.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'})}`
                  : eDate.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
                const endSuffix = continuesNext ? ' →' : '';

                return `
                <div title="${e.title} (${e.calendarLabel})" style="
                  position:absolute;
                  top:${offsetPx + 2}px;
                  left:3px;right:3px;
                  height:${heightPx}px;
                  background:${gcalColor}22;
                  border-left:3px solid ${gcalColor};
                  border-top:${continuesPrev ? '2px dashed ' + gcalColor : 'none'};
                  border-radius:${continuesPrev ? '0 4px 4px 0' : continuesNext ? '6px 6px 0 0' : '6px'};
                  padding:3px 6px;
                  cursor:pointer;
                  overflow:hidden;
                  z-index:1;
                  box-shadow:0 1px 4px rgba(0,0,0,0.1);
                  transition:opacity .15s;
                " onmouseover="this.style.opacity='.8';this.querySelector('.gcal-del')&&(this.querySelector('.gcal-del').style.display='flex')" onmouseout="this.style.opacity='1';this.querySelector('.gcal-del')&&(this.querySelector('.gcal-del').style.display='none')">
                  <div onclick="window.open('${e.htmlLink||''}','_blank')" style="min-width:0;">
                    <div style="font-size:10px;font-weight:600;color:${gcalColor};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                      ${timeLabel}${endSuffix} · ${e.calendarLabel}
                    </div>
                    <div style="font-size:11px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500;margin-top:1px;">${e.title}</div>
                  </div>
                  <button class="gcal-del" onclick="event.stopPropagation();deleteGCalEventDirect('${e.id}','${e.calendarId}','${e.calendarLabel}')" style="
                    display:none;position:absolute;top:3px;right:3px;
                    background:rgba(239,68,68,0.15);border:none;border-radius:4px;
                    color:#ef4444;cursor:pointer;padding:2px 5px;font-size:12px;
                    align-items:center;justify-content:center;
                  " title="Aus Google Kalender löschen"><i class="ti ti-trash"></i></button>
                </div>`;
              }).join('')}
              ${slotsHere.map(sl => {
                const c = contacts.find(x => x.id === sl.contactId);
                const name = c ? `${c.vorname} ${c.nachname}` : '?';
                const color = sl.apptColor || (sl.type === 'flex' ? '#f59e0b' : '#3b82f6');
                const slDate = new Date(sl.datetime);
                const slMin = slDate.getHours() * 60 + slDate.getMinutes();
                const dur = sl.apptDuration || 30;
                const slotCount = Math.max(1, dur / 30);
                const heightPx = slotCount * ROW_HEIGHT - 4;
                const offsetPx = ((slMin - slotMin) / 30) * ROW_HEIGHT;
                return `
                <div title="${sl.note || name}" style="
                  position:absolute;
                  top:${offsetPx + 2}px;
                  left:3px;right:3px;
                  height:${heightPx}px;
                  background:${color}22;
                  border-left:3px solid ${color};
                  border-radius:6px;
                  padding:3px 6px;
                  cursor:pointer;
                  overflow:hidden;
                  z-index:2;
                  transition:opacity .15s;
                  box-shadow:0 1px 4px rgba(0,0,0,0.15);
                " onmouseover="this.style.opacity='.85';this.querySelector('.slot-del')&&(this.querySelector('.slot-del').style.display='flex')" onmouseout="this.style.opacity='1';this.querySelector('.slot-del')&&(this.querySelector('.slot-del').style.display='none')">
                  <div onclick="showContact('${sl.contactId||''}')" style="min-width:0;">
                    <div style="font-size:11px;font-weight:700;color:${color};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${new Date(sl.datetime).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})}${sl.apptType?' · '+sl.apptType:''}</div>
                    <div style="font-size:12px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500;margin-top:1px;">${name}</div>
                  </div>
                  <button class="slot-del" onclick="event.stopPropagation();deleteCallSlot('${sl.id}')" style="
                    display:none;position:absolute;top:3px;right:3px;
                    background:rgba(239,68,68,0.15);border:none;border-radius:4px;
                    color:#ef4444;cursor:pointer;padding:2px 5px;font-size:12px;
                    align-items:center;justify-content:center;
                  " title="Termin löschen"><i class="ti ti-trash"></i></button>
                </div>`;
              }).join('')}
              ${inWorkHours && !inBreak && !slotsHere.length ? `
              <div onclick="openCallSlotModalForDate('${clickIso}')" style="
                position:absolute;inset:1px 2px;border-radius:4px;cursor:pointer;opacity:0;
                background:var(--accent);transition:opacity .12s;
                display:flex;align-items:center;justify-content:center;
              " onmouseover="this.style.opacity='.08'" onmouseout="this.style.opacity='0'" title="${timeLabel} – Termin anlegen">
              </div>` : ''}
            </div>`;
          }).join('');

          return timeLabelCell + dayCells;
        }).join('')}
      </div>
    </div>

    <!-- Legend -->
    <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:16px;padding:12px 16px;background:var(--surface);border:1px solid var(--border);border-radius:12px;align-items:center;">
      <span style="font-size:13px;color:var(--text3);font-weight:600;">Legende:</span>
      ${(s.apptTypes||[]).map(t => `<span style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text2);">
        <span style="width:12px;height:12px;border-radius:4px;background:${t.color};display:inline-block;"></span>${t.name}
      </span>`).join('')}
      <span style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text2);">
        <span style="width:12px;height:12px;border-radius:4px;background:var(--accent);display:inline-block;"></span>Fix
      </span>
      <span style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text2);">
        <span style="width:12px;height:12px;border-radius:4px;background:var(--amber);display:inline-block;"></span>Flexibel
      </span>
      <span style="margin-left:auto;font-size:13px;">
        <button onclick="navigate('settings')" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:13px;padding:0;"><i class="ti ti-settings" style="font-size:13px;"></i> Verfügbarkeit & Terminarten</button>
      </span>
    </div>
  `;
}

// ============================================================
// CALL SLOT MODAL
// ============================================================
// ── Booking-Modal State ──
let _csApptTypes = [];
let _csSelectedAppt = null;
let _csSelectedDate = null;
let _csSelectedTime = null;
let _csCalYear, _csCalMonth;
let _csTakenSlots = [];
const _csPad = n => String(n).padStart(2,'0');
const _csMonths = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const _csDays   = ['Mo','Di','Mi','Do','Fr','Sa','So'];

function _csGoStep(n) {
  [1,2,3].forEach(i => {
    const el = document.getElementById(`cs_step${i}`);
    if (el) el.style.display = i === n ? 'block' : 'none';
  });
}

function _csGetSettings() {
  return JSON.parse(localStorage.getItem('crmSettings') || '{}');
}

// Resolve duration for a callSlot — uses apptDuration if set,
// otherwise looks up the apptType name in settings, falls back to 30
function _csResolveDuration(sl) {
  if (sl.apptDuration && sl.apptDuration > 0) return sl.apptDuration;
  if (sl.apptType) {
    const cfg = _csGetSettings();
    const found = (cfg.apptTypes || []).find(t => t.name === sl.apptType);
    if (found && found.duration) return found.duration;
  }
  return 30;
}

function _csGetDayConfig(jsDay) {
  const cfg = _csGetSettings();
  // Keys in dayConfigs are stored as strings when JSON-serialized
  return (cfg.dayConfigs || {})[String(jsDay)] || (cfg.dayConfigs || {})[jsDay] || null;
}

function _csIsDayAvail(date) {
  const dc = _csGetDayConfig(date.getDay());
  if (!dc || !dc.enabled) return false;
  const cfg = _csGetSettings();
  const ds = date.getFullYear() + '-' + _csPad(date.getMonth()+1) + '-' + _csPad(date.getDate());
  if ((cfg.blockedDates || []).includes(ds)) return false;
  return true;
}

// Prüft ob ein Tag mindestens einen freien Slot hat (berücksichtigt Dauer + bestehende Termine)
function _csDayHasFreeSlots(date) {
  const dc = _csGetDayConfig(date.getDay());
  if (!dc) return false;
  const dur = _csSelectedAppt?.duration || 30;
  const [sh, sm] = dc.start.split(':').map(Number);
  const [eh, em] = dc.end.split(':').map(Number);
  const dayStartMin = sh*60+sm, dayEndMin = eh*60+em;
  let brkS = Infinity, brkE = -Infinity;
  if (dc.breakStart && dc.breakEnd) {
    const [bsh,bsm] = dc.breakStart.split(':').map(Number);
    const [beh,bem] = dc.breakEnd.split(':').map(Number);
    brkS = bsh*60+bsm; brkE = beh*60+bem;
  }
  const now = new Date();
  for (let t = dayStartMin; t + dur <= dayEndMin; t += 30) {
    const apptEnd = t + dur;
    if (dc.breakStart && dc.breakEnd && t < brkE && apptEnd > brkS) continue;
    const slotH = Math.floor(t/60), slotM = t%60;
    const slotDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), slotH, slotM);
    if (slotDate <= now) continue;
    if (_csIsSlotFree(slotDate, dur)) return true;
  }
  return false;
}

function _csRenderCal() {
  const grid = document.getElementById('cs_calGrid');
  if (!grid) return;
  document.getElementById('cs_calTitle').textContent = `${_csMonths[_csCalMonth]} ${_csCalYear}`;
  grid.innerHTML = '';
  _csDays.forEach(d => {
    const h = document.createElement('div');
    h.className = 'cs-cal-day header'; h.textContent = d; grid.appendChild(h);
  });
  const today = new Date(); today.setHours(0,0,0,0);
  const firstDow = new Date(_csCalYear, _csCalMonth, 1).getDay();
  const blanks = firstDow === 0 ? 6 : firstDow - 1;
  const daysInMonth = new Date(_csCalYear, _csCalMonth + 1, 0).getDate();
  for (let b = 0; b < blanks; b++) {
    const el = document.createElement('div'); el.className = 'cs-cal-day empty'; grid.appendChild(el);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(_csCalYear, _csCalMonth, d);
    const el = document.createElement('div');
    el.className = 'cs-cal-day';
    el.textContent = d;
    const isPast  = date < today;
    const avail   = !isPast && _csIsDayAvail(date) && _csDayHasFreeSlots(date);
    const isSel   = _csSelectedDate && _csSelectedDate.y === _csCalYear && _csSelectedDate.m === _csCalMonth && _csSelectedDate.d === d;
    if (isPast || !avail) el.classList.add(isPast ? 'past' : 'unavail');
    else el.classList.add('free');
    if (isSel) { el.classList.remove('free'); el.classList.add('selected'); }
    if (avail) el.addEventListener('click', () => _csSelectDay(_csCalYear, _csCalMonth, d));
    grid.appendChild(el);
  }
}

function _csSelectDay(y, m, d) {
  _csSelectedDate = {y, m, d};
  _csSelectedTime = null;
  document.getElementById('cs_step2Next').disabled = true;
  _csRenderCal();
  _csRenderTimeSlots(y, m, d);
  document.getElementById('cs_timeSection').style.display = 'block';
}

function _csRenderTimeSlots(y, m, d) {
  const grid = document.getElementById('cs_timeGrid');
  const noMsg = document.getElementById('cs_noTimesMsg');
  grid.innerHTML = ''; noMsg.style.display = 'none';
  const dc = _csGetDayConfig(new Date(y, m, d).getDay());
  const dur = _csSelectedAppt?.duration || 30;
  if (!dc) { noMsg.style.display = 'block'; return; }

  const [sh, sm] = dc.start.split(':').map(Number);
  const [eh, em] = dc.end.split(':').map(Number);
  const dayStartMin = sh*60+sm;
  const dayEndMin   = eh*60+em;

  let brkS = Infinity, brkE = -Infinity;
  if (dc.breakStart && dc.breakEnd) {
    const [bsh,bsm] = dc.breakStart.split(':').map(Number);
    const [beh,bem] = dc.breakEnd.split(':').map(Number);
    brkS = bsh*60+bsm; brkE = beh*60+bem;
  }

  const nowDate = new Date();
  const slots = [];

  // Only offer slots where the full duration fits within the day AND no break overlap
  for (let t = dayStartMin; t + dur <= dayEndMin; t += 30) {
    // Skip if any minute of the new appointment falls in the break
    const apptEnd = t + dur;
    const crossesBreak = dc.breakStart && dc.breakEnd && t < brkE && apptEnd > brkS;
    if (crossesBreak) continue;

    const slotH = Math.floor(t/60), slotM = t%60;
    const timeStr = _csPad(slotH) + ':' + _csPad(slotM);
    const slotDate = new Date(y, m, d, slotH, slotM);

    // Skip past slots
    if (slotDate <= nowDate) continue;

    // Check: does this new slot [slotDate, slotDate+dur) overlap any existing appointment?
    const isFree = _csIsSlotFree(slotDate, dur);
    slots.push({ timeStr, isFree });
  }

  document.getElementById('cs_timeSectionTitle').textContent =
    'Uhrzeit – ' + new Date(y,m,d).toLocaleDateString('de-DE',{weekday:'long',day:'2-digit',month:'long'});
  if (slots.length === 0) { noMsg.style.display = 'block'; return; }

  slots.forEach(sl => {
    const btn = document.createElement('div');
    btn.className = 'cs-time-slot' + (sl.isFree ? '' : ' taken');
    btn.textContent = sl.timeStr + ' Uhr';
    if (sl.isFree) {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.cs-time-slot').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        _csSelectedTime = sl.timeStr;
        document.getElementById('cs_step2Next').disabled = false;
      });
    }
    grid.appendChild(btn);
  });
}

function _csBuildSummary() {
  const {y, m, d} = _csSelectedDate;
  const dateStr = new Date(y, m, d).toLocaleDateString('de-DE', {weekday:'long', day:'2-digit', month:'long', year:'numeric'});
  const contact = contacts.find(c => c.id === document.getElementById('cs_contact').value);
  const name = contact ? `${contact.vorname} ${contact.nachname}` : '—';
  document.getElementById('cs_summary').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:6px;">
      <div style="display:flex;gap:8px;"><span style="color:var(--text3);min-width:90px;font-size:13px;">Kontakt</span><span style="font-weight:500;">${name}</span></div>
      <div style="display:flex;gap:8px;"><span style="color:var(--text3);min-width:90px;font-size:13px;">Terminart</span><span style="font-weight:500;color:${_csSelectedAppt.color}">${_csSelectedAppt.name} · ${_csSelectedAppt.duration} Min.</span></div>
      <div style="display:flex;gap:8px;"><span style="color:var(--text3);min-width:90px;font-size:13px;">Datum</span><span style="font-weight:500;">${dateStr}</span></div>
      <div style="display:flex;gap:8px;"><span style="color:var(--text3);min-width:90px;font-size:13px;">Uhrzeit</span><span style="font-weight:500;">${_csSelectedTime} Uhr</span></div>
    </div>
  `;
  // Sync hidden inputs for app.js saveCallSlot handler
  const iso = `${y}-${_csPad(m+1)}-${_csPad(d)}T${_csSelectedTime}`;
  document.getElementById('cs_datetime').value = iso;
  // Sync hidden select
  const apptSel = document.getElementById('cs_appttype');
  apptSel.innerHTML = `<option value="${_csSelectedAppt.name}" data-duration="${_csSelectedAppt.duration}" data-color="${_csSelectedAppt.color}" selected>${_csSelectedAppt.name}</option>`;
}

// _csTakenSlots = array of {start: Date, end: Date} für alle belegten Zeiträume
// Quellen: Firebase callSlots + Google Calendar Events
function _csLoadTakenSlots() {
  try {
    _csTakenSlots = [];
    const horizon = new Date(Date.now() + 90 * 86400000);

    // ── Quelle 1: Firebase callSlots ──────────────────────
    callSlots.forEach(sl => {
      if (!sl.datetime) return;
      const start = new Date(sl.datetime);
      if (isNaN(start) || start > horizon) return;
      const dur = _csResolveDuration(sl);
      const end = new Date(start.getTime() + dur * 60000);
      _csTakenSlots.push({ start, end });
    });

    // ── Quelle 2: Google Calendar Events ──────────────────
    (googleCalendarEvents || []).forEach(ev => {
      if (!ev.datetime) return;

      // Ganztägige Events (kein 'T' im Datum)
      if (!ev.datetime.includes('T')) {
        const dayStart = new Date(ev.datetime + 'T00:00:00');
        const dayEnd   = ev.end && !ev.end.includes('T')
          ? new Date(ev.end + 'T00:00:00')
          : new Date(dayStart.getTime() + 86400000);
        if (dayStart > horizon) return;
        _csTakenSlots.push({ start: dayStart, end: dayEnd });
        return;
      }

      // Timed Events
      const start = new Date(ev.datetime);
      if (isNaN(start) || start > horizon) return;
      const end = ev.end
        ? new Date(ev.end)
        : new Date(start.getTime() + 30 * 60000);
      if (isNaN(end) || end <= start) return;
      _csTakenSlots.push({ start, end });
    });

  } catch(e) {
    console.warn('_csLoadTakenSlots Fehler:', e);
    _csTakenSlots = [];
  }
}

// Check if a proposed slot [slotStart, slotStart+newDurMin) overlaps any existing appointment
// Lädt immer frisch aus callSlots + googleCalendarEvents (kein veralteter Cache)
function _csIsSlotFree(slotStart, newDurMin) {
  const slotEnd = new Date(slotStart.getTime() + newDurMin * 60000);
  const taken = _csBuildTakenList();
  return !taken.some(t => slotStart < t.end && slotEnd > t.start);
}

// Baut die aktuelle Liste belegter Zeiträume live aus beiden Quellen
function _csBuildTakenList() {
  const result = [];
  const horizon = new Date(Date.now() + 90 * 86400000);

  // Quelle 1: Firebase callSlots
  (callSlots || []).forEach(sl => {
    if (!sl.datetime) return;
    const start = new Date(sl.datetime);
    if (isNaN(start) || start > horizon) return;
    const dur = _csResolveDuration(sl);
    result.push({ start, end: new Date(start.getTime() + dur * 60000) });
  });

  // Quelle 2: Google Calendar Events
  (googleCalendarEvents || []).forEach(ev => {
    if (!ev.datetime) return;
    // Ganztägige Events
    if (!ev.datetime.includes('T')) {
      const dayStart = new Date(ev.datetime + 'T00:00:00');
      const dayEnd   = (ev.end && !ev.end.includes('T'))
        ? new Date(ev.end + 'T00:00:00')
        : new Date(dayStart.getTime() + 86400000);
      if (!isNaN(dayStart) && dayStart <= horizon) result.push({ start: dayStart, end: dayEnd });
      return;
    }
    // Timed Events
    const start = new Date(ev.datetime);
    if (isNaN(start) || start > horizon) return;
    const end = ev.end ? new Date(ev.end) : new Date(start.getTime() + 30 * 60000);
    if (!isNaN(end) && end > start) result.push({ start, end });
  });

  return result;
}

window.openCallSlotModal = function(preContactId = null) {
  const cfg = JSON.parse(localStorage.getItem('crmSettings') || '{}');
  _csApptTypes = cfg.apptTypes || [
    { name:'Erstgespräch', color:'#3b82f6', duration:30 },
    { name:'Beratungstermin', color:'#a78bfa', duration:60 },
    { name:'Folgegespräch', color:'#22c55e', duration:20 },
  ];
  _csSelectedAppt = null;
  _csSelectedDate = null;
  _csSelectedTime = null;

  // Populate contact dropdown
  const sel = document.getElementById('cs_contact');
  sel.innerHTML = contacts.map(c => `<option value="${c.id}" ${c.id === preContactId ? 'selected' : ''}>${c.vorname} ${c.nachname}</option>`).join('');

  // Build appt type pills
  const pillWrap = document.getElementById('cs_appttype_pills');
  pillWrap.innerHTML = '';
  _csApptTypes.forEach(t => {
    const pill = document.createElement('div');
    pill.className = 'cs-appt-pill';
    pill.style.color = t.color;
    pill.innerHTML = `<span style="width:9px;height:9px;border-radius:3px;background:${t.color};display:inline-block;flex-shrink:0;"></span><span>${t.name}</span><span style="font-size:11px;opacity:.65;">· ${t.duration} Min.</span>`;
    pill.addEventListener('click', () => {
      document.querySelectorAll('.cs-appt-pill').forEach(p => p.classList.remove('selected'));
      pill.classList.add('selected');
      _csSelectedAppt = t;
    });
    pillWrap.appendChild(pill);
  });
  // Auto-select first
  pillWrap.querySelector('.cs-appt-pill')?.click();

  // Pre-check email options
  document.getElementById('cs_confirm').checked = cfg.autoConfirm || false;
  document.getElementById('cs_reminder').checked = cfg.autoReminder || false;
  document.getElementById('cs_note').value = '';

  _csGoStep(1);
  document.getElementById('callSlotModal').classList.add('open');

  // Load taken slots from memory
  _csLoadTakenSlots();
};

window.openCallSlotModalForDate = function(isoDate) {
  openCallSlotModal();
  // Will be overridden after user picks in calendar — just open normally
};

// Step 1 → 2
document.getElementById('cs_step1Next').addEventListener('click', () => {
  if (!_csSelectedAppt) { alert('Bitte eine Terminart wählen.'); return; }
  const now2 = new Date();
  _csCalYear = now2.getFullYear(); _csCalMonth = now2.getMonth();
  _csRenderCal();
  document.getElementById('cs_timeSection').style.display = 'none';
  document.getElementById('cs_step2Next').disabled = true;
  _csGoStep(2);
});

document.getElementById('cs_calPrev').addEventListener('click', () => {
  const now2 = new Date();
  if (_csCalYear === now2.getFullYear() && _csCalMonth === now2.getMonth()) return;
  _csCalMonth--; if (_csCalMonth < 0) { _csCalMonth = 11; _csCalYear--; }
  _csRenderCal();
});
document.getElementById('cs_calNext').addEventListener('click', () => {
  _csCalMonth++; if (_csCalMonth > 11) { _csCalMonth = 0; _csCalYear++; }
  _csRenderCal();
});

// Step 2 → 3
document.getElementById('cs_step2Next').addEventListener('click', () => {
  if (!_csSelectedDate || !_csSelectedTime) return;
  _csBuildSummary();
  _csGoStep(3);
});

// Step 2 ← back
document.getElementById('cs_step2Back').addEventListener('click', () => _csGoStep(1));

// Step 3 ← back
document.getElementById('cs_step3Back').addEventListener('click', () => _csGoStep(2));

document.getElementById('saveCallSlot').addEventListener('click', async () => {
  const apptSel = document.getElementById('cs_appttype');
  // Prefer _csSelectedAppt (set by booking UI) over hidden select fallback
  const apptTypeName = _csSelectedAppt?.name || apptSel.value;
  const apptDuration = _csSelectedAppt?.duration || parseInt(apptSel.selectedOptions[0]?.dataset?.duration || '30');
  const apptColor = _csSelectedAppt?.color || apptSel.selectedOptions[0]?.dataset?.color || '';
  const note = document.getElementById('cs_note').value.trim();
  const contactId = document.getElementById('cs_contact').value;

  const data = {
    contactId,
    datetime: document.getElementById('cs_datetime').value,
    type: document.getElementById('cs_type').value,
    apptType: apptTypeName,
    apptDuration,
    apptColor,
    note,
    sendConfirm: document.getElementById('cs_confirm').checked,
    sendReminder: document.getElementById('cs_reminder').checked,
  };

  // Add history entry to contact
  if (contactId && note) {
    const contact = contacts.find(c => c.id === contactId);
    if (contact) {
      const histEntry = {
        type: 'termin',
        datetime: data.datetime,
        note: `[${apptTypeName || 'Termin'}] ${note}`,
        followup: null,
      };
      const updatedHistory = [...(contact.history || []), histEntry];
      // Also append to notizen
      const existingNotizen = contact.notizen || '';
      const noteAppend = `\n[${new Date(data.datetime).toLocaleDateString('de-DE')} ${apptTypeName || 'Termin'}] ${note}`.trim();
      const updatedNotizen = existingNotizen ? existingNotizen + '\n' + noteAppend : noteAppend;
      try {
        await updateDoc(doc(db, 'contacts', contactId), { history: updatedHistory, notizen: updatedNotizen });
      } catch {
        const idx = contacts.findIndex(c => c.id === contactId);
        if (idx !== -1) {
          contacts[idx].history = updatedHistory;
          contacts[idx].notizen = updatedNotizen;
        }
      }
    }
  }

  const contactForSync = contacts.find(c => c.id === contactId);

  // ── Kollisionsprüfung ──────────────────────────────────
  const newStart = new Date(data.datetime).getTime();
  const newEnd   = newStart + apptDuration * 60000;
  const conflict = callSlots.find(sl => {
    const exStart = new Date(sl.datetime).getTime();
    const exEnd   = exStart + (sl.apptDuration || 30) * 60000;
    return newStart < exEnd && newEnd > exStart;
  });
  if (conflict) {
    const conflictTime = new Date(conflict.datetime).toLocaleString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
    const conflictContact = contacts.find(c => c.id === conflict.contactId);
    const nameStr = conflictContact ? ` (${conflictContact.vorname} ${conflictContact.nachname})` : '';
    toast(`⚠️ Zeitkonflikt: Überschneidung mit Termin am ${conflictTime}${nameStr}.`, 'error');
    return;
  }
  // ──────────────────────────────────────────────────────

  try {
    const newSlotRef = await addDoc(collection(db, 'callSlots'), data);
    // Sofort ins lokale Array aufnehmen damit Kollisionsprüfung aktuell bleibt
    callSlots.push({ id: newSlotRef.id, ...data });
    _csLoadTakenSlots();
    toast(`Termin eingeplant${apptTypeName ? ': ' + apptTypeName : ''}!`);
    await syncToGoogleCalendar(data, contactForSync);
  } catch {
    callSlots.push({ id: 'local_' + Date.now(), ...data });
    _csLoadTakenSlots();
    toast('Eingeplant (offline).');
    renderCalendar();
  }

  document.getElementById('callSlotModal').classList.remove('open');

  // E-Mail Auswahl Dialog
  showEmailDialog(contactForSync, data);
});

// ============================================================
// E-MAIL AUSWAHL DIALOG – erscheint nach jedem Termin
// ============================================================
function showEmailDialog(contact, slotData) {
  const s = JSON.parse(localStorage.getItem('crmSettings') || '{}');
  const hasEmail = !!contact?.email;

  const dt = new Date(slotData.datetime);
  const datum = dt.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const uhrzeit = dt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

  document.getElementById('emailDialog')?.remove();

  const dlg = document.createElement('div');
  dlg.id = 'emailDialog';
  dlg.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:500;
    display:flex;align-items:center;justify-content:center;padding:20px;
  `;

  dlg.innerHTML = `
    <div style="background:var(--bg2);border:1px solid var(--border2);border-radius:18px;
      padding:28px 24px;width:100%;max-width:420px;animation:modalIn .2s ease;">

      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
        <div style="width:36px;height:36px;border-radius:10px;background:rgba(167,139,250,0.15);
          display:flex;align-items:center;justify-content:center;font-size:18px;">📧</div>
        <div>
          <div style="font-size:15px;font-weight:700;">E-Mails versenden?</div>
          <div style="font-size:12px;color:var(--text3);">Termin: ${datum} · ${uhrzeit} Uhr</div>
        </div>
      </div>

      ${!hasEmail ? `
        <div style="margin:14px 0;padding:10px 12px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:8px;font-size:13px;color:var(--amber);">
          <i class="ti ti-alert-circle"></i> Kein E-Mail beim Kontakt hinterlegt – E-Mail-Versand nicht möglich.
        </div>
      ` : `
        <div style="font-size:13px;color:var(--text2);margin:10px 0 16px;">
          An: <strong>${contact?.vorname || ''} ${contact?.nachname || ''}</strong>
          <span style="color:var(--text3);"> · ${contact.email}</span>
        </div>
      `}

      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px;">

        <!-- Terminbestätigung -->
        <label style="display:flex;align-items:flex-start;gap:12px;cursor:${hasEmail?'pointer':'not-allowed'};
          background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:12px 14px;
          opacity:${hasEmail?'1':'0.5'};">
          <input type="checkbox" id="ed_confirm" ${s.autoConfirm && hasEmail ? 'checked' : ''} ${!hasEmail ? 'disabled' : ''}
            style="margin-top:2px;width:16px;height:16px;cursor:${hasEmail?'pointer':'not-allowed'};" />
          <div>
            <div style="font-weight:600;font-size:13px;">📬 Terminbestätigung</div>
            <div style="font-size:12px;color:var(--text3);margin-top:2px;">Wird sofort über Gmail gesendet – inkl. Kalender-Datei (.ics) zum Eintragen</div>
          </div>
        </label>

        <!-- Terminerinnerung -->
        <label style="display:flex;align-items:flex-start;gap:12px;cursor:${hasEmail?'pointer':'not-allowed'};
          background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:12px 14px;
          opacity:${hasEmail?'1':'0.5'};">
          <input type="checkbox" id="ed_reminder" ${s.autoReminder && hasEmail ? 'checked' : ''} ${!hasEmail ? 'disabled' : ''}
            style="margin-top:2px;width:16px;height:16px;cursor:${hasEmail?'pointer':'not-allowed'};" />
          <div>
            <div style="font-weight:600;font-size:13px;">🔔 Terminerinnerung</div>
            <div style="font-size:12px;color:var(--text3);margin-top:2px;">Wird am Termintag um 09:00 Uhr gesendet (gespeichert für automatischen Versand)</div>
          </div>
        </label>

        <!-- Nur .ics -->
        <label style="display:flex;align-items:flex-start;gap:12px;cursor:${hasEmail?'pointer':'not-allowed'};
          background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:12px 14px;
          opacity:${hasEmail?'1':'0.5'};">
          <input type="checkbox" id="ed_ics" ${hasEmail ? 'checked' : ''} ${!hasEmail ? 'disabled' : ''}
            style="margin-top:2px;width:16px;height:16px;cursor:${hasEmail?'pointer':'not-allowed'};" />
          <div>
            <div style="font-weight:600;font-size:13px;">📅 Kalender-Einladung (.ics)</div>
            <div style="font-size:12px;color:var(--text3);margin-top:2px;">Kalender-Datei als Anhang – Empfänger trägt Termin mit einem Klick ein</div>
          </div>
        </label>

      </div>

      <div style="display:flex;gap:8px;">
        <button id="ed_skip" style="flex:1;padding:10px;border-radius:10px;border:1px solid var(--border2);
          background:none;color:var(--text2);cursor:pointer;font-size:14px;font-family:inherit;">
          Überspringen
        </button>
        <button id="ed_send" style="flex:2;padding:10px;border-radius:10px;border:none;
          background:var(--purple);color:#fff;cursor:pointer;font-size:14px;font-weight:600;font-family:inherit;
          ${!hasEmail ? 'opacity:0.4;cursor:not-allowed;' : ''}">
          <i class="ti ti-send"></i> Senden
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(dlg);

  document.getElementById('ed_skip').addEventListener('click', () => dlg.remove());

  document.getElementById('ed_send').addEventListener('click', async () => {
    if (!hasEmail) { dlg.remove(); return; }

    const sendConfirm = document.getElementById('ed_confirm').checked;
    const sendReminder = document.getElementById('ed_reminder').checked;
    const sendIcs = document.getElementById('ed_ics').checked;

    dlg.remove();

    // Terminbestätigung (enthält immer .ics wenn sendIcs auch an)
    if (sendConfirm) {
      await sendConfirmationEmail(contact, { ...slotData, withIcs: sendIcs });
    } else if (sendIcs && !sendConfirm) {
      // Nur .ics ohne Bestätigungstext
      await sendCalendarInviteOnly(contact, slotData);
    }

    // Erinnerung als Flag in Firestore speichern
    if (sendReminder) {
      try {
        const q = await getDocs(query(collection(db, 'callSlots'),
          orderBy('datetime', 'desc')));
        // Neuesten Slot dieses Kontakts updaten
        const slot = q.docs.find(d => d.data().contactId === slotData.contactId &&
          d.data().datetime === slotData.datetime);
        if (slot) {
          await updateDoc(doc(db, 'callSlots', slot.id), { sendReminder: true });
        }
      } catch {}
      toast('🔔 Erinnerung wird am Termintag um 09:00 Uhr versendet.', 'success');
    }
  });
}

// Nur Kalender-Einladung senden (ohne Bestätigungstext)
async function sendCalendarInviteOnly(contact, slotData) {
  const s = JSON.parse(localStorage.getItem('crmSettings') || '{}');
  const from = s.gmailSender || 'nawin.telis@gmail.com';
  const dt = new Date(slotData.datetime);
  const datum = dt.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const uhrzeit = dt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

  const subject = `Kalender-Einladung: ${slotData.apptType || 'Termin'} am ${datum}`;
  const htmlBody = `Hallo ${contact.vorname},<br><br>im Anhang findest du die Kalender-Einladung für unseren Termin am <strong>${datum} um ${uhrzeit} Uhr</strong>.<br><br>${(s.emailSig||'').replace(/\n/g,'<br>')}`;
  const icsContent = generateICS(contact, slotData);

  const token = await getGmailToken();
  if (!token) { toast('⚠️ Gmail-Login fehlgeschlagen.', 'error'); return; }

  const rawMessage = buildGmailMessage(contact.email, `${contact.vorname} ${contact.nachname}`, from, subject, htmlBody, icsContent);

  try {
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: rawMessage }),
    });
    if (res.ok) toast(`📅 Kalender-Einladung an ${contact.vorname} gesendet!`, 'success');
    else toast('❌ Fehler beim Senden der Kalender-Einladung.', 'error');
  } catch { toast('❌ Verbindungsfehler.', 'error'); }
}

window.deleteCallSlot = async function(id) {
  const slot = callSlots.find(s => s.id === id);
  const hasGcal = slot?.gcalEventIds && Object.keys(slot.gcalEventIds).length > 0;

  const msg = hasGcal
    ? 'Termin löschen?\n\n• Nur im Lead Tracker löschen\n• In Google Kalender wird der Eintrag NICHT gelöscht\n\nKlicke OK für nur Tracker, oder Abbrechen und nutze den Button "Auch aus Google Kalender löschen".'
    : 'Termin wirklich löschen?';

  // Show custom dialog if gcal entries exist
  if (hasGcal) {
    await showDeleteSlotDialog(id, slot);
    return;
  }

  if (!confirm(msg)) return;
  try {
    await deleteDoc(doc(db, 'callSlots', id));
    toast('Termin gelöscht.');
  } catch {
    callSlots = callSlots.filter(s => s.id !== id);
    toast('Gelöscht (offline).');
    renderCalendar();
  }
};

async function deleteGCalEvents(gcalEventIds) {
  const s = JSON.parse(localStorage.getItem('crmSettings') || '{}');
  const calendars = [
    { id: s.gcalId,  email: s.gcalId  },
    { id: s.gcalId2, email: s.gcalId2 },
  ].filter(c => c.id);

  let deleted = 0;
  for (const cal of calendars) {
    const eventId = gcalEventIds[cal.id];
    if (!eventId) continue;
    const token = await getGCalOAuthToken(cal.email);
    if (!token) continue;
    try {
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events/${eventId}`,
        { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (res.ok || res.status === 410) deleted++; // 410 = already deleted
    } catch(e) { console.warn('GCal delete error:', e.message); }
  }
  return deleted;
}

async function showDeleteSlotDialog(id, slot) {
  document.getElementById('deleteSlotDialog')?.remove();
  const dlg = document.createElement('div');
  dlg.id = 'deleteSlotDialog';
  dlg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:600;display:flex;align-items:center;justify-content:center;padding:20px;';
  dlg.innerHTML = `
    <div style="background:var(--bg2);border:1px solid var(--border2);border-radius:16px;padding:24px;width:100%;max-width:400px;animation:modalIn .2s ease;">
      <div style="font-size:18px;font-weight:700;margin-bottom:8px;">🗑️ Termin löschen</div>
      <p style="font-size:13px;color:var(--text2);margin-bottom:20px;">
        Dieser Termin ist auch in Google Kalender eingetragen. Wie möchtest du ihn löschen?
      </p>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <button id="dsd_both" style="padding:11px 14px;border-radius:10px;border:none;background:var(--red);color:#fff;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;text-align:left;">
          🗑️ Überall löschen <span style="font-size:12px;font-weight:400;opacity:0.85;">– Lead Tracker + Google Kalender</span>
        </button>
        <button id="dsd_tracker" style="padding:11px 14px;border-radius:10px;border:1px solid var(--border2);background:none;color:var(--text);font-size:14px;cursor:pointer;font-family:inherit;text-align:left;">
          📋 Nur im Lead Tracker löschen <span style="font-size:12px;opacity:0.6;">– Google Kalender bleibt</span>
        </button>
        <button id="dsd_cancel" style="padding:9px 14px;border-radius:10px;border:1px solid var(--border2);background:none;color:var(--text3);font-size:13px;cursor:pointer;font-family:inherit;">
          Abbrechen
        </button>
      </div>
    </div>`;
  document.body.appendChild(dlg);

  document.getElementById('dsd_cancel').onclick = () => dlg.remove();

  document.getElementById('dsd_tracker').onclick = async () => {
    dlg.remove();
    try {
      await deleteDoc(doc(db, 'callSlots', id));
      toast('Termin im Lead Tracker gelöscht.');
    } catch {
      callSlots = callSlots.filter(s => s.id !== id);
      renderCalendar();
      toast('Gelöscht (offline).');
    }
  };

  document.getElementById('dsd_both').onclick = async () => {
    dlg.remove();
    toast('Wird aus Google Kalender gelöscht...');
    const deleted = await deleteGCalEvents(slot.gcalEventIds);
    try {
      await deleteDoc(doc(db, 'callSlots', id));
    } catch {
      callSlots = callSlots.filter(s => s.id !== id);
      renderCalendar();
    }
    if (deleted > 0) {
      toast(`✅ Überall gelöscht (${deleted > 1 ? 'beide Kalender' : 'Google Kalender'} + Lead Tracker)!`, 'success');
    } else {
      toast('Lead Tracker gelöscht. Google Kalender-Löschung fehlgeschlagen – bitte manuell entfernen.', 'error');
    }
    setTimeout(() => loadGoogleCalendarEvents(), 1500);
  };
}

document.getElementById('closeCallSlotModal').addEventListener('click', () => document.getElementById('callSlotModal').classList.remove('open'));

// ============================================================
// DELETE CONTACT
// ============================================================
// Einzelnen Google Kalender-Eintrag direkt aus dem Wochenplan löschen
window.deleteGCalEventDirect = async function(eventId, calendarId, calendarLabel) {
  if (!confirm(`"${calendarLabel}"-Eintrag aus Google Kalender löschen?`)) return;
  const s = JSON.parse(localStorage.getItem('crmSettings') || '{}');
  const calEmail = calendarId;
  const token = await getGCalOAuthToken(calEmail);
  if (!token) { toast('⚠️ Google Login fehlgeschlagen.', 'error'); return; }
  try {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
      { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } }
    );
    if (res.ok || res.status === 410) {
      toast(`✅ Aus ${calendarLabel} gelöscht!`, 'success');
      googleCalendarEvents = googleCalendarEvents.filter(e => e.id !== eventId);
      renderCalendar();
    } else {
      toast('❌ Löschen fehlgeschlagen.', 'error');
    }
  } catch(e) {
    toast('❌ Verbindungsfehler.', 'error');
  }
};

window.deleteContact = async function(id) {
  if (!confirm('Kontakt wirklich löschen?')) return;
  try {
    await deleteDoc(doc(db, 'contacts', id));
    toast('Kontakt gelöscht.');
  } catch {
    contacts = contacts.filter(c => c.id !== id);
    toast('Gelöscht (offline).');
    renderContacts();
  }
};

// ============================================================
// EXPORT PAGE
// ============================================================
function renderExport() {
  const settings = JSON.parse(localStorage.getItem('crmSettings') || '{}');

  document.getElementById('content').innerHTML = `
    <div class="export-section">
      <h3><i class="ti ti-copy" style="margin-right:6px;"></i>Alle Kontakte kopieren</h3>
      <p>Kopiert alle Kontakte als tabellarische Daten – einfach in Monday.com einfügen.</p>
      <button class="btn-primary" id="copyAll"><i class="ti ti-clipboard"></i> In Zwischenablage kopieren</button>
    </div>

    <div class="export-section">
      <h3><i class="ti ti-file-text" style="margin-right:6px;"></i>CSV Export</h3>
      <p>Lädt alle Kontakte als CSV-Datei herunter.</p>
      <button class="btn-primary" id="downloadCsv"><i class="ti ti-download"></i> CSV herunterladen</button>
    </div>

    <div class="export-section">
      <h3><i class="ti ti-brand-monday" style="margin-right:6px;"></i>Monday.com Direktsync</h3>
      <p>
        ${settings.mondayKey ? `<span style="color:var(--green)"><i class="ti ti-check-circle"></i> API-Key hinterlegt</span>` : `<span style="color:var(--amber)"><i class="ti ti-alert-circle"></i> Noch kein API-Key – in den Einstellungen hinterlegen</span>`}
      </p>
      <button class="btn-primary" id="mondaySync" ${!settings.mondayKey ? 'disabled style="opacity:0.5;"' : ''}>
        <i class="ti ti-refresh"></i> Jetzt zu Monday synchronisieren
      </button>
      ${!settings.mondayKey ? `<button class="btn-ghost" style="margin-left:8px;" onclick="navigate('settings')"><i class="ti ti-settings"></i> Einstellungen öffnen</button>` : ''}
    </div>

    <div class="export-section">
      <h3>Vorschau (${contacts.length} Kontakte)</h3>
      <div class="contacts-table-wrap">
        <table class="contacts-table" style="font-size:13px;">
          <thead><tr><th>Name</th><th>Telefon</th><th>E-Mail</th><th>Thema</th><th>Status</th><th>Quelle</th><th>Ort</th></tr></thead>
          <tbody>${contacts.map(c => `<tr>
            <td>${c.vorname} ${c.nachname}</td>
            <td>${c.telefon||''}</td><td>${c.email||''}</td>
            <td>${c.thema||''}</td><td>${c.status||''}</td>
            <td>${c.quelle||''}</td><td>${c.ort||''}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('copyAll').addEventListener('click', () => {
    const header = 'Vorname\tNachname\tTelefon\tE-Mail\tOrt\tThema\tQuelle\tStatus\tNotizen';
    const rows = contacts.map(c => `${c.vorname}\t${c.nachname}\t${c.telefon||''}\t${c.email||''}\t${c.ort||''}\t${c.thema||''}\t${c.quelle||''}\t${c.status||''}\t${c.notizen||''}`);
    navigator.clipboard.writeText([header, ...rows].join('\n'));
    toast('In Zwischenablage kopiert! Jetzt in Monday einfügen.');
  });

  document.getElementById('downloadCsv').addEventListener('click', () => {
    const header = 'Vorname,Nachname,Telefon,E-Mail,Ort,Thema,Quelle,Status,Notizen';
    const rows = contacts.map(c => [c.vorname,c.nachname,c.telefon,c.email,c.ort,c.thema,c.quelle,c.status,c.notizen].map(v => `"${(v||'').replace(/"/g,'""')}"`).join(','));
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `leads_${new Date().toISOString().slice(0,10)}.csv`; a.click();
    toast('CSV wird heruntergeladen.');
  });

  if (settings.mondayKey) {
    document.getElementById('mondaySync').addEventListener('click', () => syncToMonday(settings));
  }
}

async function syncToMonday(settings) {
  if (!settings.mondayKey || !settings.mondayBoardId) {
    toast('Bitte API-Key und Board-ID in den Einstellungen hinterlegen.', 'error'); return;
  }
  toast('Monday.com Sync wird vorbereitet...');
  // Monday GraphQL API call – wird aktiviert sobald API-Key hinterlegt
  // Die Implementierung ist vorbereitet und wartet auf deinen API-Key
}

// ============================================================
// SETTINGS PAGE
// ============================================================
function renderSettings() {
  const s = JSON.parse(localStorage.getItem('crmSettings') || '{}');

  // Per-day availability: object keyed by day number (0=So,1=Mo,...,6=Sa)
  const defaultDayConfig = { enabled: false, start: '09:00', end: '18:00', breakStart: '', breakEnd: '' };
  const dayConfigs = s.dayConfigs || {
    1: { enabled: true,  start: '09:00', end: '18:00', breakStart: '', breakEnd: '' },
    2: { enabled: true,  start: '09:00', end: '18:00', breakStart: '', breakEnd: '' },
    3: { enabled: true,  start: '09:00', end: '18:00', breakStart: '', breakEnd: '' },
    4: { enabled: true,  start: '09:00', end: '18:00', breakStart: '', breakEnd: '' },
    5: { enabled: true,  start: '09:00', end: '18:00', breakStart: '', breakEnd: '' },
    6: { enabled: false, start: '09:00', end: '13:00', breakStart: '', breakEnd: '' },
    0: { enabled: false, start: '09:00', end: '13:00', breakStart: '', breakEnd: '' },
  };
  const dayLabels = [{v:1,l:'Montag'},{v:2,l:'Dienstag'},{v:3,l:'Mittwoch'},{v:4,l:'Donnerstag'},{v:5,l:'Freitag'},{v:6,l:'Samstag'},{v:0,l:'Sonntag'}];

  const emailConfirmText = s.emailConfirmText ||
`Hallo {vorname},

hiermit bestätige ich unseren gemeinsamen Termin am {datum} um {uhrzeit} Uhr.

Bei Fragen stehe ich dir gerne zur Verfügung.

{signatur}`;

  const emailReminderText = s.emailReminderText ||
`Hallo {vorname},

nur eine kurze Erinnerung: Heute um {uhrzeit} Uhr haben wir einen Termin.

Ich freue mich auf unser Gespräch!

{signatur}`;

  document.getElementById('content').innerHTML = `

    <!-- ── E-MAIL & BENACHRICHTIGUNGEN ── -->
    <div class="settings-section">
      <h3>E-Mail & Benachrichtigungen</h3>
      <div class="form-grid">
        <div class="field full"><label>Deine E-Mail-Adresse (Absender)</label>
          <input type="email" id="s_myEmail" placeholder="deine@email.de" value="${s.myEmail||''}" />
        </div>
        <div class="field full"><label>E-Mail Signatur <span style="font-weight:400;color:var(--text3);font-size:11px;">(optional – nur wenn kein Outlook/Mailclient)</span></label>
          <textarea id="s_emailSig" rows="3" placeholder="Mit freundlichen Grüßen,&#10;Max Mustermann">${s.emailSig||''}</textarea>
          <div style="display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap;">
            <label style="
              display:inline-flex;align-items:center;gap:6px;cursor:pointer;
              background:var(--bg3);border:1px solid var(--border2);color:var(--text2);
              border-radius:8px;padding:6px 12px;font-size:13px;transition:all .15s;
            " title="Bild in Signatur einfügen">
              <i class="ti ti-photo"></i> Bild einfügen
              <input type="file" id="s_sigImageInput" accept="image/*" style="display:none;" />
            </label>
            <span style="font-size:12px;color:var(--text3);">Das Bild wird als <code style="background:var(--bg3);padding:1px 5px;border-radius:4px;">{bild}</code> eingefügt – du kannst es im Text frei positionieren.</span>
          </div>
          ${s.emailSigImage ? `
          <div style="margin-top:8px;display:flex;align-items:center;gap:10px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:10px 12px;">
            <img src="${s.emailSigImage}" style="max-height:40px;max-width:120px;object-fit:contain;border-radius:4px;" />
            <span style="font-size:12px;color:var(--green);flex:1;"><i class="ti ti-check-circle"></i> Bild gespeichert</span>
            <button id="s_removeSigImage" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:13px;"><i class="ti ti-trash"></i> Entfernen</button>
          </div>` : `<div id="s_sigImagePreview" style="margin-top:8px;"></div>`}
          <p style="font-size:12px;color:var(--text3);margin-top:5px;"><i class="ti ti-info-circle"></i> Wenn du Outlook oder einen anderen E-Mail-Client mit eigener Signatur verwendest, lasse dieses Feld einfach leer – deine Outlook-Signatur wird automatisch angehängt.</p>
        </div>
        <div class="field full">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;opacity:0.5;pointer-events:none;">
            <input type="checkbox" disabled />
            <span style="font-size:13px;color:var(--text3);"><i class="ti ti-arrow-down" style="font-size:11px;"></i> Bestätigungs- & Erinnerungsoptionen jetzt im Bereich „Automatisierung" unten</span>
          </label>
        </div>
      </div>
    </div>

    <!-- ── TERMINBESTÄTIGUNG ── -->
    <div class="settings-section">
      <h3>📧 Terminbestätigung <span style="font-weight:400;font-size:11px;color:var(--accent);background:rgba(59,130,246,0.12);padding:2px 8px;border-radius:10px;margin-left:6px;">wird 1 Tag vorher versendet</span></h3>
      <p style="font-size:13px;color:var(--text2);margin-bottom:12px;">
        Diese E-Mail geht automatisch <strong>1 Tag vor dem Termin</strong> an den Kontakt raus.<br/>
        <span style="font-size:12px;color:var(--text3);">Verfügbare Platzhalter: <code style="background:var(--bg3);padding:1px 5px;border-radius:4px;">{vorname}</code> <code style="background:var(--bg3);padding:1px 5px;border-radius:4px;">{nachname}</code> <code style="background:var(--bg3);padding:1px 5px;border-radius:4px;">{datum}</code> <code style="background:var(--bg3);padding:1px 5px;border-radius:4px;">{uhrzeit}</code> <code style="background:var(--bg3);padding:1px 5px;border-radius:4px;">{signatur}</code></span>
      </p>
      <div class="form-grid">
        <div class="field full"><label>Betreff</label>
          <input type="text" id="s_confirmSubject" placeholder="Terminbestätigung – {datum}" value="${s.confirmSubject||'Terminbestätigung – {datum}'}" />
        </div>
        <div class="field full"><label>Nachrichtentext</label>
          <textarea id="s_emailConfirmText" rows="7" style="font-family:'DM Mono',monospace;font-size:13px;">${emailConfirmText}</textarea>
        </div>
      </div>
    </div>

    <!-- ── TERMINERINNERUNG ── -->
    <div class="settings-section">
      <h3>🔔 Terminerinnerung <span style="font-weight:400;font-size:11px;color:var(--amber);background:rgba(245,158,11,0.12);padding:2px 8px;border-radius:10px;margin-left:6px;">wird am selben Tag um 09:00 Uhr versendet</span></h3>
      <p style="font-size:13px;color:var(--text2);margin-bottom:12px;">
        Diese E-Mail geht automatisch <strong>am Termintag um 09:00 Uhr morgens</strong> an den Kontakt raus.<br/>
        <span style="font-size:12px;color:var(--text3);">Verfügbare Platzhalter: <code style="background:var(--bg3);padding:1px 5px;border-radius:4px;">{vorname}</code> <code style="background:var(--bg3);padding:1px 5px;border-radius:4px;">{nachname}</code> <code style="background:var(--bg3);padding:1px 5px;border-radius:4px;">{datum}</code> <code style="background:var(--bg3);padding:1px 5px;border-radius:4px;">{uhrzeit}</code> <code style="background:var(--bg3);padding:1px 5px;border-radius:4px;">{signatur}</code></span>
      </p>
      <div class="form-grid">
        <div class="field full"><label>Betreff</label>
          <input type="text" id="s_reminderSubject" placeholder="Erinnerung: Unser Termin heute um {uhrzeit} Uhr" value="${s.reminderSubject||'Erinnerung: Unser Termin heute um {uhrzeit} Uhr'}" />
        </div>
        <div class="field full"><label>Nachrichtentext</label>
          <textarea id="s_emailReminderText" rows="7" style="font-family:'DM Mono',monospace;font-size:13px;">${emailReminderText}</textarea>
        </div>
      </div>
    </div>

    <!-- ── TERMINARTEN ── -->
    <div class="settings-section">
      <h3>🗂️ Terminarten</h3>
      <p style="font-size:13px;color:var(--text2);margin-bottom:14px;">Definiere deine eigenen Terminarten mit Farbe und Standarddauer. Diese stehen dann überall beim Einplanen zur Verfügung.</p>
      <div id="apptTypesList" style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px;"></div>
      <button class="btn-ghost" id="addApptType" style="font-size:13px;"><i class="ti ti-plus"></i> Neue Terminart hinzufügen</button>
    </div>

    <!-- ── VERFÜGBARKEIT PRO TAG ── -->
    <div class="settings-section">
      <h3>Verfügbarkeit pro Wochentag</h3>
      <p style="font-size:13px;color:var(--text2);margin-bottom:14px;">Aktiviere die Tage und hinterlege individuelle Zeiten – inkl. optionaler Pausenzeit.</p>

      <div style="display:flex;flex-direction:column;gap:10px;" id="dayConfigContainer">
        ${dayLabels.map(dl => {
          const dc = dayConfigs[dl.v] || defaultDayConfig;
          return `
          <div class="day-avail-row" style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:12px 14px;">
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;min-width:110px;">
                <input type="checkbox" class="avail-day-toggle" data-day="${dl.v}" ${dc.enabled?'checked':''} />
                <span style="font-weight:500;font-size:14px;">${dl.l}</span>
              </label>
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;" class="day-times-${dl.v}" style="${dc.enabled?'':'opacity:0.4;pointer-events:none;'}">
                <span style="font-size:12px;color:var(--text3);">Von</span>
                <input type="time" class="day-start" data-day="${dl.v}" value="${dc.start||'09:00'}"
                  style="background:var(--bg2);border:1px solid var(--border2);color:var(--text);border-radius:6px;padding:5px 8px;font-size:13px;outline:none;width:90px;" />
                <span style="font-size:12px;color:var(--text3);">bis</span>
                <input type="time" class="day-end" data-day="${dl.v}" value="${dc.end||'18:00'}"
                  style="background:var(--bg2);border:1px solid var(--border2);color:var(--text);border-radius:6px;padding:5px 8px;font-size:13px;outline:none;width:90px;" />
                <span style="font-size:12px;color:var(--text3);margin-left:8px;">Pause</span>
                <input type="time" class="day-break-start" data-day="${dl.v}" value="${dc.breakStart||''}"
                  style="background:var(--bg2);border:1px solid var(--border2);color:var(--text);border-radius:6px;padding:5px 8px;font-size:13px;outline:none;width:90px;"
                  placeholder="–" />
                <span style="font-size:12px;color:var(--text3);">–</span>
                <input type="time" class="day-break-end" data-day="${dl.v}" value="${dc.breakEnd||''}"
                  style="background:var(--bg2);border:1px solid var(--border2);color:var(--text);border-radius:6px;padding:5px 8px;font-size:13px;outline:none;width:90px;"
                  placeholder="–" />
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>

      <div class="form-grid" style="margin-top:14px;">
        <div class="field full"><label>Gesperrte Einzeltage (kommagetrennt, z.B. 2025-12-24,2025-12-25)</label>
          <input type="text" id="s_blockedDates" placeholder="YYYY-MM-DD, YYYY-MM-DD..." value="${(s.blockedDates||[]).join(', ')}" />
        </div>
      </div>
    </div>

    <!-- ── TERMIN BENACHRICHTIGUNG ── -->
    <div class="settings-section">
      <h3>🔔 Termin Benachrichtigung</h3>
      <p style="font-size:13px;color:var(--text2);margin-bottom:16px;">
        Sobald du einen Termin einträgst, wird automatisch eine Bestätigungs-E-Mail über dein Gmail-Konto versendet – inklusive Kalender-Datei (.ics), die der Empfänger mit einem Klick in seinen Kalender eintragen kann (Google, Apple, Outlook – alles).
      </p>

      <div style="display:flex;flex-direction:column;gap:12px;">

        <!-- Gmail Absender -->
        <div style="background:var(--bg3);border:1px solid ${s.gcalOAuthClientId ? 'rgba(16,185,129,0.4)' : 'var(--border)'};border-radius:10px;padding:14px 16px;">
          <div style="display:flex;align-items:flex-start;gap:12px;">
            <div style="font-size:22px;margin-top:2px;">📨</div>
            <div style="flex:1;">
              <div style="font-weight:600;font-size:14px;margin-bottom:6px;">Absender-Gmail</div>
              <div style="font-size:13px;color:var(--text2);margin-bottom:10px;">
                E-Mails werden direkt über dein Gmail-Konto versendet. Nutzt dieselbe OAuth Client-ID wie der Google Kalender – kein extra Setup nötig.
              </div>
              <div class="form-grid">
                <div class="field full">
                  <label>Gmail-Adresse (Absender)</label>
                  <input type="email" id="s_gmailSender" placeholder="nawin.telis@gmail.com" value="${s.gmailSender || 'nawin.telis@gmail.com'}" />
                </div>
              </div>
              <div style="margin-top:10px;font-size:13px;color:${s.gcalOAuthClientId ? 'var(--green)' : 'var(--amber)'};">
                <i class="ti ti-${s.gcalOAuthClientId ? 'check-circle' : 'alert-circle'}"></i>
                ${s.gcalOAuthClientId
                  ? 'OAuth aktiv – E-Mails werden vollautomatisch über Gmail versendet'
                  : 'OAuth Client-ID fehlt – bitte unten im Google Kalender Abschnitt eintragen. Danach läuft alles automatisch.'}
              </div>
              <div style="margin-top:8px;font-size:12px;color:var(--text3);">
                <i class="ti ti-info-circle"></i> Beim ersten Versand öffnet sich einmalig ein Google-Login-Fenster zur Freigabe. Danach läuft alles im Hintergrund.
              </div>
            </div>
          </div>
        </div>

        <!-- ICS Kalender -->
        <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:14px 16px;">
          <div style="display:flex;align-items:flex-start;gap:12px;">
            <div style="font-size:22px;margin-top:2px;">📅</div>
            <div style="flex:1;">
              <div style="font-weight:600;font-size:14px;margin-bottom:4px;">Kalender-Einladung (.ics) in jeder E-Mail</div>
              <div style="font-size:13px;color:var(--text2);">
                Jede Terminbestätigung enthält automatisch eine <strong>.ics-Datei</strong> als Anhang. Der Empfänger klickt einmal drauf – Termin direkt im Kalender. Funktioniert mit Google, Apple, Outlook und allen anderen Kalender-Apps.
              </div>
              <div style="margin-top:8px;font-size:12px;color:var(--green);"><i class="ti ti-check-circle"></i> Immer aktiv – kein Setup nötig</div>
            </div>
          </div>
        </div>

        <!-- Automatik -->
        <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:14px 16px;">
          <div style="display:flex;align-items:flex-start;gap:12px;">
            <div style="font-size:22px;margin-top:2px;">⚡</div>
            <div style="flex:1;">
              <div style="font-weight:600;font-size:14px;margin-bottom:8px;">Automatik-Optionen</div>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:8px;">
                <input type="checkbox" id="s_autoConfirm" ${s.autoConfirm?'checked':''} />
                <span style="font-size:13px;">Bestätigung standardmäßig aktiviert (beim Einplanen eines Termins)</span>
              </label>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                <input type="checkbox" id="s_autoReminder" ${s.autoReminder?'checked':''} />
                <span style="font-size:13px;">Erinnerung standardmäßig aktiviert (am Tag des Termins)</span>
              </label>
            </div>
          </div>
        </div>

      </div>
    </div>

    <!-- ── GOOGLE KALENDER ── -->
    <div class="settings-section">
      <h3>Google Kalender API</h3>
      <p style="font-size:13px;color:var(--text2);margin-bottom:14px;">Jeder Google-Account braucht seinen eigenen API-Key. Beide findest du unter <a href="https://console.cloud.google.com" target="_blank" style="color:var(--accent);">console.cloud.google.com</a> → Calendar API → Anmeldedaten.</p>
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:12px;">
        <div style="font-size:13px;font-weight:600;color:var(--accent);margin-bottom:10px;">🟠 Kalender 1 – nawin.telis@gmail.com</div>
        <div class="form-grid">
          <div class="field full"><label>API-Key (Kalender 1)</label>
            <input type="password" id="s_gcalKey" placeholder="API-Key für nawin.telis@gmail.com..." value="${s.gcalKey||''}" />
          </div>
          <div class="field full"><label>Calendar-ID (Kalender 1)</label>
            <input type="text" id="s_gcalId" placeholder="nawin.telis@gmail.com" value="${s.gcalId||'nawin.telis@gmail.com'}" />
          </div>
        </div>
      </div>
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:14px;">
        <div style="font-size:13px;font-weight:600;color:#10b981;margin-bottom:10px;">🟢 Kalender 2 – nawin.dep@gmail.com</div>
        <div class="form-grid">
          <div class="field full"><label>API-Key (Kalender 2)</label>
            <input type="password" id="s_gcalKey2" placeholder="API-Key für nawin.dep@gmail.com..." value="${s.gcalKey2||''}" />
          </div>
          <div class="field full"><label>Calendar-ID (Kalender 2)</label>
            <input type="text" id="s_gcalId2" placeholder="nawin.dep@gmail.com" value="${s.gcalId2||'nawin.dep@gmail.com'}" />
          </div>
        </div>
      </div>
      <!-- OAuth für das Schreiben -->
      <div style="background:var(--bg3);border:1px solid rgba(167,139,250,0.3);border-radius:10px;padding:14px;margin-top:12px;">
        <div style="font-size:13px;font-weight:600;color:var(--purple);margin-bottom:6px;">🔐 OAuth 2.0 – Termine automatisch eintragen</div>
        <p style="font-size:12px;color:var(--text2);margin-bottom:10px;">
          Damit Termine automatisch in Google Kalender eingetragen werden, OAuth Client-ID eintragen.<br>
          <a href="https://console.cloud.google.com/apis/credentials" target="_blank" style="color:var(--accent);">Google Cloud Console</a>
          → OAuth 2.0-Client-IDs → Stift-Icon → Autorisierte JS-Quellen: <code style="font-size:11px;background:var(--bg2);padding:1px 5px;border-radius:3px;">https://nawin-asuramuni.github.io</code>
        </p>
        <div class="field full"><label>OAuth Client-ID</label>
          <input type="text" id="s_gcalOAuthClientId" placeholder="xxxxxx.apps.googleusercontent.com" value="${s.gcalOAuthClientId||''}" style="font-size:12px;" />
        </div>
        ${s.gcalOAuthClientId ? `<div style="margin-top:8px;font-size:12px;color:var(--green);"><i class="ti ti-check-circle"></i> OAuth aktiv – Termine werden automatisch eingetragen</div>` : `<div style="margin-top:8px;font-size:12px;color:var(--text3);"><i class="ti ti-info-circle"></i> Ohne OAuth wird beim Einplanen das Google Kalender-Fenster geöffnet</div>`}
      </div>
      <p style="font-size:12px;color:var(--text3);margin-top:8px;">
        ${s.gcalKey ? `<span style="color:var(--green)"><i class="ti ti-check-circle"></i> API-Key hinterlegt – Sync in beide Kalender aktiv</span>` : `<i class="ti ti-info-circle"></i> API-Key unter console.cloud.google.com → Calendar API erstellen`}
      </p>
      <button class="btn-ghost" id="loadGcalBtn" style="margin-top:10px;font-size:13px;">
        <i class="ti ti-refresh"></i> Termine aus Google Kalender laden
      </button>
    </div>

    <!-- ── OUTLOOK ── -->
    <div class="settings-section">
      <h3>Outlook / Microsoft 365 API</h3>
      <p style="font-size:13px;color:var(--text2);margin-bottom:14px;">
        Wird für den automatischen E-Mail-Versand der Terminbestätigung genutzt. Die App-Registrierung ist kostenlos und dauert ca. 3 Minuten.
      </p>
      <div class="form-grid">
        <div class="field full"><label>Microsoft App Client-ID</label>
          <input type="text" id="s_msClientId" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value="${s.msClientId||''}" />
        </div>
        <div class="field full"><label>Outlook E-Mail (Absender)</label>
          <input type="email" id="s_msEmail" placeholder="deine@outlook.com oder deine@hotmail.com" value="${s.msEmail||''}" />
        </div>
      </div>
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <button class="btn-ghost" id="testOutlookBtn" style="font-size:13px;">
          <i class="ti ti-send"></i> Verbindung testen
        </button>
        <span id="outlookTestResult" style="font-size:13px;"></span>
      </div>
      <p style="font-size:12px;color:var(--text3);margin-top:10px;">
        ${s.msClientId
          ? `<span style="color:var(--green)"><i class="ti ti-check-circle"></i> Client-ID hinterlegt – E-Mail-Versand aktiv</span>`
          : `<i class="ti ti-info-circle"></i> Anleitung: <a href="https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank" style="color:var(--accent);">portal.azure.com</a> → App registrations → New registration → Redirect URI: <code style="background:var(--bg3);padding:1px 4px;border-radius:3px;">https://nawin-asuramuni.github.io/Beratung/</code> → API permissions → Mail.Send (Delegated)`}
      </p>
    </div>

    <!-- ── MONDAY ── -->
    <div class="settings-section">
      <h3>Monday.com Integration</h3>
      <div class="form-grid">
        <div class="field full"><label>Monday API-Key</label>
          <input type="password" id="s_mondayKey" placeholder="API-Key aus Monday Einstellungen..." value="${s.mondayKey||''}" />
        </div>
        <div class="field full"><label>Board-ID</label>
          <input type="text" id="s_mondayBoard" placeholder="z.B. 1234567890" value="${s.mondayBoardId||''}" />
        </div>
      </div>
      <p style="font-size:12px;color:var(--text3);margin-top:8px;">Den API-Key findest du in Monday unter: Profilbild → Entwickler → API</p>
    </div>

    <!-- ── WEBSEITENEINSTELLUNGEN ── -->
    ${(() => {
      const ws = JSON.parse(localStorage.getItem('siteAdminSettings') || '{}');
      return `
    <div class="settings-section">
      <h3>🌐 Webseiteneinstellungen</h3>
      <p style="font-size:13px;color:var(--text2);margin-bottom:16px;">
        Einstellungen für die öffentliche Unternehmensberatungsseite – direkt hier verwaltbar.
      </p>

      <div style="display:flex;flex-direction:column;gap:12px;">

        <!-- Urlaubs-Banner -->
        <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:14px 16px;">
          <div style="font-weight:600;font-size:14px;margin-bottom:10px;">🌴 Urlaubs-Banner</div>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:10px;">
            <input type="checkbox" id="ws_vacationActive" ${ws.vacationActive ? 'checked' : ''} />
            <span style="font-size:13px;">Banner auf der Website anzeigen</span>
          </label>
          <input type="text" id="ws_vacationText"
            placeholder="Ich bin bis 01.08. im Urlaub. Ab 02.08. sind wieder Termine verfügbar."
            value="${ws.vacationText || ''}"
            style="width:100%;background:var(--bg2);border:1px solid var(--border2);color:var(--text);border-radius:8px;padding:8px 12px;font-size:13px;outline:none;font-family:inherit;" />
        </div>

        <!-- Kontaktdaten -->
        <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:14px 16px;">
          <div style="font-weight:600;font-size:14px;margin-bottom:12px;">📞 Kontaktdaten auf der Website</div>
          <div class="form-grid">
            <div class="field full"><label>Telefonnummer (Footer)</label>
              <input type="text" id="ws_phone" placeholder="+49 152 0233 3694" value="${ws.phone || ''}"
                style="background:var(--bg2);border:1px solid var(--border2);color:var(--text);border-radius:8px;padding:8px 12px;font-size:13px;outline:none;font-family:inherit;width:100%;" />
            </div>
            <div class="field full"><label>WhatsApp-Nummer (mit Ländervorwahl, ohne +)</label>
              <input type="text" id="ws_waNumber" placeholder="4915202333694" value="${ws.waNumber || ''}"
                style="background:var(--bg2);border:1px solid var(--border2);color:var(--text);border-radius:8px;padding:8px 12px;font-size:13px;outline:none;font-family:inherit;width:100%;" />
            </div>
            <div class="field full"><label>E-Mail-Adresse (Kontaktformular)</label>
              <input type="email" id="ws_email" placeholder="deine@email.de" value="${ws.email || ''}"
                style="background:var(--bg2);border:1px solid var(--border2);color:var(--text);border-radius:8px;padding:8px 12px;font-size:13px;outline:none;font-family:inherit;width:100%;" />
            </div>
          </div>
        </div>

      </div>
    </div>`;
    })()}

    <div style="margin-top:8px;">
      <button class="btn-primary" id="saveSettings"><i class="ti ti-device-floppy"></i> Alle Einstellungen speichern</button>
    </div>
  `;

  // ── Terminarten ──
  const defaultApptTypes = [
    { name: 'Erstgespräch', color: '#3b82f6', duration: 30 },
    { name: 'Beratungstermin', color: '#a78bfa', duration: 60 },
    { name: 'Folgegespräch', color: '#22c55e', duration: 20 },
  ];
  let apptTypes = JSON.parse(JSON.stringify(s.apptTypes || defaultApptTypes));

  function renderApptTypes() {
    document.getElementById('apptTypesList').innerHTML = apptTypes.map((t, i) => `
      <div style="display:flex;align-items:center;gap:8px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:10px 12px;flex-wrap:wrap;">
        <input type="color" value="${t.color}" data-idx="${i}" class="at-color"
          style="width:32px;height:32px;border:none;border-radius:6px;cursor:pointer;padding:2px;background:none;" />
        <input type="text" value="${t.name}" data-idx="${i}" class="at-name" placeholder="Terminart..."
          style="flex:1;min-width:120px;background:var(--bg2);border:1px solid var(--border2);color:var(--text);border-radius:6px;padding:6px 10px;font-size:14px;outline:none;" />
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="font-size:12px;color:var(--text3);">Dauer</span>
          <input type="number" value="${t.duration}" data-idx="${i}" class="at-dur" min="5" max="480" step="5"
            style="width:64px;background:var(--bg2);border:1px solid var(--border2);color:var(--text);border-radius:6px;padding:6px 8px;font-size:14px;outline:none;text-align:center;" />
          <span style="font-size:12px;color:var(--text3);">Min.</span>
        </div>
        <button onclick="window._deleteApptType(${i})" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:18px;padding:2px 4px;" title="Löschen"><i class="ti ti-trash"></i></button>
      </div>`).join('');
  }
  renderApptTypes();

  // ── Signatur-Bild Upload ──
  const sigInput = document.getElementById('s_sigImageInput');
  if (sigInput) {
    sigInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 500 * 1024) {
        toast('Bild zu groß (max. 500 KB). Bitte ein kleineres Bild wählen.', 'error');
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = ev.target.result;
        const preview = document.getElementById('s_sigImagePreview');
        if (preview) {
          preview.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-top:4px;">
              <img src="${base64}" style="max-height:40px;max-width:120px;object-fit:contain;border-radius:4px;" />
              <span style="font-size:12px;color:var(--green);flex:1;"><i class="ti ti-check-circle"></i> Bild bereit zum Speichern</span>
            </div>`;
        }
        // Insert {bild} placeholder into textarea if not already there
        const ta = document.getElementById('s_emailSig');
        if (ta && !ta.value.includes('{bild}')) {
          ta.value = ta.value + (ta.value.trim() ? '\n' : '') + '{bild}';
        }
        sigInput._pendingBase64 = base64;
        toast('Bild geladen – klicke auf Speichern, um es zu hinterlegen.');
      };
      reader.readAsDataURL(file);
    });
  }

  // ── Signatur-Bild entfernen ──
  document.getElementById('s_removeSigImage')?.addEventListener('click', () => {
    if (sigInput) sigInput._pendingBase64 = '__remove__';
    const ta = document.getElementById('s_emailSig');
    if (ta) ta.value = ta.value.replace(/\n?\{bild\}/g, '');
    const block = document.getElementById('s_removeSigImage')?.closest('div[style]');
    if (block) {
      block.innerHTML = `<div id="s_sigImagePreview" style="margin-top:8px;"><span style="font-size:12px;color:var(--text3);">Bild wird beim Speichern entfernt.</span></div>`;
    }
  });

  window._deleteApptType = (i) => { apptTypes.splice(i, 1); renderApptTypes(); };

  document.getElementById('addApptType').addEventListener('click', () => {
    apptTypes.push({ name: '', color: '#3b82f6', duration: 30 });
    renderApptTypes();
    // Focus new name input
    const inputs = document.querySelectorAll('.at-name');
    inputs[inputs.length - 1]?.focus();
  });

  // Toggle day rows opacity when checkbox changes
  document.querySelectorAll('.avail-day-toggle').forEach(cb => {
    const updateRow = () => {
      const day = cb.dataset.day;
      const timesDiv = document.querySelector(`.day-times-${day}`);
      if (timesDiv) {
        timesDiv.style.opacity = cb.checked ? '1' : '0.35';
        timesDiv.style.pointerEvents = cb.checked ? '' : 'none';
      }
    };
    updateRow();
    cb.addEventListener('change', updateRow);
  });

  document.getElementById('saveSettings').addEventListener('click', () => {
    // Collect per-day configs
    const dayConfigs = {};
    dayLabels.forEach(dl => {
      const enabled = document.querySelector(`.avail-day-toggle[data-day="${dl.v}"]`)?.checked || false;
      const start   = document.querySelector(`.day-start[data-day="${dl.v}"]`)?.value || '09:00';
      const end     = document.querySelector(`.day-end[data-day="${dl.v}"]`)?.value || '18:00';
      const breakStart = document.querySelector(`.day-break-start[data-day="${dl.v}"]`)?.value || '';
      const breakEnd   = document.querySelector(`.day-break-end[data-day="${dl.v}"]`)?.value || '';
      dayConfigs[dl.v] = { enabled, start, end, breakStart, breakEnd };
    });

    // Collect apptTypes from live inputs
    document.querySelectorAll('.at-name').forEach(el => { apptTypes[el.dataset.idx].name = el.value.trim(); });
    document.querySelectorAll('.at-color').forEach(el => { apptTypes[el.dataset.idx].color = el.value; });
    document.querySelectorAll('.at-dur').forEach(el => { apptTypes[el.dataset.idx].duration = parseInt(el.value) || 30; });
    apptTypes = apptTypes.filter(t => t.name);

    const blockedRaw = document.getElementById('s_blockedDates').value;
    const blockedDates = blockedRaw.split(',').map(d => d.trim()).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));

    // Derive legacy availDays / availStart / availEnd for calendar compatibility
    const availDays = Object.entries(dayConfigs).filter(([,v]) => v.enabled).map(([k]) => parseInt(k));
    const enabledConfigs = Object.values(dayConfigs).filter(v => v.enabled);
    const availStart = enabledConfigs.map(v => v.start).sort()[0] || '09:00';
    const availEnd   = enabledConfigs.map(v => v.end).sort().reverse()[0] || '18:00';

    const settings = {
      myEmail:            document.getElementById('s_myEmail').value.trim(),
      emailSig:           document.getElementById('s_emailSig').value,
      autoConfirm:        document.getElementById('s_autoConfirm').checked,
      autoReminder:       document.getElementById('s_autoReminder').checked,
      confirmSubject:     document.getElementById('s_confirmSubject').value.trim(),
      emailConfirmText:   document.getElementById('s_emailConfirmText').value,
      reminderSubject:    document.getElementById('s_reminderSubject').value.trim(),
      emailReminderText:  document.getElementById('s_emailReminderText').value,
      dayConfigs,
      availDays,
      availStart,
      availEnd,
      blockedDates,
      gcalOAuthClientId: document.getElementById('s_gcalOAuthClientId')?.value.trim() || '',
      gcalKey:      document.getElementById('s_gcalKey').value.trim(),
      gcalId:       document.getElementById('s_gcalId').value.trim(),
      gcalKey2:     document.getElementById('s_gcalKey2')?.value.trim() || '',
      gcalId2:      document.getElementById('s_gcalId2')?.value.trim() || 'nawin.dep@gmail.com',
      gmailSender:  document.getElementById('s_gmailSender')?.value.trim() || 'nawin.telis@gmail.com',
      msClientId:   document.getElementById('s_msClientId').value.trim(),
      msEmail:      document.getElementById('s_msEmail').value.trim(),
      mondayKey:    document.getElementById('s_mondayKey').value.trim(),
      mondayBoardId: document.getElementById('s_mondayBoard').value.trim(),
      apptTypes,
    };

    // Signatur-Bild
    const sigInp = document.getElementById('s_sigImageInput');
    if (sigInp?._pendingBase64 === '__remove__') {
      settings.emailSigImage = '';
    } else if (sigInp?._pendingBase64) {
      settings.emailSigImage = sigInp._pendingBase64;
    } else {
      settings.emailSigImage = s.emailSigImage || '';
    }

    localStorage.setItem('crmSettings', JSON.stringify(settings));

    // ── Webseiteneinstellungen separat speichern (wird von index.html gelesen) ──
    const siteSettings = {
      vacationActive: document.getElementById('ws_vacationActive')?.checked || false,
      vacationText:   document.getElementById('ws_vacationText')?.value.trim() || '',
      phone:          document.getElementById('ws_phone')?.value.trim() || '',
      waNumber:       document.getElementById('ws_waNumber')?.value.trim() || '',
      email:          document.getElementById('ws_email')?.value.trim() || '',
    };
    localStorage.setItem('siteAdminSettings', JSON.stringify(siteSettings));

    toast('Einstellungen gespeichert!');
  });

  // Google Kalender Import Button
  document.getElementById('loadGcalBtn')?.addEventListener('click', async () => {
    toast('Google Kalender werden geladen...');
    await loadGoogleCalendarEvents();
    const count = googleCalendarEvents.length;
    toast(count > 0 ? `✅ ${count} Termine aus Google Kalender geladen!` : 'Keine Termine gefunden oder API-Key fehlt.', count > 0 ? 'success' : 'error');
  });

  // Gmail Verbindung testen
  document.getElementById('testOutlookBtn')?.addEventListener('click', async () => {
    const resultEl = document.getElementById('outlookTestResult');
    resultEl.innerHTML = '<i class="ti ti-loader" style="animation:spin 1s linear infinite;display:inline-block;"></i> Gmail-Verbindung wird hergestellt...';
    resultEl.style.color = 'var(--text2)';
    const tmpSettings = JSON.parse(localStorage.getItem('crmSettings') || '{}');
    tmpSettings.msClientId = document.getElementById('s_msClientId').value.trim();
    tmpSettings.msEmail = document.getElementById('s_msEmail').value.trim();
    localStorage.setItem('crmSettings', JSON.stringify(tmpSettings));
    const token = await getGmailToken();
    if (token) {
      resultEl.innerHTML = '<i class="ti ti-check-circle"></i> Gmail verbunden – E-Mails können gesendet werden!';
      resultEl.style.color = 'var(--green)';
    } else {
      resultEl.innerHTML = '<i class="ti ti-x-circle"></i> Verbindung fehlgeschlagen – OAuth Client-ID prüfen.';
      resultEl.style.color = 'var(--red)';
    }
  });
}


// ============================================================
// BUCHUNGSLINK GENERIEREN
// ============================================================

// Beim Speichern der Einstellungen: publicSettings in Firestore synchronisieren
// (wird am Ende von renderSettings > saveSettings aufgerufen)
async function syncPublicSettings() {
  const s = JSON.parse(localStorage.getItem('crmSettings') || '{}');
  try {
    const { setDoc, doc: fsDoc } = await import("https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js");
    await setDoc(fsDoc(db, 'publicSettings', 'main'), {
      apptTypes:    s.apptTypes    || [],
      dayConfigs:   s.dayConfigs   || {},
      blockedDates: s.blockedDates || [],
      availDays:    s.availDays    || [],
      ownerName:    s.ownerName    || '',
      // Google Kalender API-Keys für die Buchungsseite (belegte Zeiten prüfen)
      gcalKey:  s.gcalKey  || '',
      gcalId:   s.gcalId   || '',
      gcalKey2: s.gcalKey2 || '',
      gcalId2:  s.gcalId2  || '',
    });
  } catch(e) {
    console.warn('publicSettings sync fehlgeschlagen:', e.message);
  }
}

// Buchungslink in Firestore anlegen und URL kopieren
window.generateBookingLink = async function(contactId) {
  const c = contacts.find(x => x.id === contactId);
  if (!c) return;

  // Zuerst publicSettings sicherstellen
  syncPublicSettings();

  const linkData = {
    contactId,
    contactVorname:  c.vorname  || '',
    contactNachname: c.nachname || '',
    contactTelefon:  c.telefon  || '',
    contactEmail:    c.email    || '',
    createdAt: serverTimestamp(),
    used: false,
  };

  try {
    const ref = await addDoc(collection(db, 'bookingLinks'), linkData);
    const linkId = ref.id;

    // GitHub Pages URL – passe DEIN_GITHUB_USERNAME und DEIN_REPO_NAME an!
    const baseUrl = `https://nawin-asuramuni.github.io/Beratung/booking.html`;
    const fullUrl = `${baseUrl}?lid=${linkId}`;

    await navigator.clipboard.writeText(fullUrl);
    toast(`✅ Link für ${c.vorname} kopiert!`, 'success');

    // Zusätzlich: Dialog mit dem Link anzeigen
    showBookingLinkDialog(c, fullUrl);
  } catch(e) {
    console.error(e);
    toast('Fehler beim Erstellen des Links.', 'error');
  }
};

function showBookingLinkDialog(contact, url) {
  // Remove existing dialog if any
  document.getElementById('bookingLinkDialog')?.remove();

  const dlg = document.createElement('div');
  dlg.id = 'bookingLinkDialog';
  dlg.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:400;
    display:flex;align-items:center;justify-content:center;padding:20px;
  `;
  dlg.innerHTML = `
    <div style="background:var(--bg2);border:1px solid var(--border2);border-radius:16px;
      padding:24px;width:100%;max-width:480px;animation:modalIn .2s ease;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <h2 style="font-size:16px;font-weight:600;display:flex;align-items:center;gap:8px;">
          <i class="ti ti-link" style="color:var(--purple);"></i> Buchungslink
        </h2>
        <button onclick="document.getElementById('bookingLinkDialog').remove()"
          style="background:none;border:none;color:var(--text2);cursor:pointer;font-size:20px;">
          <i class="ti ti-x"></i>
        </button>
      </div>
      <p style="font-size:13px;color:var(--text2);margin-bottom:12px;">
        Schick diesen Link an <strong>${contact.vorname} ${contact.nachname}</strong> –
        sie können darüber direkt einen Termin buchen.
      </p>
      <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:8px;
        padding:10px 12px;font-size:12px;color:var(--accent);font-family:'DM Mono',monospace;
        word-break:break-all;margin-bottom:14px;line-height:1.5;">${url}</div>
      <div style="display:flex;gap:8px;">
        <button onclick="navigator.clipboard.writeText('${url}').then(()=>window.toast('Kopiert!','success'))"
          class="btn-primary" style="flex:1;margin-top:0;">
          <i class="ti ti-copy"></i> Kopieren
        </button>
        ${contact.email ? `
        <a href="mailto:${contact.email}?subject=Dein%20Buchungslink&body=Hallo%20${encodeURIComponent(contact.vorname)}%2C%0A%0Ahier%20ist%20dein%20pers%C3%B6nlicher%20Buchungslink%3A%0A${encodeURIComponent(url)}%0A%0AMit%20freundlichen%20Gr%C3%BC%C3%9Fen"
          class="btn-ghost" style="flex:1;">
          <i class="ti ti-mail"></i> Per E-Mail
        </a>` : ''}
        ${contact.telefon ? `
        <a href="https://wa.me/${contact.telefon.replace(/[^0-9]/g,'')}?text=${encodeURIComponent('Hallo ' + contact.vorname + ', hier ist dein persönlicher Buchungslink: ' + url)}"
          target="_blank" class="btn-ghost" style="flex:1;color:var(--green);border-color:rgba(34,197,94,0.35);">
          <i class="ti ti-brand-whatsapp"></i> WhatsApp
        </a>` : ''}
      </div>
    </div>
  `;
  document.body.appendChild(dlg);
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.remove(); });
}

// ============================================================
// AUTH – Google Login
// ============================================================

// Deine erlaubte Google-E-Mail (nur diese kommt rein)
const ALLOWED_EMAIL = "nawin.telis@gmail.com";

function showLoginScreen() {
  document.getElementById('auth-loading')?.remove();
  document.getElementById('content').innerHTML = '';
  document.getElementById('pageTitle').textContent = 'Lead Tracker';

  const loginDiv = document.createElement('div');
  loginDiv.id = 'login-screen';
  loginDiv.style.cssText = `
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    min-height:70vh;gap:24px;text-align:center;
  `;
  loginDiv.innerHTML = `
    <div style="background:var(--bg2);border:1px solid var(--border2);border-radius:20px;
      padding:48px 40px;max-width:380px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.4);">
      <div style="font-size:48px;margin-bottom:16px;">🔐</div>
      <h2 style="font-size:22px;font-weight:700;margin-bottom:8px;color:var(--text);">Lead Tracker</h2>
      <p style="font-size:14px;color:var(--text3);margin-bottom:32px;">
        Privater Zugang – nur für autorisierte Nutzer
      </p>
      <button id="google-login-btn" style="
        display:flex;align-items:center;justify-content:center;gap:12px;
        width:100%;padding:13px 20px;border-radius:12px;border:1px solid var(--border2);
        background:var(--bg3);color:var(--text);font-size:15px;font-weight:500;
        cursor:pointer;transition:all 0.2s;font-family:inherit;
      ">
        <svg width="20" height="20" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Mit Google anmelden
      </button>
      <p id="login-error" style="margin-top:16px;font-size:12px;color:var(--red);display:none;"></p>
    </div>
  `;
  document.body.appendChild(loginDiv);

  document.getElementById('google-login-btn').addEventListener('click', async () => {
    const btn = document.getElementById('google-login-btn');
    btn.textContent = 'Anmelden...';
    btn.disabled = true;
    try {
      await signInWithPopup(auth, provider);
    } catch (e) {
      btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg> Mit Google anmelden`;
      btn.disabled = false;
      const err = document.getElementById('login-error');
      err.textContent = 'Anmeldung fehlgeschlagen. Bitte erneut versuchen.';
      err.style.display = 'block';
    }
  });
}

function hideLoginScreen() {
  document.getElementById('auth-loading')?.remove();
  document.getElementById('login-screen')?.remove();
}

function showLogoutBtn(user) {
  document.getElementById('topAddBtn').insertAdjacentHTML('beforebegin', `
    <div id="user-info" style="display:flex;align-items:center;gap:8px;margin-right:4px;">
      <img src="${user.photoURL || ''}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;border:2px solid var(--border2);" onerror="this.style.display='none'"/>
      <button id="logout-btn" title="Abmelden" style="
        background:none;border:1px solid var(--border2);color:var(--text3);
        border-radius:8px;padding:5px 10px;font-size:12px;cursor:pointer;
        font-family:inherit;transition:all 0.15s;
      ">Abmelden</button>
    </div>
  `);
  document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));
}

function hideLogoutBtn() {
  document.getElementById('user-info')?.remove();
}

// Auth State Observer – steuert alles
onAuthStateChanged(auth, (user) => {
  if (user) {
    // Prüfen ob E-Mail erlaubt ist
    if (user.email !== ALLOWED_EMAIL) {
      signOut(auth);
      showLoginScreen();
      setTimeout(() => {
        const err = document.getElementById('login-error');
        if (err) {
          err.textContent = `Zugriff verweigert: ${user.email} ist nicht autorisiert.`;
          err.style.display = 'block';
        }
      }, 100);
      return;
    }
    hideLoginScreen();
    showLogoutBtn(user);
    window.navigate = navigate;
    loadContacts();
    loadCallSlots();
    loadGoogleCalendarEvents();
    renderDashboard();
  } else {
    hideLogoutBtn();
    showLoginScreen();
  }
});
