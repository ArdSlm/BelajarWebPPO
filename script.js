// ════════════════════════════════
//  MQTT CONFIG
// ════════════════════════════════
const MQTT_BROKER = "wss://68c31b50ae9e4ae79325b503da99b709.s1.eu.hivemq.cloud:8884/mqtt";
const MQTT_USERNAME = "ardisalim";
const MQTT_PASSWORD = "Tarlina06)";
const TOPIC_STATUS = "kelompok4/stamping/status";
const TOPIC_CMD = "kelompok4/stamping/cmd";

// ════════════════════════════════
//  STATE
// ════════════════════════════════
let running = false;
let mode = 'auto';
let pwm = 60;
let total = 0;
let stamped = 0;
let rejectCount = 0;
let mqttClient = null;
let mqttConnected = false;
let isApplyingRemoteState = false;
let lastThroughputSample = null;

const stCounts = { inlet: 0, ir1: 0, stamp: 0, ir2: 0, outlet: 0, 'reject-box': 0 };
const sensorState = { 'ir-inlet': true, stamp: true, qc: true, reject: true };

const thrData = Array(25).fill(0);
const thrLabels = Array(25).fill('');

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function createClientId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return 'web-dashboard-' + window.crypto.randomUUID();
  }
  return 'web-dashboard-' + Math.random().toString(16).slice(2, 10);
}

// ════════════════════════════════
//  CLOCK
// ════════════════════════════════
function tick() {
  const clock = document.getElementById('clock');
  if (!clock) return;
  clock.textContent = new Date().toLocaleTimeString('id-ID');
}
setInterval(tick, 1000);
tick();

// ════════════════════════════════
//  CHART.JS DEFAULTS
// ════════════════════════════════
Chart.defaults.font.family = 'Segoe UI';
Chart.defaults.font.size = 12;
Chart.defaults.color = '#a8b4c0';

// ── Throughput Chart ──
const thrCtx = document.getElementById('thrChart').getContext('2d');
const thrChart = new Chart(thrCtx, {
  type: 'line',
  data: {
    labels: [...thrLabels],
    datasets: [{
      label: 'Unit/menit',
      data: [...thrData],
      borderColor: '#5cc7ff',
      backgroundColor: 'rgba(92,199,255,.12)',
      fill: true,
      tension: 0.45,
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
        callbacks: { label: c => ` ${c.parsed.y} unit/menit` }
      }
    },
    scales: {
      x: { display: false },
      y: {
        grid: { color: 'rgba(92,199,255,.12)' },
        ticks: { color: '#7a8a9a' },
        min: 0,
        max: 25
      }
    }
  }
});

// ── Donut Chart ──
const donutCtx = document.getElementById('donutChart').getContext('2d');
const donutChart = new Chart(donutCtx, {
  type: 'doughnut',
  data: {
    labels: ['Terstempel', 'Reject', 'Proses'],
    datasets: [{
      data: [0, 0, 0],
      backgroundColor: ['#5cc7ff', '#ef4444', '#6eb3ff'],
      borderWidth: 2,
      borderColor: 'rgba(106,82,77,.95)',
      hoverOffset: 4
    }]
  },
  options: {
    cutout: '68%',
    responsive: true,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(20,28,45,.96)',
        titleColor: '#ffffff',
        bodyColor: '#c8d4e0',
        borderColor: 'rgba(92,199,255,.32)',
        borderWidth: 1
      }
    }
  }
});

// ════════════════════════════════
//  BELT SETUP
// ════════════════════════════════
(function buildBelt() {
  const surf = document.getElementById('beltSurf');
  if (surf) surf.innerHTML = '';
})();

function setBeltAnimation() {
  const surf = document.getElementById('beltSurf');
  if (!surf) return;

  if (!running) {
    surf.classList.remove('running');
    return;
  }

  const dur = (6 - (pwm / 100) * 5).toFixed(2) + 's';
  surf.style.setProperty('--dur', dur);
  surf.classList.add('running');
}

function setConnectionBanner(text, connected) {
  const pill = document.getElementById('systemStatus');
  const statusText = document.getElementById('statusText');
  if (!pill || !statusText) return;

  statusText.textContent = text;
  pill.classList.toggle('off', !connected);

  const dot = pill.querySelector('.sp-dot');
  if (dot) {
    dot.style.background = connected ? '#22c55e' : '#f97316';
    dot.style.animation = connected ? 'pulse 1.2s infinite' : 'none';
  }
}

function addLog(msg, type = 'ok') {
  const body = document.getElementById('logBody');
  if (!body) return;

  const el = document.createElement('div');
  el.className = 'log-item';
  el.innerHTML = `<span class="log-time">${new Date().toLocaleTimeString('id-ID')}</span>
    <div class="log-dot ${type}"></div><span>${msg}</span>`;
  body.prepend(el);
  if (body.children.length > 40) body.lastChild.remove();
}

function flashStn(id) {
  const el = document.getElementById('st-' + id);
  if (!el) return;
  el.classList.add('active');
  setTimeout(() => el.classList.remove('active'), 350);
}

function setMachineInfo(payload) {
  const conveyorInfo = document.getElementById('conveyorInfo');
  const servo1Info = document.getElementById('servo1Info');
  const servo2Info = document.getElementById('servo2Info');
  const stepperInfo = document.getElementById('stepperInfo');

  if (conveyorInfo) conveyorInfo.textContent = running ? 'ON' : 'OFF';
  if (servo1Info && payload.servo1 !== undefined) servo1Info.textContent = String(payload.servo1);
  if (servo2Info && payload.servo2 !== undefined) servo2Info.textContent = String(payload.servo2);
  if (stepperInfo && payload.stepper !== undefined) stepperInfo.textContent = String(payload.stepper);
}

function syncControlStateUI() {
  const btnOn = document.getElementById('btnOn');
  const btnOff = document.getElementById('btnOff');
  const stampBtn = document.getElementById('btnStamp');
  const modeAuto = document.getElementById('modeAuto');
  const modeManual = document.getElementById('modeManual');
  const modeInfo = document.getElementById('modeInfo');
  const note = document.getElementById('manualNote');
  const beltOffOverlay = document.getElementById('beltOffOverlay');
  const conveyorInfo = document.getElementById('conveyorInfo');

  if (btnOn) btnOn.disabled = running;
  if (btnOff) btnOff.disabled = !running;
  if (stampBtn) stampBtn.disabled = !(running && mode === 'manual');

  if (modeAuto) modeAuto.classList.toggle('active', mode === 'auto');
  if (modeManual) modeManual.classList.toggle('active', mode === 'manual');
  if (modeInfo) {
    modeInfo.textContent = mode.toUpperCase();
    modeInfo.style.color = mode === 'auto' ? '#22d3ff' : '#ffbb6b';
  }
  if (conveyorInfo) conveyorInfo.textContent = running ? 'ON' : 'OFF';
  if (beltOffOverlay) beltOffOverlay.classList.toggle('show', !running);

  if (note) {
    if (!running) {
      note.textContent = 'Hidupkan konveyor terlebih dahulu';
      note.style.color = '#88abd2';
    } else if (mode === 'manual') {
      note.textContent = 'Klik PRESS STAMP untuk stampling manual';
      note.style.color = '#ffbb6b';
    } else {
      note.textContent = 'Aktifkan mode MANUAL terlebih dahulu';
      note.style.color = '#88abd2';
    }
  }

  setBeltAnimation();
}

function setPwmUI(value) {
  pwm = clamp(parseInt(value, 10) || 0, 0, 100);

  const speedVal = document.getElementById('speedVal');
  const scPwm = document.getElementById('sc-pwm');
  const beltSpeedInfo = document.getElementById('beltSpeedInfo');
  const slider = document.getElementById('speedSlider');

  if (speedVal) speedVal.textContent = pwm;
  if (scPwm) scPwm.textContent = pwm + '%';
  if (beltSpeedInfo) beltSpeedInfo.textContent = pwm + '%';
  if (slider) slider.style.background = `linear-gradient(90deg, #5cc7ff ${pwm}%, rgba(92,199,255,.2) ${pwm}%)`;

  document.querySelectorAll('.preset-btn').forEach((button) => button.classList.remove('active'));
  const presets = document.querySelectorAll('.preset-btn');
  if (presets.length >= 3) {
    if (pwm <= 30) presets[0].classList.add('active');
    else if (pwm <= 70) presets[1].classList.add('active');
    else presets[2].classList.add('active');
  }

  setBeltAnimation();
}

function updateThroughputFromStatus(totalValue) {
  const now = Date.now();
  if (!lastThroughputSample) {
    lastThroughputSample = { total: totalValue, time: now };
    return;
  }

  const deltaUnits = Math.max(0, totalValue - lastThroughputSample.total);
  const deltaMinutes = Math.max((now - lastThroughputSample.time) / 60000, 1 / 60);
  const unitsPerMinute = Math.round(deltaUnits / deltaMinutes);

  thrData.push(unitsPerMinute);
  thrData.shift();
  thrChart.data.datasets[0].data = [...thrData];
  thrChart.update('none');

  lastThroughputSample = { total: totalValue, time: now };
}

function updateUI() {
  const totalEl = document.getElementById('sc-total');
  const stampedEl = document.getElementById('sc-stamped');
  const rejectEl = document.getElementById('sc-reject');
  const rateEl = document.getElementById('sc-rate');

  if (totalEl) totalEl.textContent = total.toLocaleString('id-ID');
  if (stampedEl) stampedEl.textContent = stamped.toLocaleString('id-ID');
  if (rejectEl) rejectEl.textContent = rejectCount.toLocaleString('id-ID');

  const rate = total > 0 ? ((stamped / total) * 100).toFixed(1) : '0.0';
  if (rateEl) rateEl.textContent = rate + '%';

  document.getElementById('sc-pwm').textContent = pwm + '%';

  Object.entries(stCounts).forEach(([key, value]) => {
    const el = document.getElementById('cnt-' + key);
    if (el) el.textContent = value;
  });

  const inProc = Math.max(0, total - stamped - rejectCount);
  donutChart.data.datasets[0].data = [stamped, rejectCount, inProc];
  donutChart.update('none');
}

function publishCommand(command, value) {
  // Backwards-compatible: if `value` is an object, spread it; otherwise send as { value }
  let extra = {};
  if (value !== undefined && value !== null) {
    extra = (typeof value === 'object') ? value : { value };
  }
  const payload = { command, ...extra };

  // Fallback: direct MQTT publish from browser (requires client credentials)
  if (!mqttClient || !mqttConnected) {
    console.error('MQTT Error', new Error('MQTT not connected'));
    return false;
  }

  try {
    const body = JSON.stringify(payload);
    mqttClient.publish(TOPIC_CMD, body);
    return true;
  } catch (error) {
    console.error('MQTT Error', error);
    return false;
  }
}

function applyStatusPayload(payload) {
  isApplyingRemoteState = true;
  try {
    if (typeof payload.running === 'boolean') running = payload.running;
    if (typeof payload.conveyor === 'string') running = payload.conveyor.toUpperCase() === 'ON';

    if (typeof payload.mode === 'string') {
      const nextMode = payload.mode.toLowerCase();
      mode = nextMode === 'manual' ? 'manual' : 'auto';
    }

    if (payload.pwm !== undefined && payload.pwm !== null) {
      pwm = clamp(parseInt(payload.pwm, 10) || 0, 0, 100);
    }

    if (payload.total !== undefined && payload.total !== null) {
      total = Math.max(0, Number(payload.total) || 0);
    }
    if (payload.stamped !== undefined && payload.stamped !== null) {
      stamped = Math.max(0, Number(payload.stamped) || 0);
    }
    if (payload.reject !== undefined && payload.reject !== null) {
      rejectCount = Math.max(0, Number(payload.reject) || 0);
    }

    if (payload.ir1 !== undefined && payload.ir1 !== null) {
      stCounts.ir1 = Number(payload.ir1) || 0;
    }
    if (payload.ir2 !== undefined && payload.ir2 !== null) {
      stCounts.ir2 = Number(payload.ir2) || 0;
    }

    stCounts.inlet = total;
    stCounts.stamp = stamped;
    stCounts.outlet = stamped + rejectCount;
    stCounts['reject-box'] = rejectCount;

    setMachineInfo(payload);

    // Update minimal vision/process UI if present in payload
    try {
      const vEl = document.getElementById('visionLabel');
      const vConfEl = document.getElementById('visionConfidence');
      const procEl = document.getElementById('process');

      if (payload.vision && typeof payload.vision === 'object') {
        if (vEl && payload.vision.label !== undefined) vEl.textContent = String(payload.vision.label);
        if (vConfEl && payload.vision.confidence !== undefined) vConfEl.textContent = String(payload.vision.confidence);
      } else {
        if (vEl && payload.visionLabel !== undefined) vEl.textContent = String(payload.visionLabel);
        if (vConfEl && payload.visionConfidence !== undefined) vConfEl.textContent = String(payload.visionConfidence);
      }

      if (procEl && payload.process !== undefined) procEl.textContent = String(payload.process);
    } catch (e) {
      // non-fatal
    }

    if (payload.ir1 === 1) flashStn('ir1');
    if (payload.ir2 === 1) flashStn('ir2');

    updateThroughputFromStatus(total);
  } finally {
    isApplyingRemoteState = false;
  }

  syncControlStateUI();
  setPwmUI(pwm);
  updateUI();
}

function initMqtt() {
  if (!window.mqtt) {
    console.error('MQTT Error', new Error('MQTT.js not loaded'));
    setConnectionBanner('MQTT Error', false);
    addLog('MQTT.js tidak tersedia di browser', 'err');
    return;
  }
  // Expose debugging hooks
  window.__mqttDebug = window.__mqttDebug || { attempts: 0, lastError: null };

  const tryConnect = (attempt = 1) => new Promise((resolve) => {
    window.__mqttDebug.attempts = attempt;
    let done = false;
    const client = mqtt.connect(MQTT_BROKER, {
      username: MQTT_USERNAME,
      password: MQTT_PASSWORD,
      clientId: createClientId(),
      reconnectPeriod: 0, // handle reconnects manually
      connectTimeout: 8000,
      clean: true,
      keepalive: 30,
    });

    const tidy = () => { try { client.end(true); } catch (e) {} };

    const onSuccess = () => {
      if (done) return; done = true;
      mqttClient = client;
      mqttConnected = true;
      setConnectionBanner('MQTT Connected', true);
      console.log('MQTT Connected');
      addLog('MQTT Connected', 'ok');

      client.subscribe(TOPIC_STATUS, { qos: 0 }, (err) => {
        if (err) { console.error('MQTT Error', err); addLog('Gagal subscribe topic status', 'err'); }
      });

      client.on('close', () => { mqttConnected = false; setConnectionBanner('MQTT Disconnected', false); });
      client.on('offline', () => { mqttConnected = false; setConnectionBanner('MQTT Disconnected', false); });
      client.on('error', (err) => { console.error('MQTT Error', err); window.__mqttDebug.lastError = String(err); addLog('MQTT Error', 'err'); setConnectionBanner('MQTT Error', false); });
      client.on('message', (topic, message) => {
        if (topic !== TOPIC_STATUS) return;
        try { const parsed = JSON.parse(message.toString()); if (parsed && typeof parsed === 'object') applyStatusPayload(parsed); }
        catch (err) { console.error('MQTT Error', err); addLog('Payload MQTT status tidak valid', 'err'); }
      });

      resolve({ ok: true, client });
    };

    const onError = (err) => {
      if (done) return; done = true;
      window.__mqttDebug.lastError = String(err || 'error');
      tidy();
      resolve({ ok: false, error: String(err) });
    };

    client.once('connect', onSuccess);
    client.once('error', onError);

    // safety timeout
    setTimeout(() => {
      if (done) return;
      done = true;
      window.__mqttDebug.lastError = 'connect-timeout';
      tidy();
      resolve({ ok: false, error: 'timeout' });
    }, 9000);
  });

  // try a few times with backoff, without await
  const retryConnect = (attempt) => {
    tryConnect(attempt).then((r) => {
      if (r.ok) return;

      addLog(`Percobaan koneksi MQTT ${attempt} gagal: ${r.error}`, 'err');

      if (attempt < 3) {
        setTimeout(() => retryConnect(attempt + 1), 1500 * attempt);
      } else {
        setConnectionBanner('MQTT Disconnected', false);
      }
    });
  };

  retryConnect(1);
}

// ════════════════════════════════
//  COMMAND HANDLERS
// ════════════════════════════════
window.conveyorOn = function () {
  running = true;
  syncControlStateUI();
  if (publishCommand('START')) addLog('Command START dikirim', 'ok');
  else addLog('Command START gagal dikirim', 'err');
};

window.conveyorOff = function () {
  running = false;
  syncControlStateUI();
  if (publishCommand('STOP')) addLog('Command STOP dikirim', 'warn');
  else addLog('Command STOP gagal dikirim', 'err');
};

window.setMode = function (nextMode) {
  mode = nextMode === 'manual' ? 'manual' : 'auto';
  syncControlStateUI();
  if (publishCommand(mode.toUpperCase())) addLog(`Command ${mode.toUpperCase()} dikirim`, 'ok');
  else addLog(`Command ${mode.toUpperCase()} gagal dikirim`, 'err');
};

window.updateSpeed = function (value) {
  setPwmUI(value);
  if (publishCommand('SET_PWM', { value: pwm })) addLog(`Command SET_PWM dikirim: ${pwm}`, 'ok');
  else addLog('Command SET_PWM gagal dikirim', 'err');
};

window.setSpeed = function (value) {
  const slider = document.getElementById('speedSlider');
  if (slider) slider.value = value;
  window.updateSpeed(value);
};

window.manualStamp = function () {
  if (!running || mode !== 'manual') return;

  const btn = document.getElementById('btnStamp');
  if (btn) {
    btn.classList.add('stamp-flash');
    setTimeout(() => btn.classList.remove('stamp-flash'), 500);
  }

  if (publishCommand('SERVO1')) addLog('Command SERVO1 dikirim', 'ok');
  else addLog('Command SERVO1 gagal dikirim', 'err');
};

window.sendServo1 = function () {
  window.manualStamp();
};

window.sendServo2 = function () {
  if (publishCommand('SERVO2')) addLog('Command SERVO2 dikirim', 'ok');
  else addLog('Command SERVO2 gagal dikirim', 'err');
};

window.sendStepper = function () {
  if (publishCommand('STEPPER')) addLog('Command STEPPER dikirim', 'ok');
  else addLog('Command STEPPER gagal dikirim', 'err');
};

window.pressStamp = window.manualStamp;
window.runServo2 = window.sendServo2;
window.runStepper = window.sendStepper;

window.toggleSensor = function (id, chk) {
  sensorState[id] = chk.checked;
  addLog(`Sensor ${id} ${chk.checked ? 'diaktifkan' : 'dinonaktifkan'}`, chk.checked ? 'ok' : 'warn');
};

window.resetSystem = function () {
  total = 0;
  stamped = 0;
  rejectCount = 0;
  Object.keys(stCounts).forEach((key) => {
    stCounts[key] = 0;
  });
  thrData.fill(0);
  thrChart.data.datasets[0].data = [...thrData];
  thrChart.update('none');
  lastThroughputSample = null;

  if (publishCommand('RESET_COUNTER')) addLog('Command RESET_COUNTER dikirim', 'ok');
  else addLog('Command RESET_COUNTER gagal dikirim', 'err');

  updateUI();
};

window.resetCounter = window.resetSystem;

// ════════════════════════════════
//  INIT
// ════════════════════════════════
setConnectionBanner('MQTT Disconnected', false);
setPwmUI(60);
syncControlStateUI();
updateUI();
setBeltAnimation();
initMqtt();

addLog('Dashboard siap menerima data MQTT', 'ok');
addLog('Menunggu status dari ESP32', 'warn');
