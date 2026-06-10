// ============================================================
// KLEINANZEIGEN PAGE – v2 (Firebase Live-Daten aus Extension)
// Firebase Version: 11.3.1 (muss mit app.js übereinstimmen)
// ============================================================

import {
  getFirestore, collection, addDoc, updateDoc, deleteDoc,
  doc, query, orderBy, onSnapshot
} from 'https://www.gstatic.com/firebasejs/11.3.1/firebase-firestore.js';
import { getApp } from 'https://www.gstatic.com/firebasejs/11.3.1/firebase-app.js';

// ── Firebase: bestehende Instanz aus app.js wiederverwenden (kein doppeltes Init) ──
const kaDb = getFirestore(getApp());

// ── Social Media Channels ─────────────────────────────────────
const KA_SOCIAL_CHANNELS = ['Instagram','TikTok','LinkedIn','Xing','Facebook','Bumble for Friends'];

const KA_CHANNEL_COLORS = {
  Instagram:            { c:'#e1306c', bg:'rgba(225,48,108,0.1)'  },
  TikTok:               { c:'#69c9d0', bg:'rgba(105,201,208,0.1)' },
  LinkedIn:             { c:'#0a66c2', bg:'rgba(10,102,194,0.1)'  },
  Xing:                 { c:'#026466', bg:'rgba(2,100,102,0.1)'   },
  Facebook:             { c:'#1877f2', bg:'rgba(24,119,242,0.1)'  },
  'Bumble for Friends': { c:'#f5a623', bg:'rgba(245,166,35,0.1)'  },
};

// ── State ─────────────────────────────────────────────────────
let kaActiveTab            = 'aktive';
let kaActiveSubTab         = 'sub-steuerberater';
let kaActiveNestedTab      = 'steuer-privat-pane';
let kaFirebaseLeads        = [];
let kaFirebaseAvailable    = false;
let kaUnsubscribe          = null;
// Social Media Inbox State
let kaSocialMessages       = [];
let kaSocialUnsubscribe    = null;
let kaSocialActiveFilter   = 'alle';

// ── Vorlagen-State (localStorage-backed) ─────────────────────
const KA_VORLAGEN_DEFAULTS = {
  ka_activeMessage:        'Hallo! Ich habe Ihre Anzeige bezüglich eines Nebenverdienstes gesehen. Da wir aktuell Unterstützung im Raum Ulm suchen, würde ich mich über ein kurzes Telefonat freuen. Wann passt es Ihnen am besten?',
  ka_passiveMessage:       'Hallo! Wir suchen aktuell bundesweit Unterstützung für eine flexible Tätigkeit im Homeoffice/Nebenverdienst. Hätten Sie Zeit für ein kurzes Telefonat?',
  ka_steuerPrivatMessage:  'Hallo! Ich habe Ihre Anfrage bezüglich Unterstützung bei der Steuererklärung gesehen. Gerne helfe ich Ihnen im privaten Bereich weiter. Wann passt ein kurzes Telefonat?',
  ka_steuerFirmaMessage:   'Guten Tag! Bezüglich Ihrer Suche nach strategischer Steuer- und Buchhaltungsberatung unterstütze ich Sie gerne.',
  ka_versicherungMessage:  'Hallo! Gerne prüfe ich Ihre Absicherungen auf Einsparpotenziale. Wann können wir hierzu kurz sprechen?',
  ka_kreditMessage:        'Hallo! Ich habe Ihre Finanzierungsanfrage gesehen. Ich erstelle Ihnen gerne einen unabhängigen Vergleich.',
  ka_finanzberaterMessage: 'Hallo! Gerne unterstütze ich Sie bei Ihrem Vermögensaufbau. Wann hätten Sie Zeit für ein Erstgespräch?',
  ka_sonstigesMessage:     'Hallo! Ich helfe Ihnen gerne beim Thema Vermögensaufbau und staatliche Förderungen.',
};

function kaGetVorlage(id) {
  try {
    const saved = localStorage.getItem('kaVorlage_' + id);
    return saved !== null ? saved : (KA_VORLAGEN_DEFAULTS[id] || '');
  } catch { return KA_VORLAGEN_DEFAULTS[id] || ''; }
}

window.kaSaveVorlage = function(id) {
  const el = document.getElementById(id);
  if (!el) return;
  try {
    localStorage.setItem('kaVorlage_' + id, el.value);
    window.toast?.('Vorlage gespeichert ✓', 'success');
  } catch (e) {
    window.toast?.('Speichern fehlgeschlagen: ' + e.message, 'error');
  }
};

window.kaResetVorlage = function(id) {
  try {
    localStorage.removeItem('kaVorlage_' + id);
    const el = document.getElementById(id);
    if (el) el.value = KA_VORLAGEN_DEFAULTS[id] || '';
    window.toast?.('Vorlage zurückgesetzt ✓', 'success');
  } catch (e) {
    window.toast?.('Fehler: ' + e.message, 'error');
  }
};

// ── Firebase Live-Listener ────────────────────────────────────
function kaInitFirebase() {
  // kaLeads Listener
  try {
    const q = query(collection(kaDb, 'kaLeads'), orderBy('eingelesen', 'desc'));
    kaUnsubscribe = onSnapshot(q, snap => {
      kaFirebaseLeads = [];
      snap.forEach(d => kaFirebaseLeads.push({ id: d.id, ...d.data() }));
      kaFirebaseAvailable = true;
      const contentEl = document.getElementById('content');
      if (contentEl && document.querySelector('.nav-item.active[data-page="kleinanzeigen"]')) {
        renderKleinanzeigen();
      }
    }, err => {
      console.warn('[KA] Firebase Listener Fehler:', err.message);
      kaFirebaseAvailable = false;
    });
  } catch (e) {
    console.warn('[KA] Firebase-Init fehlgeschlagen:', e.message);
    kaFirebaseAvailable = false;
  }

  // socialMessages Listener
  try {
    const sq = query(collection(kaDb, 'socialMessages'), orderBy('eingelesen', 'desc'));
    kaSocialUnsubscribe = onSnapshot(sq, snap => {
      kaSocialMessages = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (document.querySelector('.nav-item.active[data-page="kleinanzeigen"]')
          && kaActiveTab === 'socialMedia') {
        const el = document.getElementById('ka-tab-content');
        if (el) el.innerHTML = kaRenderSocialMedia();
      }
    }, err => console.warn('[KA Social] Listener Fehler:', err.message));
  } catch (e) {
    console.warn('[KA Social] Firebase-Init fehlgeschlagen:', e.message);
  }
}

// ── Lead-Filter-Hilfsfunktion ─────────────────────────────────
function kaGetLeads(kategorie, subKat = null, status = null) {
  return kaFirebaseLeads.filter(l => {
    if (l.kategorie !== kategorie) return false;
    if (subKat  && l.subKat  !== subKat)  return false;
    if (status  && l.status  !== status)  return false;
    return true;
  });
}

// ── UI-Hilfsfunktionen ────────────────────────────────────────
function kaCounter(n, color = 'var(--text2)') {
  return `<span style="background:var(--bg3);border:1px solid var(--border);color:${color};border-radius:20px;padding:2px 10px;font-size:12px;font-weight:600;">${n}</span>`;
}

function kaTabBtn(id, label, active) {
  return `<button onclick="kaOpenTab('${id}')"
    style="display:inline-flex;align-items:center;gap:6px;padding:9px 16px;border-radius:8px;
      font-size:14px;font-weight:500;cursor:pointer;
      border:1px solid ${active ? 'rgba(59,130,246,0.5)' : 'var(--border2)'};
      background:${active ? 'rgba(59,130,246,0.12)' : 'var(--bg3)'};
      color:${active ? 'var(--accent)' : 'var(--text2)'};
      font-family:inherit;transition:all .15s;"
    onmouseover="if(!${active})this.style.background='var(--surface2)';if(!${active})this.style.color='var(--text)'"
    onmouseout="if(!${active})this.style.background='var(--bg3)';if(!${active})this.style.color='var(--text2)'"
  >${label}</button>`;
}

function kaSubTabBtn(id, label, active) {
  return `<button onclick="kaOpenSubTab('${id}')"
    style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:8px;
      font-size:13px;font-weight:500;cursor:pointer;
      border:1px solid ${active ? 'rgba(167,139,250,0.4)' : 'var(--border)'};
      background:${active ? 'rgba(167,139,250,0.1)' : 'transparent'};
      color:${active ? 'var(--purple)' : 'var(--text3)'};
      font-family:inherit;transition:all .15s;"
  >${label}</button>`;
}

function kaNestedTabBtn(id, label, active) {
  return `<button onclick="kaOpenNestedTab('${id}')"
    style="display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:6px;
      font-size:12px;font-weight:500;cursor:pointer;
      border:1px solid ${active ? 'rgba(59,130,246,0.35)' : 'var(--border)'};
      background:${active ? 'rgba(59,130,246,0.1)' : 'var(--bg3)'};
      color:${active ? 'var(--accent)' : 'var(--text3)'};
      font-family:inherit;transition:all .15s;"
  >${label}</button>`;
}

function kaStatusPill(status) {
  const map = {
    neu:              { c:'var(--accent)', bg:'rgba(59,130,246,0.1)',  label:'Neu' },
    angeschrieben:    { c:'var(--amber)',  bg:'rgba(245,158,11,0.1)',  label:'Angeschrieben' },
    kontakt_angelegt: { c:'var(--green)', bg:'rgba(34,197,94,0.1)',   label:'Kontakt angelegt' }
  };
  const s = map[status] || map['neu'];
  return `<span style="font-size:11px;color:${s.c};background:${s.bg};border:1px solid ${s.c}33;padding:2px 8px;border-radius:20px;">${s.label}</span>`;
}

function kaPanel(title, content) {
  return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:18px;">
    <div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:14px;">${title}</div>
    ${content}
  </div>`;
}

function kaTextarea(id, _defaultIgnored) {
  const saved = kaGetVorlage(id);
  return `
    <textarea id="${id}" rows="3"
      style="width:100%;background:var(--bg3);border:1px solid var(--border2);color:var(--text);
        border-radius:8px;padding:10px 12px;font-size:13px;font-family:inherit;
        outline:none;resize:vertical;line-height:1.5;"
      onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border2)'"
    >${saved}</textarea>
    <div style="display:flex;gap:6px;margin-top:8px;">
      <button onclick="kaSaveVorlage('${id}')"
        style="flex:1;padding:6px 10px;border-radius:7px;border:none;
          background:var(--accent);color:#fff;font-size:11px;font-weight:600;
          cursor:pointer;font-family:inherit;">
        💾 Vorlage speichern
      </button>
      <button onclick="kaResetVorlage('${id}')"
        style="padding:6px 10px;border-radius:7px;border:1px solid var(--border2);
          background:transparent;color:var(--text3);font-size:11px;
          cursor:pointer;font-family:inherit;" title="Auf Standard zurücksetzen">
        ↺ Reset
      </button>
    </div>`;
}

function kaSectionTitle(label, count, color) {
  return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
    <h3 style="font-size:15px;font-weight:600;color:var(--text);">${label}</h3>
    ${kaCounter(count, color)}
  </div>`;
}

function kaStatusBanner() {
  if (kaFirebaseAvailable) {
    const neu = kaFirebaseLeads.filter(l => l.status === 'neu').length;
    return `<div style="background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.2);
      border-radius:8px;padding:8px 14px;margin-bottom:16px;font-size:11px;color:var(--green);
      display:flex;align-items:center;gap:8px;">
      <i class="ti ti-wifi"></i>
      Live-Sync aktiv · ${kaFirebaseLeads.length} Leads gesamt · ${neu} neu
    </div>`;
  }
  return `<div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);
    border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:12px;color:var(--amber);
    display:flex;align-items:center;gap:8px;">
    <i class="ti ti-wifi-off"></i>
    Keine Firebase-Verbindung — Chrome Extension installiert und aktiv?
  </div>`;
}

// ── Lead-Card (Firebase-Daten) ────────────────────────────────
function kaLeadCard(lead, msgTextareaId) {
  const ort    = lead.ort   || 'Unbekannt';
  const titel  = lead.titel || '(Kein Titel)';
  const text   = lead.text  || '';
  const link   = lead.link  || '#';
  const since  = lead.eingelesen?.toDate
    ? lead.eingelesen.toDate().toLocaleDateString('de-DE')
    : '';
  const ageMeta = lead.age ? `${lead.age} J. · ` : '';

  const contactBtn = lead.status !== 'kontakt_angelegt'
    ? `<button onclick="kaOpenContactFromLead('${lead.id}')"
        style="display:inline-flex;align-items:center;gap:5px;padding:6px 11px;border-radius:8px;
          border:1px solid rgba(34,197,94,0.35);background:rgba(34,197,94,0.08);
          color:var(--green);font-size:12px;font-weight:500;cursor:pointer;font-family:inherit;"
        onmouseover="this.style.background='rgba(34,197,94,0.18)'" onmouseout="this.style.background='rgba(34,197,94,0.08)'">
        <i class="ti ti-user-plus"></i> Als Kontakt anlegen
      </button>`
    : `<span style="font-size:12px;color:var(--green);"><i class="ti ti-check"></i> Kontakt angelegt</span>`;

  const angeschriebenBtn = lead.status === 'neu'
    ? `<button onclick="kaMarkAngeschrieben('${lead.id}')"
        style="display:inline-flex;align-items:center;gap:5px;padding:6px 11px;border-radius:8px;
          border:1px solid rgba(245,158,11,0.3);background:rgba(245,158,11,0.08);
          color:var(--amber);font-size:12px;font-weight:500;cursor:pointer;font-family:inherit;">
        <i class="ti ti-mail"></i> Angeschrieben
      </button>` : '';

  return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);
    padding:14px 16px;margin-bottom:10px;transition:border-color .15s;"
    onmouseover="this.style.borderColor='var(--border2)'" onmouseout="this.style.borderColor='var(--border)'">
    <div style="display:flex;align-items:flex-start;gap:12px;">
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
          <a href="${link}" target="_blank" rel="noopener"
            style="font-weight:600;font-size:14px;color:var(--text);text-decoration:none;"
            onmouseover="this.style.color='var(--accent)'" onmouseout="this.style.color='var(--text)'">
            ${titel} <i class="ti ti-external-link" style="font-size:11px;opacity:.6;"></i>
          </a>
          ${kaStatusPill(lead.status)}
          ${lead.keinAlter ? '<span style="font-size:11px;color:var(--amber);background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.25);padding:2px 7px;border-radius:20px;">⚠ Kein Alter</span>' : ''}
        </div>
        <div style="font-size:12px;color:var(--accent);margin-bottom:6px;">${ageMeta}${ort}${since ? ' · ' + since : ''}</div>
        <div style="font-size:13px;color:var(--text2);line-height:1.5;margin-bottom:8px;">"${text.substring(0,200)}${text.length>200?'…':''}"</div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          ${contactBtn}
          ${angeschriebenBtn}
          <button onclick="kaDeleteLead('${lead.id}')"
            style="display:inline-flex;align-items:center;gap:4px;padding:6px 10px;border-radius:8px;
              border:1px solid rgba(239,68,68,0.2);background:transparent;
              color:#f87171;font-size:12px;cursor:pointer;font-family:inherit;">
            <i class="ti ti-trash"></i>
          </button>
        </div>
      </div>
      <button onclick="kaCopy('${msgTextareaId}')"
        style="flex-shrink:0;display:inline-flex;align-items:center;gap:6px;padding:8px 14px;
          border-radius:8px;border:1px solid var(--border2);background:var(--bg3);
          color:var(--text2);font-size:12px;font-weight:500;cursor:pointer;font-family:inherit;
          transition:all .15s;white-space:nowrap;"
        onmouseover="this.style.background='var(--surface2)';this.style.color='var(--text)'"
        onmouseout="this.style.background='var(--bg3)';this.style.color='var(--text2)'">
        <i class="ti ti-copy"></i> Kopieren
      </button>
    </div>
  </div>`;
}

// ── Tab-Inhalte ────────────────────────────────────────────────
function kaRenderAktive() {
  const neu = kaGetLeads('aktive').filter(l => l.status === 'neu');
  const all = kaGetLeads('aktive');
  return `
    ${kaStatusBanner()}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
      ${kaPanel('Aktive Suchkriterien (Lokal)', `
        <div style="display:flex;flex-direction:column;gap:8px;">
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px;">
            <span style="color:var(--text2);">Alter</span><span style="color:var(--text);">18 – 49 Jahre</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px;">
            <span style="color:var(--text2);">Umkreis</span><span style="color:var(--text);">≤ 100 km um Ulm</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;">
            <span style="color:var(--text2);">Gesamt</span>
            <span style="color:var(--accent);font-weight:600;">${all.length} Leads · ${neu.length} neu</span>
          </div>
        </div>`)}
      ${kaPanel('Standard-Anschreiben', kaTextarea('ka_activeMessage', 'Hallo! Ich habe Ihre Anzeige bezüglich eines Nebenverdienstes gesehen. Da wir aktuell Unterstützung im Raum Ulm suchen, würde ich mich über ein kurzes Telefonat freuen. Wann passt es Ihnen am besten?'))}
    </div>
    ${kaSectionTitle('Gefilterte Profile im Umkreis:', neu.length, 'var(--accent)')}
    ${neu.length > 0 ? neu.map(l => kaLeadCard(l, 'ka_activeMessage')).join('') : '<div class="empty-state"><i class="ti ti-users"></i><p>Keine neuen Aktiv-Leads</p></div>'}
  `;
}

function kaRenderPassive() {
  const neu = kaGetLeads('passive').filter(l => l.status === 'neu');
  const all = kaGetLeads('passive');
  return `
    ${kaStatusBanner()}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
      ${kaPanel('Passive Suchkriterien (Überregional)', `
        <div style="display:flex;flex-direction:column;gap:8px;">
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px;">
            <span style="color:var(--text2);">Umkreis</span><span style="color:var(--text);">Deutschlandweit</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;">
            <span style="color:var(--text2);">Gesamt</span>
            <span style="color:var(--accent);font-weight:600;">${all.length} Leads · ${neu.length} neu</span>
          </div>
        </div>`)}
      ${kaPanel('Anschreiben (Passiv)', kaTextarea('ka_passiveMessage', 'Hallo! Wir suchen aktuell bundesweit Unterstützung für eine flexible Tätigkeit im Homeoffice/Nebenverdienst. Hätten Sie Zeit für ein kurzes Telefonat?'))}
    </div>
    ${kaSectionTitle('Gefilterte Profile (Restliches DE):', neu.length, 'var(--accent)')}
    ${neu.length > 0 ? neu.map(l => kaLeadCard(l, 'ka_passiveMessage')).join('') : '<div class="empty-state"><i class="ti ti-world"></i><p>Keine neuen Passiv-Leads</p></div>'}
  `;
}

function kaRenderMandanten() {
  const subTabs = [
    { id:'sub-steuerberater', label:'<i class="ti ti-file-invoice"></i> Steuerberater' },
    { id:'sub-versicherung',  label:'<i class="ti ti-shield"></i> Versicherung' },
    { id:'sub-kredit',        label:'<i class="ti ti-building-bank"></i> Kredit' },
    { id:'sub-finanzberater', label:'<i class="ti ti-chart-line"></i> Finanzberater' },
    { id:'sub-sonstiges',     label:'<i class="ti ti-dots"></i> Sonstiges' },
  ];

  const neuOf = subKat => kaGetLeads('mandanten', subKat).filter(l => l.status === 'neu');

  const subContents = {
    'sub-steuerberater': () => {
      const privat = neuOf('steuerberater').filter(l => !l.isFirm);
      const firma  = neuOf('steuerberater').filter(l => l.isFirm);
      const nested = [
        { id:'steuer-privat-pane', label:'Privatpersonen' },
        { id:'steuer-firma-pane',  label:'Unternehmen / Gewerbe' },
      ];
      const nc = {
        'steuer-privat-pane': `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
            ${kaPanel('Filter-Modus: Steuerberater (Privat)', '<p style="font-size:13px;color:var(--text2);">Zeigt Anfragen von Privatpersonen.</p>')}
            ${kaPanel('Anschreiben', kaTextarea('ka_steuerPrivatMessage', 'Hallo! Ich habe Ihre Anfrage bezüglich Unterstützung bei der Steuererklärung gesehen. Gerne helfe ich Ihnen im privaten Bereich weiter. Wann passt ein kurzes Telefonat?'))}
          </div>
          ${kaSectionTitle('Privatpersonen Anfragen:', privat.length, 'var(--purple)')}
          ${privat.map(l => kaLeadCard(l, 'ka_steuerPrivatMessage')).join('') || '<div class="empty-state"><i class="ti ti-file-invoice"></i><p>Keine Treffer</p></div>'}`,
        'steuer-firma-pane': `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
            ${kaPanel('Filter-Modus: Steuerberater (Gewerblich)', '<p style="font-size:13px;color:var(--text2);">Filtert Firmen/Gewerbe.</p>')}
            ${kaPanel('Anschreiben', kaTextarea('ka_steuerFirmaMessage', 'Guten Tag! Bezüglich Ihrer Suche nach strategischer Steuer- und Buchhaltungsberatung unterstütze ich Sie gerne.'))}
          </div>
          ${kaSectionTitle('Unternehmen Anfragen:', firma.length, 'var(--purple)')}
          ${firma.map(l => kaLeadCard(l, 'ka_steuerFirmaMessage')).join('') || '<div class="empty-state"><i class="ti ti-building"></i><p>Keine Treffer</p></div>'}`
      };
      return `
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;">
          ${nested.map(t => kaNestedTabBtn(t.id, t.label, kaActiveNestedTab === t.id)).join('')}
        </div>
        ${nc[kaActiveNestedTab] || nc['steuer-privat-pane']}`;
    },
    'sub-versicherung': () => {
      const list = neuOf('versicherung');
      return `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
          ${kaPanel('Filter-Modus: Versicherung', '')}
          ${kaPanel('Anschreiben', kaTextarea('ka_versicherungMessage', 'Hallo! Gerne prüfe ich Ihre Absicherungen auf Einsparpotenziale. Wann können wir hierzu kurz sprechen?'))}
        </div>
        ${kaSectionTitle('Anfragen Versicherungen:', list.length, 'var(--amber)')}
        ${list.map(l => kaLeadCard(l, 'ka_versicherungMessage')).join('') || '<div class="empty-state"><i class="ti ti-shield"></i><p>Keine Treffer</p></div>'}`;
    },
    'sub-kredit': () => {
      const list = neuOf('kredit');
      return `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
          ${kaPanel('Filter-Modus: Kredit & Finanzierung', '')}
          ${kaPanel('Anschreiben', kaTextarea('ka_kreditMessage', 'Hallo! Ich habe Ihre Finanzierungsanfrage gesehen. Ich erstelle Ihnen gerne einen unabhängigen Vergleich.'))}
        </div>
        ${kaSectionTitle('Anfragen Finanzierungen:', list.length, 'var(--green)')}
        ${list.map(l => kaLeadCard(l, 'ka_kreditMessage')).join('') || '<div class="empty-state"><i class="ti ti-building-bank"></i><p>Keine Treffer</p></div>'}`;
    },
    'sub-finanzberater': () => {
      const list = neuOf('finanzberater');
      return `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
          ${kaPanel('Filter-Modus: Finanzberatung', '')}
          ${kaPanel('Anschreiben', kaTextarea('ka_finanzberaterMessage', 'Hallo! Gerne unterstütze ich Sie bei Ihrem Vermögensaufbau. Wann hätten Sie Zeit für ein Erstgespräch?'))}
        </div>
        ${kaSectionTitle('Kundenanfragen Finanzberatung:', list.length, 'var(--accent)')}
        ${list.map(l => kaLeadCard(l, 'ka_finanzberaterMessage')).join('') || '<div class="empty-state"><i class="ti ti-chart-line"></i><p>Keine Treffer</p></div>'}`;
    },
    'sub-sonstiges': () => {
      const list = neuOf('sonstiges');
      return `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
          ${kaPanel('Allfinanz / Sonstiges', '')}
          ${kaPanel('Anschreiben', kaTextarea('ka_sonstigesMessage', 'Hallo! Ich helfe Ihnen gerne beim Thema Vermögensaufbau und staatliche Förderungen.'))}
        </div>
        ${kaSectionTitle('Allfinanz Anfragen:', list.length, 'var(--text2)')}
        ${list.map(l => kaLeadCard(l, 'ka_sonstigesMessage')).join('') || '<div class="empty-state"><i class="ti ti-dots"></i><p>Keine Treffer</p></div>'}`;
    }
  };

  const renderFn = subContents[kaActiveSubTab] || subContents['sub-steuerberater'];
  return `
    ${kaStatusBanner()}
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:20px;padding-bottom:14px;border-bottom:1px solid var(--border);">
      ${subTabs.map(t => kaSubTabBtn(t.id, t.label, kaActiveSubTab === t.id)).join('')}
    </div>
    ${renderFn()}
  `;
}

function kaRenderAngeschrieben() {
  const list = kaFirebaseLeads.filter(l => l.status === 'angeschrieben');
  return `
    ${kaStatusBanner()}
    <div style="margin-bottom:16px;">
      ${kaSectionTitle('Bereits angeschrieben:', list.length, 'var(--amber)')}
      <p style="font-size:12px;color:var(--text3);margin-bottom:16px;">Leads die kontaktiert wurden. Nach 7 Tagen ohne Reaktion werden sie automatisch gelöscht.</p>
    </div>
    ${list.length > 0 ? list.map(l => kaLeadCard(l, 'ka_angeschriebenMsg')).join('') : '<div class="empty-state"><i class="ti ti-mail-off"></i><p>Noch niemanden angeschrieben</p></div>'}
    <textarea id="ka_angeschriebenMsg" style="display:none;"></textarea>
  `;
}

function kaRenderSocialMedia() {
  const neuCount = kaSocialMessages.filter(m => m.status === 'neu').length;
  const filtered = kaSocialActiveFilter === 'alle'
    ? kaSocialMessages
    : kaSocialMessages.filter(m => m.kanal === kaSocialActiveFilter);

  // Kanal-Filter-Chips
  const chips = ['alle', ...KA_SOCIAL_CHANNELS].map(k => {
    const active = kaSocialActiveFilter === k;
    const col    = KA_CHANNEL_COLORS[k];
    const count  = k === 'alle'
      ? kaSocialMessages.length
      : kaSocialMessages.filter(m => m.kanal === k).length;
    return `<button onclick="kaSocialSetFilter('${k}')"
      style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:20px;
        font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .15s;
        border:1px solid ${active ? (col?.c || 'var(--accent)') : 'var(--border)'};
        background:${active ? (col?.bg || 'rgba(59,130,246,0.1)') : 'transparent'};
        color:${active ? (col?.c || 'var(--accent)') : 'var(--text3)'};">
      ${k === 'alle' ? '<i class="ti ti-filter"></i> Alle' : k}
      <span style="background:var(--bg3);border-radius:10px;padding:1px 6px;font-size:11px;">${count}</span>
    </button>`;
  }).join('');

  // Eingabe-Panel
  const inputPanel = `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:18px;margin-bottom:20px;">
      <div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:14px;">
        <i class="ti ti-plus"></i> Neue Nachricht eintragen (Copy & Paste)
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
        <div>
          <label style="font-size:12px;color:var(--text2);display:block;margin-bottom:6px;">Kanal</label>
          <select id="sm_kanal"
            style="width:100%;background:var(--bg3);border:1px solid var(--border2);color:var(--text);
              border-radius:8px;padding:9px 12px;font-size:13px;font-family:inherit;outline:none;cursor:pointer;"
            onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border2)'">
            <option value="">— Kanal wählen —</option>
            ${KA_SOCIAL_CHANNELS.map(k => `<option value="${k}">${k}</option>`).join('')}
          </select>
        </div>
        <div>
          <label style="font-size:12px;color:var(--text2);display:block;margin-bottom:6px;">Absender (Name)</label>
          <input id="sm_absender" type="text" placeholder="z.B. Sarah M."
            style="width:100%;background:var(--bg3);border:1px solid var(--border2);color:var(--text);
              border-radius:8px;padding:9px 12px;font-size:13px;font-family:inherit;outline:none;box-sizing:border-box;"
            onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border2)'" />
        </div>
      </div>
      <div style="margin-bottom:12px;">
        <label style="font-size:12px;color:var(--text2);display:block;margin-bottom:6px;">Nachrichtentext</label>
        <textarea id="sm_text" rows="3" placeholder="Nachricht hier einfügen…"
          style="width:100%;background:var(--bg3);border:1px solid var(--border2);color:var(--text);
            border-radius:8px;padding:10px 12px;font-size:13px;font-family:inherit;
            outline:none;resize:vertical;line-height:1.5;box-sizing:border-box;"
          onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border2)'"></textarea>
      </div>
      <button onclick="kaSocialSaveMessage()"
        style="display:inline-flex;align-items:center;gap:6px;padding:9px 18px;border-radius:8px;
          border:none;background:var(--accent);color:#fff;font-size:13px;font-weight:600;
          cursor:pointer;font-family:inherit;transition:opacity .15s;"
        onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">
        <i class="ti ti-device-floppy"></i> Speichern
      </button>
    </div>`;

  // Status-Map
  const statusMap = {
    neu:              { c:'var(--accent)', bg:'rgba(59,130,246,0.1)',  label:'Neu' },
    kontakt_angelegt: { c:'var(--green)',  bg:'rgba(34,197,94,0.1)',   label:'Kontakt angelegt' },
  };

  // Nachrichten-Karten
  const msgCards = filtered.length === 0
    ? `<div class="empty-state"><i class="ti ti-brand-instagram"></i><p>Noch keine Nachrichten${kaSocialActiveFilter !== 'alle' ? ' für ' + kaSocialActiveFilter : ''}</p></div>`
    : filtered.map(msg => {
        const col  = KA_CHANNEL_COLORS[msg.kanal] || { c:'var(--accent)', bg:'rgba(59,130,246,0.1)' };
        const st   = statusMap[msg.status] || statusMap['neu'];
        const date = msg.eingelesen?.toDate
          ? msg.eingelesen.toDate().toLocaleDateString('de-DE')
          : (msg.eingelesen ? new Date(msg.eingelesen).toLocaleDateString('de-DE') : '');

        const contactBtn = msg.status !== 'kontakt_angelegt'
          ? `<button onclick="kaSocialAddContact('${msg.id}')"
              style="display:inline-flex;align-items:center;gap:5px;padding:6px 11px;border-radius:8px;
                border:1px solid rgba(34,197,94,0.35);background:rgba(34,197,94,0.08);
                color:var(--green);font-size:12px;font-weight:500;cursor:pointer;font-family:inherit;"
              onmouseover="this.style.background='rgba(34,197,94,0.18)'" onmouseout="this.style.background='rgba(34,197,94,0.08)'">
              <i class="ti ti-user-plus"></i> Als Kontakt anlegen
            </button>`
          : `<span style="font-size:12px;color:var(--green);"><i class="ti ti-check"></i> Kontakt angelegt</span>`;

        return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);
          padding:14px 16px;margin-bottom:10px;transition:border-color .15s;"
          onmouseover="this.style.borderColor='var(--border2)'" onmouseout="this.style.borderColor='var(--border)'">
          <div style="display:flex;align-items:flex-start;gap:12px;">
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
                <span style="font-weight:600;font-size:14px;color:var(--text);">${msg.absender || '(Unbekannt)'}</span>
                <span style="font-size:11px;color:${col.c};background:${col.bg};border:1px solid ${col.c}33;padding:2px 8px;border-radius:20px;">${msg.kanal}</span>
                <span style="font-size:11px;color:${st.c};background:${st.bg};border:1px solid ${st.c}33;padding:2px 8px;border-radius:20px;">${st.label}</span>
                ${date ? `<span style="font-size:11px;color:var(--text3);">${date}</span>` : ''}
                ${msg.quelle === 'extension' ? '<span style="font-size:10px;color:var(--text3);background:var(--bg3);border:1px solid var(--border);padding:1px 6px;border-radius:10px;">🤖 Extension</span>' : ''}
              </div>
              <div style="font-size:13px;color:var(--text2);line-height:1.6;margin-bottom:10px;
                background:var(--bg3);border-left:3px solid ${col.c};padding:8px 12px;border-radius:0 8px 8px 0;">
                "${msg.text}"
              </div>
              <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                ${contactBtn}
                <button onclick="kaSocialDeleteMessage('${msg.id}')"
                  style="display:inline-flex;align-items:center;gap:4px;padding:6px 10px;border-radius:8px;
                    border:1px solid rgba(239,68,68,0.2);background:transparent;
                    color:#f87171;font-size:12px;cursor:pointer;font-family:inherit;">
                  <i class="ti ti-trash"></i>
                </button>
              </div>
            </div>
          </div>
        </div>`;
      }).join('');

  return `
    <div style="background:rgba(59,130,246,0.04);border:1px solid rgba(59,130,246,0.15);
      border-radius:8px;padding:8px 14px;margin-bottom:16px;font-size:11px;color:var(--text2);
      display:flex;align-items:center;gap:8px;">
      <i class="ti ti-info-circle" style="color:var(--accent);"></i>
      Manuelle Inbox · ${kaSocialMessages.length} Nachrichten · ${neuCount} neu ·
      <span style="color:var(--text3);">Später erweiterbar durch Browser-Extension (automatisches Einlesen)</span>
    </div>
    ${inputPanel}
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;">${chips}</div>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
      <h3 style="font-size:15px;font-weight:600;color:var(--text);">Nachrichten</h3>
      <span style="background:var(--bg3);border:1px solid var(--border);color:var(--text2);border-radius:20px;padding:2px 10px;font-size:12px;font-weight:600;">${filtered.length}</span>
    </div>
    ${msgCards}
  `;
}

// ── Haupt-Render ───────────────────────────────────────────────
window.renderKleinanzeigen = function () {
  const angeCount = kaFirebaseLeads.filter(l => l.status === 'angeschrieben').length;
  const tabs = [
    { id:'aktive',        label:'<i class="ti ti-users"></i> Aktive Mitarbeiter' },
    { id:'passive',       label:'<i class="ti ti-world"></i> Passive Mitarbeiter' },
    { id:'mandantenTab',  label:'<i class="ti ti-briefcase"></i> Mandanten' },
    { id:'angeschrieben', label:`<i class="ti ti-mail"></i> Angeschrieben${angeCount > 0 ? ` <span style="background:rgba(245,158,11,0.15);color:var(--amber);border-radius:20px;padding:1px 7px;font-size:11px;">${angeCount}</span>` : ''}` },
    { id:'socialMedia',   label:'<i class="ti ti-brand-instagram"></i> Social Media' },
  ];
  const tabContents = {
    aktive:        kaRenderAktive,
    passive:       kaRenderPassive,
    mandantenTab:  kaRenderMandanten,
    angeschrieben: kaRenderAngeschrieben,
    socialMedia:   kaRenderSocialMedia,
  };
  const content = tabContents[kaActiveTab]?.() || '';
  document.getElementById('content').innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid var(--border);">
      ${tabs.map(t => kaTabBtn(t.id, t.label, kaActiveTab === t.id)).join('')}
    </div>
    <div id="ka-tab-content">${content}</div>
  `;
};

// ── Aktionen ───────────────────────────────────────────────────
window.kaMarkAngeschrieben = async function (leadId) {
  try {
    await updateDoc(doc(kaDb, 'kaLeads', leadId), { status: 'angeschrieben' });
    window.toast?.('Status auf "Angeschrieben" gesetzt ✓', 'success');
  } catch (e) {
    window.toast?.('Fehler: ' + e.message, 'error');
  }
};

window.kaDeleteLead = async function (leadId) {
  if (!confirm('Lead wirklich löschen?')) return;
  try {
    await deleteDoc(doc(kaDb, 'kaLeads', leadId));
    window.toast?.('Lead gelöscht.', 'success');
  } catch (e) {
    window.toast?.('Fehler: ' + e.message, 'error');
  }
};

window.kaOpenContactFromLead = function (leadId) {
  const lead = kaFirebaseLeads.find(l => l.id === leadId);
  if (!lead) return;
  if (typeof window.openContactModal !== 'function') {
    window.toast?.('Kontakt-Modal nicht verfügbar.', 'error');
    return;
  }
  window.openContactModal(null);
  requestAnimationFrame(async () => {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    set('f_vorname',  lead.name?.split(' ')[0] || '');
    set('f_nachname', lead.name?.split(' ').slice(1).join(' ') || '');
    set('f_ort',      lead.ort || '');
    set('f_quelle',   'Kleinanzeigen');
    set('f_thema',    lead.kategorie === 'mandanten' ? 'Mandant (' + (lead.subKat || '') + ')' : 'Nebenverdienst');
    set('f_status',   'Neu');
    set('f_notizen',  `KA-Link: ${lead.link}\n\n${lead.text || ''}`);
    const title = document.getElementById('modalTitle');
    if (title) title.textContent = 'Kontakt aus Kleinanzeigen anlegen';
    // Status auf kontakt_angelegt setzen
    try { await updateDoc(doc(kaDb, 'kaLeads', leadId), { status: 'kontakt_angelegt' }); } catch {}
  });
};

// ── Tab-Navigation ─────────────────────────────────────────────
window.kaOpenTab        = id => { kaActiveTab = id; renderKleinanzeigen(); };
window.kaOpenSubTab     = id => { kaActiveSubTab = id; if (id === 'sub-steuerberater') kaActiveNestedTab = 'steuer-privat-pane'; renderKleinanzeigen(); };
window.kaCopy = function(id) {
  const el = document.getElementById(id);
  if (!el) { window.toast?.('Textfeld nicht gefunden.', 'error'); return; }
  navigator.clipboard.writeText(el.value).then(() => window.toast?.('Nachricht kopiert! ✓', 'success'));
};
window.kaOpenNestedTab  = id => { kaActiveNestedTab = id; renderKleinanzeigen(); };
// ── Social Media Inbox Aktionen ────────────────────────────────
window.kaSocialSetFilter = function(kanal) {
  kaSocialActiveFilter = kanal;
  const el = document.getElementById('ka-tab-content');
  if (el) el.innerHTML = kaRenderSocialMedia();
};

window.kaSocialSaveMessage = async function() {
  const kanal    = document.getElementById('sm_kanal')?.value;
  const absender = document.getElementById('sm_absender')?.value?.trim();
  const text     = document.getElementById('sm_text')?.value?.trim();
  if (!kanal)    { window.toast?.('Bitte einen Kanal auswählen.', 'error'); return; }
  if (!absender) { window.toast?.('Bitte den Absendernamen eingeben.', 'error'); return; }
  if (!text)     { window.toast?.('Bitte die Nachricht eingeben.', 'error'); return; }
  try {
    await addDoc(collection(kaDb, 'socialMessages'), {
      kanal, absender, text,
      status: 'neu',
      eingelesen: new Date(),
      quelle: 'manuell',   // 'manuell' | 'extension' – Extension-ready
      profilLink: '',
      avatar: '',
    });
    document.getElementById('sm_absender').value = '';
    document.getElementById('sm_text').value     = '';
    window.toast?.('Nachricht gespeichert ✓', 'success');
  } catch (e) {
    window.toast?.('Fehler: ' + e.message, 'error');
  }
};

window.kaSocialDeleteMessage = async function(id) {
  if (!confirm('Nachricht löschen?')) return;
  try {
    await deleteDoc(doc(kaDb, 'socialMessages', id));
    window.toast?.('Gelöscht.', 'success');
  } catch (e) {
    window.toast?.('Fehler: ' + e.message, 'error');
  }
};

window.kaSocialAddContact = async function(id) {
  const msg = kaSocialMessages.find(m => m.id === id);
  if (!msg) return;
  if (typeof window.openContactModal !== 'function') {
    window.toast?.('Kontakt-Modal nicht verfügbar.', 'error');
    return;
  }
  window.openContactModal(null);
  requestAnimationFrame(async () => {
    const set = (fid, val) => { const el = document.getElementById(fid); if (el) el.value = val || ''; };
    const parts = (msg.absender || '').trim().split(' ');
    set('f_vorname',  parts[0] || '');
    set('f_nachname', parts.slice(1).join(' ') || '');
    set('f_quelle',   msg.kanal || 'Social Media');
    set('f_thema',    'Social Media');
    set('f_status',   'Neu');
    set('f_notizen',  `Kanal: ${msg.kanal}\n\nNachricht:\n"${msg.text}"`);
    const title = document.getElementById('modalTitle');
    if (title) title.textContent = `Kontakt aus ${msg.kanal} anlegen`;
    try { await updateDoc(doc(kaDb, 'socialMessages', id), { status: 'kontakt_angelegt' }); } catch {}
  });
};

// ── Init ───────────────────────────────────────────────────────
// Firebase sofort starten — app.js lädt parallel, Firebase-SDK dedupliziert die App-Instanz
kaInitFirebase();

// pages-Eintrag ist bereits in app.js definiert (window.pages).
// Kein separates Registrieren nötig – verhindert frühere setTimeout-Endlosschleife.
