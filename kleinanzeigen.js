// ============================================================
// KLEINANZEIGEN PAGE
// Wird als Page im Lead Tracker angezeigt (data-page="kleinanzeigen")
// ============================================================

// ── Blacklist & Rohdaten ──────────────────────────────────────
const KA_BLACKLIST = [
  "strukturvertrieb","finanzvertrieb","finanzvertriebe","finanzsachen",
  "versicherung","versicherungssachen","provision","provisionssachen",
  "provisionsbasis","steuerberater","anwalt","rechtsanwalt",
  "rechtsanwaltsgehilfe","steuern"
];

const KA_RAW_DATA = [
  { type:"job", id:1, name:"Jonah M.", age:24, location:"Ulm", text:"Suche flexiblen Minijob neben dem Studium.", distance:5 },
  { type:"job", id:2, name:"Christian B.", age:29, location:"Hamburg", text:"Suche ortsunabhängigen Nebenverdienst.", distance:600 },
  { type:"steuer", name:"Gewerbe-Team S.", location:"Ulm", distance:0, isFirm:true, text:"Suchen Steuerberater für unsere neu gegründete GmbH (Handwerk) zur Bilanzerstellung." },
  { type:"steuer", name:"Anna L.", location:"Neu-Ulm", distance:4, isFirm:false, text:"Suche Hilfe bei meiner privaten Steuererklärung für das Jahr 2025." },
  { type:"versicherung", name:"Familie Wolf", location:"Senden", distance:12, text:"Wer kann unsere Versicherungen (Haftpflicht, BU, Auto) prüfen und optimieren?" },
  { type:"kredit", name:"Markus J.", location:"Blaustein", distance:7, text:"Suche Immobilienfinanzierung für ein EFH. Brauche Vergleich der Banken." },
  { type:"kredit", name:"Ali K.", location:"Stuttgart", distance:90, text:"Suche privaten Kredit über 5000€. Bitte keine Banken oder Vermittler anfragen." },
  { type:"finanzberater", name:"Timo S.", location:"Geislingen", distance:32, text:"Suche unabhängigen Finanzberater, der mir hilft, meine privaten Finanzen zu strukturieren." },
  { type:"finanzberater", name:"Finanzkanzlei XY", location:"München", distance:130, text:"Wir suchen einen Finanzberater (m/w/d) zur Festeinstellung für unser Büro." },
  { type:"sonstiges", name:"Sarah K.", location:"Ehingen", distance:25, text:"Suche allgemeine Beratung zu Vermögensaufbau und staatlichen Förderungen (VWL / Riester-Check)." },
  { type:"sonstiges", name:"Dieter M.", location:"Ulm", distance:2, text:"Möchte Geld für meine Enkel anlegen und einen Bausparer einrichten." }
];

const KA_SOCIAL_CHANNELS = ["Instagram","TikTok","LinkedIn","Bumble for Friends","Xing","Facebook"];

const KA_SOCIAL_MESSAGES = [
  { platform:"Instagram", sender:"Sarah M.", text:"Hey, wie läuft das mit der Zusammenarbeit genau?" },
  { platform:"Instagram", sender:"Kevin P.", text:"Klingt interessant, erzähl mir mehr." },
  { platform:"LinkedIn", sender:"Dr. Weber", text:"Vielen Dank für die Vernetzung." },
  { platform:"TikTok", sender:"User123", text:"Coole Videos, wo finde ich Infos?" }
];

// ── Aktiver Tab State ─────────────────────────────────────────
let kaActiveTab = 'aktive';
let kaActiveSubTab = 'sub-steuerberater';
let kaActiveNestedTab = 'steuer-privat-pane';
let kaActiveSocialChannels = new Set(KA_SOCIAL_CHANNELS);

// ── Hilfsfunktionen ───────────────────────────────────────────
function kaCounter(n, color = 'var(--text2)') {
  return `<span style="background:var(--bg3);border:1px solid var(--border);color:${color};border-radius:20px;padding:2px 10px;font-size:12px;font-weight:600;">${n}</span>`;
}

function kaTabBtn(id, label, active) {
  return `<button
    onclick="kaOpenTab('${id}')"
    style="display:inline-flex;align-items:center;gap:6px;padding:9px 16px;border-radius:8px;
      font-size:14px;font-weight:500;cursor:pointer;border:1px solid ${active ? 'rgba(59,130,246,0.5)' : 'var(--border2)'};
      background:${active ? 'rgba(59,130,246,0.12)' : 'var(--bg3)'};
      color:${active ? 'var(--accent)' : 'var(--text2)'};
      font-family:inherit;transition:all .15s;"
    onmouseover="if(!${active})this.style.background='var(--surface2)';if(!${active})this.style.color='var(--text)'"
    onmouseout="if(!${active})this.style.background='var(--bg3)';if(!${active})this.style.color='var(--text2)'"
  >${label}</button>`;
}

function kaSubTabBtn(id, label, active) {
  return `<button
    onclick="kaOpenSubTab('${id}')"
    style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:8px;
      font-size:13px;font-weight:500;cursor:pointer;
      border:1px solid ${active ? 'rgba(167,139,250,0.4)' : 'var(--border)'};
      background:${active ? 'rgba(167,139,250,0.1)' : 'transparent'};
      color:${active ? 'var(--purple)' : 'var(--text3)'};
      font-family:inherit;transition:all .15s;"
  >${label}</button>`;
}

function kaNestedTabBtn(id, label, active) {
  return `<button
    onclick="kaOpenNestedTab('${id}')"
    style="display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:6px;
      font-size:12px;font-weight:500;cursor:pointer;
      border:1px solid ${active ? 'rgba(59,130,246,0.35)' : 'var(--border)'};
      background:${active ? 'rgba(59,130,246,0.1)' : 'var(--bg3)'};
      color:${active ? 'var(--accent)' : 'var(--text3)'};
      font-family:inherit;transition:all .15s;"
  >${label}</button>`;
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

function kaCard(name, meta, text, msgId, showAddContact = false, contactData = {}) {
  const addContactBtn = showAddContact ? `
    <button onclick='kaAddAsContact(${JSON.stringify(contactData).replace(/'/g,"&#39;")})'
      style="display:inline-flex;align-items:center;gap:5px;padding:7px 12px;border-radius:8px;
        border:1px solid rgba(34,197,94,0.35);background:rgba(34,197,94,0.08);
        color:var(--green);font-size:12px;font-weight:500;cursor:pointer;font-family:inherit;
        transition:all .15s;margin-top:8px;"
      onmouseover="this.style.background='rgba(34,197,94,0.18)'" onmouseout="this.style.background='rgba(34,197,94,0.08)'">
      <i class="ti ti-user-plus"></i> Als Kontakt anlegen
    </button>` : '';

  return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);
    padding:14px 16px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;
    transition:border-color .15s;"
    onmouseover="this.style.borderColor='var(--border2)'" onmouseout="this.style.borderColor='var(--border)'">
    <div style="flex:1;min-width:0;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;flex-wrap:wrap;">
        <span style="font-weight:600;font-size:14px;color:var(--text);">${name}</span>
        <span style="font-size:11px;color:var(--accent);background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.2);padding:2px 8px;border-radius:20px;">${meta}</span>
      </div>
      <div style="font-size:13px;color:var(--text2);line-height:1.5;">"${text}"</div>
      ${addContactBtn}
    </div>
    <button onclick="kaCopy('${msgId}')"
      style="flex-shrink:0;display:inline-flex;align-items:center;gap:6px;padding:8px 14px;
        border-radius:8px;border:1px solid var(--border2);background:var(--bg3);
        color:var(--text2);font-size:12px;font-weight:500;cursor:pointer;font-family:inherit;
        transition:all .15s;white-space:nowrap;"
      onmouseover="this.style.background='var(--surface2)';this.style.color='var(--text)'"
      onmouseout="this.style.background='var(--bg3)';this.style.color='var(--text2)'">
      <i class="ti ti-copy"></i> Kopieren
    </button>
  </div>`;
}

function kaSectionTitle(label, count, color) {
  return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
    <h3 style="font-size:15px;font-weight:600;color:var(--text);">${label}</h3>
    ${kaCounter(count, color)}
  </div>`;
}

// ── Anzeigen-Logik ────────────────────────────────────────────
function kaBuildActiveData() {
  const list = []; const activeIds = [];
  KA_RAW_DATA.forEach(item => {
    if (item.type !== 'job') return;
    let valid = item.age >= 18 && item.age < 50 && item.text.split(/\s+/).length >= 4;
    KA_BLACKLIST.forEach(w => { if (item.text.toLowerCase().includes(w)) valid = false; });
    if (valid && item.distance <= 100) { list.push(item); activeIds.push(item.id); }
  });
  return { list, activeIds };
}

function kaBuildPassiveData(activeIds) {
  const list = [];
  KA_RAW_DATA.forEach(item => {
    if (item.type !== 'job') return;
    let valid = item.age >= 18 && item.age < 50 && item.text.split(/\s+/).length >= 4;
    KA_BLACKLIST.forEach(w => { if (item.text.toLowerCase().includes(w)) valid = false; });
    if (valid && !activeIds.includes(item.id)) list.push(item);
  });
  return list;
}

function kaBuildMandantenData() {
  const result = { steuerPrivat:[], steuerFirma:[], versicherung:[], kredit:[], finanzberater:[], sonstiges:[] };
  KA_RAW_DATA.forEach(item => {
    const t = item.text.toLowerCase();
    if (item.type === 'steuer') {
      if (item.isFirm) result.steuerFirma.push(item); else result.steuerPrivat.push(item);
    } else if (item.type === 'versicherung') {
      result.versicherung.push(item);
    } else if (item.type === 'kredit') {
      if (!t.includes('keine bank') && !t.includes('nur privat')) result.kredit.push(item);
    } else if (item.type === 'finanzberater') {
      if (!t.includes('festeinstellung') && !t.includes('m/w/d') && !t.includes('wir suchen')) result.finanzberater.push(item);
    } else if (item.type === 'sonstiges') {
      result.sonstiges.push(item);
    }
  });
  return result;
}

// ── Tab-Inhalte rendern ───────────────────────────────────────
function kaRenderAktive() {
  const { list } = kaBuildActiveData();
  return `
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
            <span style="color:var(--text2);">Ausschlüsse</span><span style="color:var(--text3);font-size:12px;">Steuern, Anwalt, Strukturvertrieb etc.</span>
          </div>
        </div>`)}
      ${kaPanel('Standard-Anschreiben', kaTextarea('ka_activeMessage', 'Hallo! Ich habe Ihre Anzeige bezüglich eines Nebenverdienstes gesehen. Da wir aktuell Unterstützung im Raum Ulm suchen, würde ich mich über ein kurzes Telefonat freuen. Wann passt es Ihnen am besten?'))}
    </div>
    ${kaSectionTitle('Gefilterte Profile im Umkreis:', list.length, 'var(--accent)')}
    ${list.map(i => kaCard(i.name, `${i.age} J. | ${i.location} (${i.distance} km)`, i.text, 'ka_activeMessage')).join('') || '<div class="empty-state"><i class="ti ti-users"></i><p>Keine Treffer</p></div>'}
  `;
}

function kaRenderPassive() {
  const { activeIds } = kaBuildActiveData();
  const list = kaBuildPassiveData(activeIds);
  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
      ${kaPanel('Passive Suchkriterien (Überregional)', `
        <div style="display:flex;flex-direction:column;gap:8px;">
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px;">
            <span style="color:var(--text2);">Umkreis</span><span style="color:var(--text);">Deutschlandweit</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;">
            <span style="color:var(--text2);">Dubletten-Schutz</span><span style="color:var(--green);font-size:12px;">✓ Aktiv-Treffer ausgeschlossen</span>
          </div>
        </div>`)}
      ${kaPanel('Anschreiben (Passiv)', kaTextarea('ka_passiveMessage', 'Hallo! Wir suchen aktuell bundesweit Unterstützung für eine flexible Tätigkeit im Homeoffice/Nebenverdienst. Hätten Sie Zeit für ein kurzes Telefonat?'))}
    </div>
    ${kaSectionTitle('Gefilterte Profile (Restliches DE):', list.length, 'var(--accent)')}
    ${list.map(i => kaCard(i.name, `${i.age} J. | ${i.location} (Überregional)`, i.text, 'ka_passiveMessage')).join('') || '<div class="empty-state"><i class="ti ti-users"></i><p>Keine Treffer</p></div>'}
  `;
}

function kaRenderMandanten() {
  const data = kaBuildMandantenData();
  const subTabs = [
    { id:'sub-steuerberater', label:'<i class="ti ti-file-invoice"></i> Steuerberater' },
    { id:'sub-versicherung',  label:'<i class="ti ti-shield"></i> Versicherung' },
    { id:'sub-kredit',        label:'<i class="ti ti-building-bank"></i> Kredit' },
    { id:'sub-finanzberater', label:'<i class="ti ti-chart-line"></i> Finanzberater' },
    { id:'sub-sonstiges',     label:'<i class="ti ti-dots"></i> Sonstiges' },
  ];

  const subContents = {
    'sub-steuerberater': () => {
      const nestedTabs = [
        { id:'steuer-privat-pane', label:'Privatpersonen' },
        { id:'steuer-firma-pane',  label:'Unternehmen / Gewerbe' },
      ];
      const nestedContents = {
        'steuer-privat-pane': `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
            ${kaPanel('Filter-Modus: Steuerberater (Privat)', '<p style="font-size:13px;color:var(--text2);">Zeigt Anfragen von Privatpersonen.</p>')}
            ${kaPanel('Anschreiben', kaTextarea('ka_steuerPrivatMessage', 'Hallo! Ich habe Ihre Anfrage bezüglich Unterstützung bei der Steuererklärung gesehen. Gerne helfe ich Ihnen im privaten Bereich weiter. Wann passt ein kurzes Telefonat?'))}
          </div>
          ${kaSectionTitle('Privatpersonen Anfragen:', data.steuerPrivat.length, 'var(--purple)')}
          ${data.steuerPrivat.map(i => kaCard(i.name, `${i.location}${i.distance>0?' ('+i.distance+' km)':''}`, i.text, 'ka_steuerPrivatMessage')).join('') || '<div class="empty-state"><i class="ti ti-file-invoice"></i><p>Keine Treffer</p></div>'}`,
        'steuer-firma-pane': `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
            ${kaPanel('Filter-Modus: Steuerberater (Gewerblich)', '<p style="font-size:13px;color:var(--text2);">Filtert Firmen/Gewerbe.</p>')}
            ${kaPanel('Anschreiben', kaTextarea('ka_steuerFirmaMessage', 'Guten Tag! Bezüglich Ihrer Suche nach strategischer Steuer- und Buchhaltungsberatung unterstütze ich Sie gerne.'))}
          </div>
          ${kaSectionTitle('Unternehmen Anfragen:', data.steuerFirma.length, 'var(--purple)')}
          ${data.steuerFirma.map(i => kaCard(i.name, `${i.location}${i.distance>0?' ('+i.distance+' km)':''}`, i.text, 'ka_steuerFirmaMessage')).join('') || '<div class="empty-state"><i class="ti ti-building"></i><p>Keine Treffer</p></div>'}`
      };
      return `
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;">
          ${nestedTabs.map(t => kaNestedTabBtn(t.id, t.label, kaActiveNestedTab === t.id)).join('')}
        </div>
        <div>${nestedContents[kaActiveNestedTab] || nestedContents['steuer-privat-pane']}</div>`;
    },
    'sub-versicherung': () => `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
        ${kaPanel('Filter-Modus: Versicherung', '')}
        ${kaPanel('Anschreiben', kaTextarea('ka_versicherungMessage', 'Hallo! Gerne prüfe ich Ihre Absicherungen auf Einsparpotenziale. Wann können wir hierzu kurz sprechen?'))}
      </div>
      ${kaSectionTitle('Anfragen Versicherungen:', data.versicherung.length, 'var(--amber)')}
      ${data.versicherung.map(i => kaCard(i.name, `${i.location}${i.distance>0?' ('+i.distance+' km)':''}`, i.text, 'ka_versicherungMessage')).join('') || '<div class="empty-state"><i class="ti ti-shield"></i><p>Keine Treffer</p></div>'}`,
    'sub-kredit': () => `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
        ${kaPanel('Filter-Modus: Kredit & Finanzierung', '')}
        ${kaPanel('Anschreiben', kaTextarea('ka_kreditMessage', 'Hallo! Ich habe Ihre Finanzierungsanfrage gesehen. Ich erstelle Ihnen gerne einen unabhängigen Vergleich.'))}
      </div>
      ${kaSectionTitle('Anfragen Finanzierungen:', data.kredit.length, 'var(--green)')}
      ${data.kredit.map(i => kaCard(i.name, `${i.location}${i.distance>0?' ('+i.distance+' km)':''}`, i.text, 'ka_kreditMessage')).join('') || '<div class="empty-state"><i class="ti ti-building-bank"></i><p>Keine Treffer</p></div>'}`,
    'sub-finanzberater': () => `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
        ${kaPanel('Filter-Modus: Finanzberatung', '')}
        ${kaPanel('Anschreiben', kaTextarea('ka_finanzberaterMessage', 'Hallo! Gerne unterstütze ich Sie bei Ihrem Vermögensaufbau. Wann hätten Sie Zeit für ein Erstgespräch?'))}
      </div>
      ${kaSectionTitle('Kundenanfragen Finanzberatung:', data.finanzberater.length, 'var(--accent)')}
      ${data.finanzberater.map(i => kaCard(i.name, `${i.location}${i.distance>0?' ('+i.distance+' km)':''}`, i.text, 'ka_finanzberaterMessage')).join('') || '<div class="empty-state"><i class="ti ti-chart-line"></i><p>Keine Treffer</p></div>'}`,
    'sub-sonstiges': () => `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
        ${kaPanel('Allfinanz / Sonstiges', '')}
        ${kaPanel('Anschreiben', kaTextarea('ka_sonstigesMessage', 'Hallo! Ich helfe Ihnen gerne beim Thema Vermögensaufbau und staatliche Förderungen.'))}
      </div>
      ${kaSectionTitle('Allfinanz Anfragen:', data.sonstiges.length, 'var(--text2)')}
      ${data.sonstiges.map(i => kaCard(i.name, `${i.location}${i.distance>0?' ('+i.distance+' km)':''}`, i.text, 'ka_sonstigesMessage')).join('') || '<div class="empty-state"><i class="ti ti-dots"></i><p>Keine Treffer</p></div>'}`
  };

  const renderFn = subContents[kaActiveSubTab] || subContents['sub-steuerberater'];
  const subContent = typeof renderFn === 'function' ? renderFn() : renderFn;

  return `
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:20px;padding-bottom:14px;border-bottom:1px solid var(--border);">
      ${subTabs.map(t => kaSubTabBtn(t.id, t.label, kaActiveSubTab === t.id)).join('')}
    </div>
    ${subContent}
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
        ${msgs.length === 0 ? `<p style="font-size:13px;color:var(--text3);">Keine neuen Nachrichten.</p>` :
          msgs.map(msg => kaCard(
            msg.sender,
            ch,
            msg.text,
            'ka_socialMediaMessage',
            true,
            { vorname: msg.sender.split(' ')[0] || msg.sender, nachname: msg.sender.split(' ').slice(1).join(' ') || '', quelle: ch, thema: 'Social Media', status: 'Neu' }
          )).join('')}
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

// ── Haupt-Render-Funktion ─────────────────────────────────────
window.renderKleinanzeigen = function() {
  const tabs = [
    { id:'aktive',       label:'<i class="ti ti-users"></i> Aktive Mitarbeiter' },
    { id:'passive',      label:'<i class="ti ti-world"></i> Passive Mitarbeiter' },
    { id:'mandantenTab', label:'<i class="ti ti-briefcase"></i> Mandanten' },
    { id:'socialMedia',  label:'<i class="ti ti-brand-instagram"></i> Social Media' },
  ];

  const tabContents = {
    aktive:       kaRenderAktive,
    passive:      kaRenderPassive,
    mandantenTab: kaRenderMandanten,
    socialMedia:  kaRenderSocialMedia,
  };

  const content = tabContents[kaActiveTab]?.() || '';

  document.getElementById('content').innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid var(--border);">
      ${tabs.map(t => kaTabBtn(t.id, t.label, kaActiveTab === t.id)).join('')}
    </div>
    <div id="ka-tab-content">${content}</div>
  `;
};

// ── Tab-Navigation (globale window-Funktionen für onclick-Attribute) ──
window.kaOpenTab = function(id) {
  kaActiveTab = id;
  renderKleinanzeigen();
};

window.kaOpenSubTab = function(id) {
  kaActiveSubTab = id;
  // Nested Tab zurücksetzen bei Sub-Tab-Wechsel
  if (id === 'sub-steuerberater') kaActiveNestedTab = 'steuer-privat-pane';
  renderKleinanzeigen();
};

window.kaOpenNestedTab = function(id) {
  kaActiveNestedTab = id;
  renderKleinanzeigen();
};

window.kaToggleSocialChannel = function(ch, checked) {
  if (checked) kaActiveSocialChannels.add(ch); else kaActiveSocialChannels.delete(ch);
  // Nur Social-Tab neu rendern ohne vollen Re-render
  const container = document.getElementById('ka-tab-content');
  if (container && kaActiveTab === 'socialMedia') {
    container.innerHTML = kaRenderSocialMedia();
  }
};

// ── Kopieren ──────────────────────────────────────────────────
window.kaCopy = function(id) {
  const el = document.getElementById(id);
  if (!el) { window.toast?.('Textfeld nicht gefunden.', 'error'); return; }
  navigator.clipboard.writeText(el.value).then(() => window.toast?.('Nachricht kopiert! ✓', 'success'));
};

// ── Als Kontakt anlegen (Social Media) ───────────────────────
window.kaAddAsContact = function(data) {
  if (typeof window.openContactModal !== 'function') {
    window.toast?.('Kontakt-Modal nicht verfügbar.', 'error');
    return;
  }

  // Modal öffnen (neuer Kontakt, keine ID)
  window.openContactModal(null);

  // Felder nach dem Öffnen vorausfüllen
  requestAnimationFrame(() => {
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val || '';
    };
    set('f_vorname',  data.vorname  || '');
    set('f_nachname', data.nachname || '');
    set('f_quelle',   data.quelle   || '');
    set('f_thema',    data.thema    || '');
    set('f_status',   data.status   || 'Neu');
    set('f_notizen',  data.notizen  || '');
    // Modal-Titel anpassen
    const title = document.getElementById('modalTitle');
    if (title) title.textContent = 'Kontakt aus Social Media anlegen';
  });
};

// ── In Navigation registrieren ────────────────────────────────
// Wird in app.js durch den pages-Object-Lookup verwendet
if (typeof window !== 'undefined') {
  // Warte auf DOMContentLoaded, dann in pages registrieren
  document.addEventListener('DOMContentLoaded', () => {
    // Fallback: pages direkt erweitern wenn vorhanden
    if (typeof pages !== 'undefined') {
      pages.kleinanzeigen = { title: 'Kleinanzeigen', render: window.renderKleinanzeigen };
    }
  });
}
