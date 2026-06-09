// ============================================================
// KLEINANZEIGEN PAGE – v2 (Firebase Live-Daten aus Extension)
// Firebase Version: 11.3.1 (muss mit app.js übereinstimmen)
// ============================================================

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/11.3.1/firebase-app.js';
import {
  getFirestore, collection, updateDoc, deleteDoc,
  doc, query, orderBy, onSnapshot
} from 'https://www.gstatic.com/firebasejs/11.3.1/firebase-firestore.js';

// ── Firebase Init (gibt bestehende Instanz zurück falls schon initialisiert) ──
const KA_FIREBASE_CONFIG = {
  apiKey:            "AIzaSyBxiDftvsNOfElvrt8hhLaUA0HDoSyuK-g",
  authDomain:        "tracking-74513.firebaseapp.com",
  projectId:         "tracking-74513",
  storageBucket:     "tracking-74513.firebasestorage.app",
  messagingSenderId: "621239887005",
  appId:             "1:621239887005:web:5b962abff5c9109a546074"
};

const kaApp = getApps().length > 0 ? getApps()[0] : initializeApp(KA_FIREBASE_CONFIG);
const kaDb  = getFirestore(kaApp);

// ── Social Media Daten ────────────────────────────────────────
const KA_SOCIAL_CHANNELS = ["Instagram","TikTok","LinkedIn","Bumble for Friends","Xing","Facebook"];
const KA_SOCIAL_MESSAGES = [
  { platform:"Instagram", sender:"Sarah M.", text:"Hey, wie läuft das mit der Zusammenarbeit genau?" },
  { platform:"Instagram", sender:"Kevin P.", text:"Klingt interessant, erzähl mir mehr." },
  { platform:"LinkedIn",  sender:"Dr. Weber", text:"Vielen Dank für die Vernetzung." },
  { platform:"TikTok",    sender:"User123", text:"Coole Videos, wo finde ich Infos?" }
];

// ── State ─────────────────────────────────────────────────────
let kaActiveTab           = 'aktive';
let kaActiveSubTab        = 'sub-steuerberater';
let kaActiveNestedTab     = 'steuer-privat-pane';
let kaActiveSocialChannels = new Set(KA_SOCIAL_CHANNELS);
let kaFirebaseLeads       = [];
let kaFirebaseAvailable   = false;
let kaUnsubscribe         = null;

// ── Firebase Live-Listener ────────────────────────────────────
function kaInitFirebase() {
  try {
    const q = query(collection(kaDb, 'kaLeads'), orderBy('eingelesen', 'desc'));
    kaUnsubscribe = onSnapshot(q, snap => {
      kaFirebaseLeads = [];
      snap.forEach(d => kaFirebaseLeads.push({ id: d.id, ...d.data() }));
      kaFirebaseAvailable = true;
      // Nur neu rendern wenn Kleinanzeigen-Tab gerade aktiv ist
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

function kaTextarea(id, value) {
  return `<textarea id="${id}" rows="3"
    style="width:100%;background:var(--bg3);border:1px solid var(--border2);color:var(--text);
      border-radius:8px;padding:10px 12px;font-size:13px;font-family:inherit;
      outline:none;resize:vertical;line-height:1.5;"
    onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border2)'"
  >${value}</textarea>`;
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
  const channelToggles = KA_SOCIAL_CHANNELS.map(ch => `
    <label style="display:flex;align-items:center;gap:10px;font-size:14px;cursor:pointer;color:var(--text);padding:6px 0;">
      <input type="checkbox" ${kaActiveSocialChannels.has(ch) ? 'checked' : ''}
        onchange="kaToggleSocialChannel('${ch}', this.checked)"
        style="width:16px;height:16px;accent-color:var(--accent);cursor:pointer;" />
      ${ch}
    </label>`).join('');

  const activeChannels = [...kaActiveSocialChannels];
  const messageBlocks = activeChannels.map(ch => {
    const msgs = KA_SOCIAL_MESSAGES.filter(m => m.platform === ch);
    return `
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:18px;margin-bottom:14px;">
        <div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:14px;">${ch} Nachrichten</div>
        ${msgs.length === 0
          ? `<p style="font-size:13px;color:var(--text3);">Keine neuen Nachrichten.</p>`
          : msgs.map(msg => {
              const cd = JSON.stringify({ vorname: msg.sender.split(' ')[0], nachname: msg.sender.split(' ').slice(1).join(' '), quelle: ch, thema: 'Social Media', status: 'Neu' }).replace(/'/g,"&#39;");
              return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);
                padding:14px 16px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
                <div style="flex:1;">
                  <div style="font-weight:600;font-size:14px;color:var(--text);margin-bottom:6px;">${msg.sender}
                    <span style="font-size:11px;color:var(--accent);background:rgba(59,130,246,0.1);padding:2px 8px;border-radius:20px;margin-left:8px;">${ch}</span>
                  </div>
                  <div style="font-size:13px;color:var(--text2);">"${msg.text}"</div>
                  <button onclick='kaAddAsContact(${cd})'
                    style="margin-top:8px;display:inline-flex;align-items:center;gap:5px;padding:7px 12px;border-radius:8px;
                      border:1px solid rgba(34,197,94,0.35);background:rgba(34,197,94,0.08);
                      color:var(--green);font-size:12px;font-weight:500;cursor:pointer;font-family:inherit;">
                    <i class="ti ti-user-plus"></i> Als Kontakt anlegen
                  </button>
                </div>
                <button onclick="kaCopy('ka_socialMediaMessage')"
                  style="flex-shrink:0;padding:8px 14px;border-radius:8px;border:1px solid var(--border2);
                    background:var(--bg3);color:var(--text2);font-size:12px;font-weight:500;cursor:pointer;font-family:inherit;">
                  <i class="ti ti-copy"></i> Kopieren
                </button>
              </div>`;
            }).join('')}
      </div>`;
  }).join('');

  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
      ${kaPanel('Kanäle aktivieren', channelToggles)}
      ${kaPanel('Anschreiben Social Media', kaTextarea('ka_socialMediaMessage', 'Hallo! Ich bin auf Ihr Profil aufmerksam geworden und würde mich freuen, mich mit Ihnen zu vernetzen. Vielleicht gibt es ja auch spannende Anknüpfpunkte für eine Zusammenarbeit?'))}
    </div>
    ${messageBlocks || '<div class="empty-state"><i class="ti ti-brand-instagram"></i><p>Keine Kanäle aktiv</p></div>'}
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
window.kaOpenNestedTab  = id => { kaActiveNestedTab = id; renderKleinanzeigen(); };
window.kaToggleSocialChannel = (ch, checked) => {
  if (checked) kaActiveSocialChannels.add(ch); else kaActiveSocialChannels.delete(ch);
  const el = document.getElementById('ka-tab-content');
  if (el && kaActiveTab === 'socialMedia') el.innerHTML = kaRenderSocialMedia();
};

window.kaCopy = function (id) {
  const el = document.getElementById(id);
  if (!el) { window.toast?.('Textfeld nicht gefunden.', 'error'); return; }
  navigator.clipboard.writeText(el.value).then(() => window.toast?.('Nachricht kopiert! ✓', 'success'));
};

window.kaAddAsContact = function (data) {
  if (typeof window.openContactModal !== 'function') { window.toast?.('Kontakt-Modal nicht verfügbar.', 'error'); return; }
  window.openContactModal(null);
  requestAnimationFrame(() => {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    set('f_vorname',  data.vorname  || '');
    set('f_nachname', data.nachname || '');
    set('f_quelle',   data.quelle   || '');
    set('f_thema',    data.thema    || '');
    set('f_status',   data.status   || 'Neu');
    set('f_notizen',  data.notizen  || '');
    const title = document.getElementById('modalTitle');
    if (title) title.textContent = 'Kontakt aus Social Media anlegen';
  });
};

// ── Init ───────────────────────────────────────────────────────
// Firebase sofort starten — app.js lädt parallel, Firebase-SDK dedupliziert die App-Instanz
kaInitFirebase();

// In pages-Registry eintragen (app.js setzt pages-Objekt, ggf. leicht verzögert)
function kaRegister() {
  if (typeof pages !== 'undefined') {
    pages.kleinanzeigen = { title: 'Kleinanzeigen', render: window.renderKleinanzeigen };
  } else {
    // app.js noch nicht fertig → kurz warten
    setTimeout(kaRegister, 50);
  }
}
kaRegister();
