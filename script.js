// ════════════════════════════════
//  MQTT CONFIG
// ════════════════════════════════
const MQTT_BROKER = 'wss://68c31b50ae9e4ae79325b503da99b709.s1.eu.hivemq.cloud:8884/mqtt';
const TOPIC_STATUS = 'kelompok4/stamping/status';
const TOPIC_CMD = 'kelompok4/stamping/cmd';

// Credentials hardcoded agar pasti tersedia saat koneksi
const MQTT_USERNAME = 'ardisalim';
const MQTT_PASSWORD = 'Tarlina06)';

// ════════════════════════════════
//  STATE
// ════════════════════════════════
let mqttClient = null;
let mqttConnected = false;
let latestStatus = {
  run: false,
  motor: '-',
  state: '-',
  ir1: 0,
  ir2: 0,
  counter_barang: 0,
  counter_stamping: 0,
  pwm: 0,
  wifi: 0,
};

// ── PROCESS LOG STATE ──
const LS_PROCESS_KEY = 'stamping_process_logs';
let processLogs = [];
try {
  processLogs = JSON.parse(localStorage.getItem(LS_PROCESS_KEY) || '[]');
} catch (e) {
  console.error('processLogs load error:', e);
  processLogs = [];
}

// Simpan data sebelumnya untuk deteksi perubahan
let previousData = null;

const chartHistory = Array(24).fill(0);
const chartLabels = Array(24).fill('');

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function updateClock() {
  const clock = document.getElementById('clock');
  if (clock) {
    clock.textContent = new Date().toLocaleTimeString('id-ID');
  }
}
setInterval(updateClock, 1000);
updateClock();

Chart.defaults.font.family = 'Segoe UI';
Chart.defaults.font.size = 12;
Chart.defaults.color = '#a8b4c0';

const thrCtx = document.getElementById('thrChart').getContext('2d');
const thrChart = new Chart(thrCtx, {
  type: 'line',
  data: {
    labels: [...chartLabels],
    datasets: [{
      label: 'Total Barang',
      data: [...chartHistory],
      borderColor: '#5cc7ff',
      backgroundColor: 'rgba(92,199,255,.12)',
      fill: true,
      tension: 0.35,
      pointRadius: 0,
      borderWidth: 2.5,
    }]
  },
  options: {
    responsive: true,
    animation: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(20,28,45,.96)',
        titleColor: '#ffffff',
        bodyColor: '#c8d4e0',
        borderColor: 'rgba(92,199,255,.32)',
        borderWidth: 1,
        callbacks: { label: (context) => ` ${context.parsed.y} barang` }
      }
    },
    scales: {
      x: { display: false },
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(92,199,255,.12)' },
        ticks: { color: '#7a8a9a' }
      }
    }
  }
});

function logMessage(message, type = 'ok') {
  console.log(message);
  const body = document.getElementById('logBody');
  if (!body) return;

  const item = document.createElement('div');
  item.className = 'log-item';
  item.innerHTML = `<span class="log-time">${new Date().toLocaleTimeString('id-ID')}</span><div class="log-dot ${type}"></div><span>${message}</span>`;
  body.prepend(item);
  if (body.children.length > 40) body.lastChild.remove();
}

function setConnectionState(connected, label) {
  mqttConnected = connected;
  const pill = document.getElementById('systemStatus');
  const statusText = document.getElementById('statusText');
  const miniConn = document.getElementById('miniConn');

  if (statusText) statusText.textContent = label;
  if (miniConn) miniConn.textContent = connected ? 'Connected' : 'Disconnected';
  if (pill) {
    pill.classList.toggle('off', !connected);
  }

  const dot = pill ? pill.querySelector('.sp-dot') : null;
  if (dot) {
    dot.style.background = connected ? '#22c55e' : '#f97316';
    dot.style.animation = connected ? 'pulse 1.2s infinite' : 'none';
  }
}

function updateChart(totalBarang) {
  chartHistory.push(totalBarang);
  chartHistory.shift();
  thrChart.data.datasets[0].data = [...chartHistory];
  thrChart.update('none');
}

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

  const runText = latestStatus.run ? 'ON' : 'OFF';
  const wifiText = `${latestStatus.wifi} dBm`;

  const mapping = {
    'sc-run': runText,
    'sc-motor': latestStatus.motor,
    'sc-state': latestStatus.state,
    'sc-ir1': String(latestStatus.ir1),
    'sc-ir2': String(latestStatus.ir2),
    'sc-total': String(latestStatus.counter_barang),
    'sc-stamping': String(latestStatus.counter_stamping),
    'sc-pwm': String(latestStatus.pwm),
    'sc-wifi': wifiText,
    'runInfo': runText,
    'motorInfo': latestStatus.motor,
    'stateInfo': latestStatus.state,
    'ir1Info': String(latestStatus.ir1),
    'ir2Info': String(latestStatus.ir2),
    'wifiInfo': wifiText,
    'cnt-inlet': String(latestStatus.counter_barang),
    'cnt-ir1': String(latestStatus.ir1),
    'cnt-stamp': String(latestStatus.counter_stamping),
    'cnt-ir2': String(latestStatus.ir2),
    'cnt-outlet': String(latestStatus.counter_barang),
    'miniStatus': latestStatus.state,
  };

  Object.entries(mapping).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  });

  updateChart(latestStatus.counter_barang);
  const miniCmd = document.getElementById('miniCmd');
  if (miniCmd) miniCmd.textContent = `PWM ${latestStatus.pwm}`;

  const conveyorInfo = document.getElementById('conveyorInfo');
  if (conveyorInfo) conveyorInfo.textContent = runText;

  // ── AUTO PROCESS LOG ──
  if (prev !== null) {
    // run: false → true
    if (!prev.run && latestStatus.run) {
      saveProcessLog('START SISTEM', latestStatus);
    }
    // run: true → false
    if (prev.run && !latestStatus.run) {
      saveProcessLog('STOP SISTEM', latestStatus);
    }
    // state berubah
    if (prev.state !== latestStatus.state) {
      saveProcessLog('STATE: ' + latestStatus.state, latestStatus);
    }
    // counter_barang bertambah
    if (latestStatus.counter_barang > prev.counter_barang) {
      saveProcessLog('BARANG TERHITUNG', latestStatus);
    }
    // counter_stamping bertambah
    if (latestStatus.counter_stamping > prev.counter_stamping) {
      saveProcessLog('STAMPING BERHASIL', latestStatus);
    }
    // pwm berubah
    if (prev.pwm !== latestStatus.pwm) {
      saveProcessLog('PWM BERUBAH', latestStatus);
    }
    // ir1 terdeteksi (0 → 1)
    if (prev.ir1 === 0 && latestStatus.ir1 === 1) {
      saveProcessLog('IR1 TERDETEKSI', latestStatus);
    }
    // ir2 terdeteksi (0 → 1)
    if (prev.ir2 === 0 && latestStatus.ir2 === 1) {
      saveProcessLog('IR2 TERDETEKSI', latestStatus);
    }
  }

  previousData = { ...latestStatus };
}

function publishCommand(payload) {
  if (!mqttClient || !mqttConnected) {
    console.warn('MQTT belum connected');
    logMessage('MQTT publish failed: disconnected', 'err');
    return false;
  }

  const message = typeof payload === 'string' ? payload : JSON.stringify(payload);
  try {
    mqttClient.publish(TOPIC_CMD, message);
    console.log('Command sent:', message);
    logMessage(`Publish ${message}`, 'ok');
    return true;
  } catch (error) {
    console.error('MQTT publish error:', error);
    logMessage(`Publish error: ${error}`, 'err');
    return false;
  }
}

function connectMqtt() {
  if (!window.mqtt) {
    console.error('MQTT.js not loaded! Pastikan CDN mqtt.min.js termuat.');
    setConnectionState(false, 'MQTT Error');
    logMessage('MQTT.js library tidak ditemukan', 'err');
    return;
  }

  const clientId = `WEB-STAMPING-${Math.random().toString(16).substring(2, 10)}`;
  console.log('=== MQTT CONNECT ===');
  console.log('Broker :', MQTT_BROKER);
  console.log('Protocol: wss / port 8884');
  console.log('Username:', MQTT_USERNAME);
  console.log('ClientId:', clientId);

  mqttClient = mqtt.connect(MQTT_BROKER, {
    username: MQTT_USERNAME,
    password: MQTT_PASSWORD,
    clientId,
    reconnectPeriod: 2000,
    connectTimeout: 10000,
    clean: true,
    keepalive: 30,
  });

  mqttClient.on('connect', () => {
    console.log('MQTT connected');
    setConnectionState(true, 'MQTT Connected');
    logMessage('MQTT Connected', 'ok');
    mqttClient.subscribe(TOPIC_STATUS, (error) => {
      if (error) {
        console.error('Subscribe error:', error);
        logMessage(`Subscribe error: ${error}`, 'err');
      } else {
        console.log('Subscribed to:', TOPIC_STATUS);
        logMessage(`Subscribed ${TOPIC_STATUS}`, 'ok');
      }
    });
  });

  mqttClient.on('reconnect', () => {
    console.log('MQTT reconnecting...');
    logMessage('MQTT reconnecting...', 'warn');
  });

  mqttClient.on('close', () => {
    console.log('MQTT closed / disconnected');
    setConnectionState(false, 'MQTT Disconnected');
    logMessage('MQTT Disconnected', 'warn');
  });

  mqttClient.on('offline', () => {
    console.log('MQTT offline');
    setConnectionState(false, 'MQTT Offline');
    logMessage('MQTT Offline', 'warn');
  });

  mqttClient.on('error', (error) => {
    console.error('MQTT error:', error);
    setConnectionState(false, 'MQTT Error');
    logMessage(`MQTT Error: ${error}`, 'err');
  });

  mqttClient.on('message', (topic, message) => {
    console.log('MQTT message:', topic, message.toString());

    if (topic === TOPIC_STATUS) {
      try {
        const data = JSON.parse(message.toString());
        console.log('Status data received:', data);
        logMessage(`Status received: ${message.toString()}`, 'ok');
        updateDashboardFromStatus(data);
      } catch (error) {
        console.error('JSON parse error:', error);
        logMessage(`Status JSON error: ${error}`, 'err');
      }
    }
  });
}

window.conveyorOn = function () {
  publishCommand('START');
};

window.conveyorOff = function () {
  console.log('OFF button clicked');
  console.log('Command sent: STOP');
  publishCommand('STOP');
};

window.resetSystem = function () {
  publishCommand('RESET_COUNTER');
};

// PWM slider: nilai slider 0-100 (persen) → konversi ke 0-255 (raw ESP32)
window.updateSpeed = function (value) {
  const pct = toNumber(value);              // 0–100 dari slider
  const pwmRaw = Math.round((pct / 100) * 255); // 0–255 untuk ESP32

  const speedVal = document.getElementById('speedVal');
  const scPwm = document.getElementById('sc-pwm');
  if (speedVal) speedVal.textContent = String(pct);
  if (scPwm) scPwm.textContent = String(pwmRaw);

  const payload = JSON.stringify({ command: 'SET_PWM', value: pwmRaw });
  console.log('PWM sent:', payload, `(slider=${pct}%, raw=${pwmRaw})`);
  publishCommand({ command: 'SET_PWM', value: pwmRaw });
};

window.setSpeed = function (value) {
  const slider = document.getElementById('speedSlider');
  if (slider) slider.value = value;
  window.updateSpeed(value);
};

// ── Legacy/no-op stubs (YOLO/vision fitur tidak digunakan) ──
window.setMode = function () { /* disabled */ };
window.pressStamp = function () { /* disabled */ };
window.manualStamp = function () { /* disabled */ };
window.runServo2 = function () { /* disabled */ };
window.sendServo2 = function () { /* disabled */ };
window.runStepper = function () { /* disabled */ };
window.sendStepper = function () { /* disabled */ };
window.resetCounter = window.resetSystem;

function init() {
  setConnectionState(false, 'MQTT Disconnected');
  updateDashboardFromStatus(latestStatus);
  const slider = document.getElementById('speedSlider');
  if (slider) window.updateSpeed(slider.value);
  connectMqtt();
  logMessage('Dashboard MQTT siap', 'ok');
}

init();

// ════════════════════════════════
//  PROCESS LOG (localStorage)
// ════════════════════════════════

/** Simpan satu log proses ke processLogs dan localStorage */
function saveProcessLog(eventName, data) {
  if (!data) return;

  const newLog = {
    id: Date.now(),
    tanggal: new Date().toLocaleDateString('id-ID'),
    jam: new Date().toLocaleTimeString('id-ID'),
    timestamp: new Date().toISOString(),
    event: eventName,
    run: data.run ?? false,
    motor: data.motor ?? '-',
    state: data.state ?? '-',
    ir1: data.ir1 ?? '-',
    ir2: data.ir2 ?? '-',
    counter_barang: data.counter_barang ?? 0,
    counter_stamping: data.counter_stamping ?? 0,
    pwm: data.pwm ?? 0,
    wifi: data.wifi ?? '-',
  };

  processLogs = [newLog, ...processLogs];
  localStorage.setItem(LS_PROCESS_KEY, JSON.stringify(processLogs));
  console.log('Process log saved:', newLog);
  renderProcessLogTable();
}

/** Render tabel log proses dari processLogs */
function renderProcessLogTable() {
  const tbody = document.getElementById('processLogBody');
  const counter = document.getElementById('processLogCount');
  if (!tbody) return;

  if (counter) counter.textContent = processLogs.length;

  if (processLogs.length === 0) {
    tbody.innerHTML = '<tr class="history-empty"><td colspan="13">Belum ada log proses. Data akan otomatis tercatat saat ESP32 mengirim perubahan status.</td></tr>';
    return;
  }

  tbody.innerHTML = processLogs.map((log, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>${log.tanggal}</td>
      <td>${log.jam}</td>
      <td><span class="log-event-badge ${getEventClass(log.event)}">${log.event}</span></td>
      <td><span class="badge-run ${log.run ? 'on' : 'off'}">${log.run ? 'ON' : 'OFF'}</span></td>
      <td>${log.motor}</td>
      <td>${log.state}</td>
      <td>${log.ir1}</td>
      <td>${log.ir2}</td>
      <td>${log.counter_barang}</td>
      <td>${log.counter_stamping}</td>
      <td>${log.pwm}</td>
      <td>${log.wifi}</td>
    </tr>
  `).join('');
}

function getEventClass(event) {
  if (event === 'START SISTEM') return 'ev-start';
  if (event === 'STOP SISTEM') return 'ev-stop';
  if (event === 'STAMPING BERHASIL') return 'ev-stamp';
  if (event === 'BARANG TERHITUNG') return 'ev-barang';
  if (event === 'SNAPSHOT MANUAL') return 'ev-snapshot';
  if (event.startsWith('STATE:')) return 'ev-state';
  if (event === 'PWM BERUBAH') return 'ev-pwm';
  if (event.includes('IR')) return 'ev-ir';
  return '';
}

/** Tombol Simpan Snapshot Manual */
window.saveSnapshot = function () {
  saveProcessLog('SNAPSHOT MANUAL', latestStatus);
  logMessage('Snapshot manual disimpan', 'ok');
  const btn = document.getElementById('btnSaveSnapshot');
  if (btn) {
    btn.classList.add('flash');
    setTimeout(() => btn.classList.remove('flash'), 600);
  }
};

/** Download CSV log proses */
window.downloadProcessCSV = function () {
  if (!processLogs || processLogs.length === 0) {
    alert('Belum ada data log untuk didownload');
    return;
  }

  const headers = [
    'No', 'Tanggal', 'Jam', 'Event', 'Run', 'Motor', 'State',
    'IR1', 'IR2', 'Counter Barang', 'Counter Stamping', 'PWM', 'WiFi RSSI', 'Timestamp'
  ];

  const rows = processLogs.map((log, index) => [
    index + 1,
    log.tanggal,
    log.jam,
    log.event,
    log.run ? 'ON' : 'OFF',
    log.motor,
    log.state,
    log.ir1,
    log.ir2,
    log.counter_barang,
    log.counter_stamping,
    log.pwm,
    log.wifi,
    log.timestamp,
  ]);

  const BOM = '\uFEFF';
  const csvContent = BOM + [
    headers.join(','),
    ...rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(','))
  ].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'log_proses_stamping.csv';
  link.click();
  URL.revokeObjectURL(url);

  console.log('CSV downloaded:', processLogs.length, 'record');
  logMessage(`CSV log proses di-download: ${processLogs.length} record`, 'ok');
};

/** Reset semua log proses */
window.resetProcessLog = function () {
  if (!confirm('Yakin ingin menghapus semua log proses?\nData tidak bisa dikembalikan.')) return;
  processLogs = [];
  localStorage.removeItem(LS_PROCESS_KEY);
  renderProcessLogTable();
  console.log('Process log dihapus');
  logMessage('Log proses direset', 'warn');
};

// Render log proses saat halaman pertama kali dibuka
renderProcessLogTable();

// ════════════════════════════════
//  PRODUCTION HISTORY (localStorage)
// ════════════════════════════════
const LS_KEY = 'produksi_stamping_history';

/** Baca history dari localStorage */
function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '[]');
  } catch (e) {
    console.error('loadHistory error:', e);
    return [];
  }
}

/** Tulis history ke localStorage */
function saveHistory(history) {
  localStorage.setItem(LS_KEY, JSON.stringify(history));
}

/** Render tabel riwayat produksi dari history array */
function renderHistoryTable() {
  const history = loadHistory();
  const tbody = document.getElementById('historyBody');
  const counter = document.getElementById('historyCount');
  if (!tbody) return;

  if (counter) counter.textContent = history.length;

  if (history.length === 0) {
    tbody.innerHTML = '<tr class="history-empty"><td colspan="9">Belum ada data tersimpan. Tekan "Save Hasil Produksi" untuk menyimpan.</td></tr>';
    return;
  }

  tbody.innerHTML = history.map((row, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>${row.tanggal}</td>
      <td>${row.jam}</td>
      <td>${row.counter_barang}</td>
      <td>${row.counter_stamping}</td>
      <td>${row.pwm}</td>
      <td>${row.motor}</td>
      <td>${row.state}</td>
      <td>${row.wifi} dBm</td>
    </tr>
  `).join('');
}

/** Simpan snapshot produksi saat ini ke localStorage */
window.saveProduction = function () {
  const record = {
    id: Date.now(),
    tanggal: new Date().toLocaleDateString('id-ID'),
    jam: new Date().toLocaleTimeString('id-ID'),
    counter_barang: latestStatus.counter_barang,
    counter_stamping: latestStatus.counter_stamping,
    pwm: latestStatus.pwm,
    motor: latestStatus.motor,
    state: latestStatus.state,
    wifi: latestStatus.wifi,
  };

  const history = loadHistory();
  history.push(record);
  saveHistory(history);
  renderHistoryTable();

  console.log('✅ Data produksi berhasil disimpan:', record);
  logMessage(`Produksi disimpan: ${record.counter_barang} barang, ${record.counter_stamping} stamp`, 'ok');

  // Visual flash pada tombol
  const btn = document.getElementById('btnSaveProd');
  if (btn) {
    btn.classList.add('flash');
    setTimeout(() => btn.classList.remove('flash'), 600);
  }
};

/** Download semua riwayat sebagai file CSV */
window.downloadCSV = function () {
  const history = loadHistory();
  if (history.length === 0) {
    alert('Belum ada data riwayat produksi untuk di-download.');
    return;
  }

  const headers = ['No', 'Tanggal', 'Jam', 'Total Barang', 'Total Stamping', 'PWM', 'Motor', 'State', 'WiFi RSSI (dBm)'];
  const rows = history.map((row, idx) => [
    idx + 1,
    row.tanggal,
    row.jam,
    row.counter_barang,
    row.counter_stamping,
    row.pwm,
    row.motor,
    row.state,
    row.wifi,
  ]);

  // BOM agar Excel baca UTF-8 dengan benar
  const BOM = '\uFEFF';
  const csvStr = BOM + [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\r\n');

  const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'hasil_produksi_stamping.csv';
  a.click();
  URL.revokeObjectURL(url);

  console.log('✅ CSV berhasil di-download:', history.length, 'record');
  logMessage(`CSV downloaded: ${history.length} record`, 'ok');
};

/** Hapus semua riwayat produksi setelah konfirmasi */
window.resetHistory = function () {
  if (!confirm(`Yakin ingin menghapus semua riwayat produksi (${loadHistory().length} record)?\nData tidak bisa dikembalikan.`)) return;
  localStorage.removeItem(LS_KEY);
  renderHistoryTable();
  console.log('🗑️ Riwayat produksi dihapus');
  logMessage('Riwayat produksi direset', 'warn');
};

// Render tabel saat halaman pertama kali dibuka
renderHistoryTable();
