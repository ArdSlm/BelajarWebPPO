// ════════════════════════════════
//  MQTT CONFIG
// ════════════════════════════════
const MQTT_BROKER = 'wss://68c31b50ae9e4ae79325b503da99b709.s1.eu.hivemq.cloud:8884/mqtt';
const TOPIC_STATUS = 'kelompok4/stamping/status';
const TOPIC_CMD    = 'kelompok4/stamping/cmd';
const MQTT_USERNAME = 'ardisalim';
const MQTT_PASSWORD = 'Tarlina06)';

// ════════════════════════════════
//  STATE
// ════════════════════════════════
let mqttClient    = null;
let mqttConnected = false;
let latestStatus  = {
  run: false, motor: '-', state: '-',
  ir1: 0, ir2: 0, counter_barang: 0,
  counter_stamping: 0, pwm: 0, wifi: 0,
};

// ── PROCESS LOG ──
const LS_PROCESS_KEY = 'stamping_process_logs';
let processLogs = [];
try {
  processLogs = JSON.parse(localStorage.getItem(LS_PROCESS_KEY) || '[]');
} catch (e) { processLogs = []; }

let previousData = null;

// ════════════════════════════════
//  HELPERS
// ════════════════════════════════
function toNumber(v, f = 0) { const n = Number(v); return Number.isFinite(n) ? n : f; }
function el(id)              { return document.getElementById(id); }
function setText(id, txt)    { const e = el(id); if (e) e.textContent = txt; }

// ════════════════════════════════
//  CLOCK
// ════════════════════════════════
function updateClock() { setText('clock', new Date().toLocaleTimeString('id-ID')); }
setInterval(updateClock, 1000);
updateClock();

// ════════════════════════════════
//  CHART (optional)
// ════════════════════════════════
const chartHistory = Array(24).fill(0);
let thrChart = null;
const thrCanvas = document.getElementById('thrChart');
if (thrCanvas && window.Chart) {
  Chart.defaults.font.family = 'Segoe UI';
  Chart.defaults.color = '#a8b4c0';
  thrChart = new Chart(thrCanvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: Array(24).fill(''),
      datasets: [{ label: 'Barang', data: [...chartHistory],
        borderColor: '#5cc7ff', backgroundColor: 'rgba(92,199,255,.12)',
        fill: true, tension: 0.35, pointRadius: 0, borderWidth: 2 }]
    },
    options: {
      responsive: true, animation: false,
      plugins: { legend: { display: false } },
      scales: { x: { display: false }, y: { beginAtZero: true, grid: { color: 'rgba(92,199,255,.1)' } } }
    }
  });
}

function updateChart(val) {
  if (!thrChart) return;
  chartHistory.push(val); chartHistory.shift();
  thrChart.data.datasets[0].data = [...chartHistory];
  thrChart.update('none');
}

// ════════════════════════════════
//  EVENT LOG
// ════════════════════════════════
function logMessage(msg, type = 'ok') {
  console.log(msg);
  const body = el('logBody');
  if (!body) return;
  const item = document.createElement('div');
  item.className = `log-item log-${type}`;
  item.innerHTML = `<span class="log-time">${new Date().toLocaleTimeString('id-ID')}</span><span class="log-dot-${type}"></span><span>${msg}</span>`;
  body.prepend(item);
  if (body.children.length > 40) body.lastChild.remove();
}

// ════════════════════════════════
//  CONNECTION STATE
// ════════════════════════════════
function setConnectionState(connected, label) {
  mqttConnected = connected;
  setText('statusText', label);
  setText('miniConn', connected ? 'Connected' : 'Disconnected');

  const pill = el('systemStatus');
  if (pill) pill.className = 'mqtt-status ' + (connected ? 'connected' : 'disconnected');

  const dot = el('statusDot');
  if (dot) {
    dot.style.background   = connected ? '#22c55e' : '#f97316';
    dot.style.animation    = connected ? 'pulse 1.2s infinite' : 'none';
  }
}

// ════════════════════════════════
//  DASHBOARD UPDATE
// ════════════════════════════════
function updateDashboardFromStatus(data) {
  const prev = previousData;

  latestStatus = {
    run: Boolean(data.run),
    motor: data.motor ?? '-',
    state: data.state ?? '-',
    ir1: toNumber(data.ir1),
    ir2: toNumber(data.ir2),
    counter_barang: toNumber(data.counter_barang),
    counter_stamping: toNumber(data.counter_stamping),
    pwm: toNumber(data.pwm),
    wifi: toNumber(data.wifi),
  };

  const runText  = latestStatus.run ? 'ON' : 'OFF';
  const wifiText = `${latestStatus.wifi} dBm`;

  setText('sc-run',        runText);
  setText('sc-motor',      latestStatus.motor);
  setText('sc-state',      latestStatus.state);
  setText('sc-ir1',        String(latestStatus.ir1));
  setText('sc-ir2',        String(latestStatus.ir2));
  setText('sc-total',      String(latestStatus.counter_barang));
  setText('sc-stamping',   String(latestStatus.counter_stamping));
  setText('sc-pwm',        String(latestStatus.pwm));
  setText('sc-pwm-actual', String(latestStatus.pwm));
  setText('sc-wifi',       wifiText);
  setText('cnt-inlet',     String(latestStatus.counter_barang));
  setText('cnt-ir1',       String(latestStatus.ir1));
  setText('cnt-stamp',     String(latestStatus.counter_stamping));
  setText('cnt-ir2',       String(latestStatus.ir2));
  setText('cnt-outlet',    String(latestStatus.counter_barang));
  setText('miniStatus',    latestStatus.state);
  setText('runInfo',       runText);
  setText('motorInfo',     latestStatus.motor);
  setText('stateInfo',     latestStatus.state);
  setText('ir1Info',       String(latestStatus.ir1));
  setText('ir2Info',       String(latestStatus.ir2));
  setText('wifiInfo',      wifiText);

  // Run card highlight
  const runCard = el('card-run');
  if (runCard) {
    runCard.classList.toggle('card-on',  latestStatus.run);
    runCard.classList.toggle('card-off', !latestStatus.run);
  }

  // Conveyor flow step highlights
  const stepMap = {
    'step-inlet':  latestStatus.run,
    'step-ir1':    latestStatus.ir1 === 1,
    'step-stamp':  latestStatus.counter_stamping > 0,
    'step-ir2':    latestStatus.ir2 === 1,
    'step-outlet': latestStatus.run,
  };
  Object.entries(stepMap).forEach(([id, active]) => {
    const e = el(id);
    if (e) e.classList.toggle('step-active', active);
  });

  updateChart(latestStatus.counter_barang);

  // ── AUTO PROCESS LOG ──
  if (prev !== null) {
    if (!prev.run && latestStatus.run)                              saveProcessLog('START SISTEM',    latestStatus);
    if (prev.run  && !latestStatus.run)                            saveProcessLog('STOP SISTEM',     latestStatus);
    if (prev.state !== latestStatus.state)                         saveProcessLog('STATE: ' + latestStatus.state, latestStatus);
    if (latestStatus.counter_barang   > prev.counter_barang)       saveProcessLog('BARANG TERHITUNG', latestStatus);
    if (latestStatus.counter_stamping > prev.counter_stamping)     saveProcessLog('STAMPING BERHASIL', latestStatus);
    if (prev.pwm !== latestStatus.pwm)                             saveProcessLog('PWM BERUBAH',     latestStatus);
    if (prev.ir1 === 0 && latestStatus.ir1 === 1)                  saveProcessLog('IR1 TERDETEKSI',  latestStatus);
    if (prev.ir2 === 0 && latestStatus.ir2 === 1)                  saveProcessLog('IR2 TERDETEKSI',  latestStatus);
  }

  previousData = { ...latestStatus };
}

// ════════════════════════════════
//  MQTT PUBLISH
// ════════════════════════════════
function publishCommand(payload) {
  if (!mqttClient || !mqttConnected) {
    logMessage('MQTT publish failed: disconnected', 'err');
    return false;
  }
  const message = typeof payload === 'string' ? payload : JSON.stringify(payload);
  try {
    mqttClient.publish(TOPIC_CMD, message);
    console.log('Command sent:', message);
    logMessage(`Publish: ${message}`, 'ok');
    return true;
  } catch (error) {
    console.error('MQTT publish error:', error);
    logMessage(`Publish error: ${error}`, 'err');
    return false;
  }
}

// ════════════════════════════════
//  MQTT CONNECT
// ════════════════════════════════
function connectMqtt() {
  if (!window.mqtt) {
    setConnectionState(false, 'MQTT Error');
    logMessage('MQTT.js library tidak ditemukan', 'err');
    return;
  }
  const clientId = `WEB-STAMPING-${Math.random().toString(16).substring(2, 10)}`;
  mqttClient = mqtt.connect(MQTT_BROKER, {
    username: MQTT_USERNAME, password: MQTT_PASSWORD,
    clientId, reconnectPeriod: 2000, connectTimeout: 10000,
    clean: true, keepalive: 30,
  });

  mqttClient.on('connect', () => {
    setConnectionState(true, 'MQTT Connected');
    logMessage('MQTT Connected', 'ok');
    mqttClient.subscribe(TOPIC_STATUS, (err) => {
      if (err) logMessage(`Subscribe error: ${err}`, 'err');
      else logMessage(`Subscribed: ${TOPIC_STATUS}`, 'ok');
    });
  });
  mqttClient.on('reconnect', () => {
    logMessage('MQTT reconnecting...', 'warn');
  });
  mqttClient.on('close',   () => { setConnectionState(false, 'Disconnected'); logMessage('MQTT Disconnected', 'warn'); });
  mqttClient.on('offline', () => { setConnectionState(false, 'Offline');      logMessage('MQTT Offline', 'warn'); });
  mqttClient.on('error',   (err) => { setConnectionState(false, 'Error');     logMessage(`MQTT Error: ${err}`, 'err'); });

  mqttClient.on('message', (topic, message) => {
    if (topic !== TOPIC_STATUS) return;
    try {
      const data = JSON.parse(message.toString());
      logMessage(`Status: ${message.toString()}`, 'ok');
      updateDashboardFromStatus(data);
    } catch (err) {
      logMessage(`JSON error: ${err}`, 'err');
    }
  });
}

// ════════════════════════════════
//  CONVEYOR CONTROLS
// ════════════════════════════════
window.conveyorOn  = function () { publishCommand('START'); };
window.conveyorOff = function () { publishCommand('STOP'); };
window.resetSystem = function () { publishCommand('RESET_COUNTER'); };

// ════════════════════════════════
//  PWM SLIDER  (0–255 langsung)
// ════════════════════════════════
window.updateSpeed = function (value) {
  const pwmValue = Math.round(toNumber(value));   // 0–255 langsung dari slider
  setText('speedVal', String(pwmValue));
  console.log('PWM sent:', pwmValue);
  publishCommand({ command: 'SET_PWM', value: pwmValue });
};

// Legacy stubs
window.setMode      = function () {};
window.pressStamp   = function () {};
window.manualStamp  = function () {};
window.runServo2    = function () {};
window.sendServo2   = function () {};
window.runStepper   = function () {};
window.sendStepper  = function () {};
window.resetCounter = window.resetSystem;
window.setSpeed     = function (v) {
  const s = el('speedSlider');
  if (s) { s.value = v; window.updateSpeed(v); }
};

// ════════════════════════════════
//  PROCESS LOG
// ════════════════════════════════
function saveProcessLog(eventName, data) {
  if (!data) return;
  const newLog = {
    id: Date.now(),
    tanggal: new Date().toLocaleDateString('id-ID'),
    jam:     new Date().toLocaleTimeString('id-ID'),
    timestamp: new Date().toISOString(),
    event:   eventName,
    run:              data.run ?? false,
    motor:            data.motor ?? '-',
    state:            data.state ?? '-',
    ir1:              data.ir1 ?? '-',
    ir2:              data.ir2 ?? '-',
    counter_barang:   data.counter_barang ?? 0,
    counter_stamping: data.counter_stamping ?? 0,
    pwm:              data.pwm ?? 0,
    wifi:             data.wifi ?? '-',
  };
  processLogs = [newLog, ...processLogs];
  localStorage.setItem(LS_PROCESS_KEY, JSON.stringify(processLogs));
  console.log('Process log saved:', newLog);
  renderProcessLogTable();
}

function getEventClass(event) {
  if (event === 'START SISTEM')     return 'ev-start';
  if (event === 'STOP SISTEM')      return 'ev-stop';
  if (event === 'STAMPING BERHASIL') return 'ev-stamp';
  if (event === 'BARANG TERHITUNG') return 'ev-barang';
  if (event === 'SNAPSHOT MANUAL')  return 'ev-snapshot';
  if (event.startsWith('STATE:'))   return 'ev-state';
  if (event === 'PWM BERUBAH')      return 'ev-pwm';
  if (event.includes('IR'))         return 'ev-ir';
  return '';
}

function renderProcessLogTable() {
  const tbody   = el('processLogBody');
  const counter = el('processLogCount');
  if (!tbody) return;
  if (counter) counter.textContent = processLogs.length;

  if (processLogs.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="13">Belum ada log proses. Data tercatat otomatis saat ESP32 mengirim perubahan.</td></tr>`;
    return;
  }
  tbody.innerHTML = processLogs.map((log, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${log.tanggal}</td>
      <td>${log.jam}</td>
      <td><span class="ev-badge ${getEventClass(log.event)}">${log.event}</span></td>
      <td><span class="run-badge ${log.run ? 'on' : 'off'}">${log.run ? 'ON' : 'OFF'}</span></td>
      <td>${log.motor}</td>
      <td>${log.state}</td>
      <td>${log.ir1}</td>
      <td>${log.ir2}</td>
      <td>${log.counter_barang}</td>
      <td>${log.counter_stamping}</td>
      <td>${log.pwm}</td>
      <td>${log.wifi}</td>
    </tr>`).join('');
}

window.saveSnapshot = function () {
  saveProcessLog('SNAPSHOT MANUAL', latestStatus);
  logMessage('Snapshot manual disimpan', 'ok');
  const btn = el('btnSaveSnapshot');
  if (btn) { btn.classList.add('flash'); setTimeout(() => btn.classList.remove('flash'), 600); }
};

window.downloadProcessCSV = function () {
  if (!processLogs || processLogs.length === 0) { alert('Belum ada data log untuk didownload'); return; }
  const headers = ['No','Tanggal','Jam','Event','Run','Motor','State','IR1','IR2','Counter Barang','Counter Stamping','PWM','WiFi RSSI','Timestamp'];
  const rows = processLogs.map((log, i) => [
    i+1, log.tanggal, log.jam, log.event,
    log.run ? 'ON' : 'OFF', log.motor, log.state,
    log.ir1, log.ir2, log.counter_barang, log.counter_stamping,
    log.pwm, log.wifi, log.timestamp,
  ]);
  const BOM = '\uFEFF';
  const csv = BOM + [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'log_proses_stamping.csv'; a.click();
  URL.revokeObjectURL(url);
  console.log('CSV downloaded:', processLogs.length, 'record');
  logMessage(`CSV downloaded: ${processLogs.length} record`, 'ok');
};

window.resetProcessLog = function () {
  if (!confirm('Yakin ingin menghapus semua log proses?\nData tidak bisa dikembalikan.')) return;
  processLogs = [];
  localStorage.removeItem(LS_PROCESS_KEY);
  renderProcessLogTable();
  console.log('Process log dihapus');
  logMessage('Log proses direset', 'warn');
};

// ════════════════════════════════
//  LEGACY PRODUCTION HISTORY (kept for backward compat, no UI)
// ════════════════════════════════
const LS_KEY = 'produksi_stamping_history';
function loadHistory()     { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch(e){ return []; } }
function saveHistory(h)    { localStorage.setItem(LS_KEY, JSON.stringify(h)); }
function renderHistoryTable() { /* no-op: old table removed */ }
window.saveProduction = function () { /* no-op */ };
window.downloadCSV    = window.downloadProcessCSV;
window.resetHistory   = window.resetProcessLog;

// ════════════════════════════════
//  INIT
// ════════════════════════════════
function init() {
  setConnectionState(false, 'Disconnected');
  updateDashboardFromStatus(latestStatus);
  const slider = el('speedSlider');
  if (slider) window.updateSpeed(slider.value);
  connectMqtt();
  logMessage('Dashboard siap', 'ok');
}

init();
renderProcessLogTable();
