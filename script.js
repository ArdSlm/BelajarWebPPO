// ════════════════════════════════
//  STATE
// ════════════════════════════════
let running   = false;
let mode      = 'auto';   // 'auto' | 'manual'
let pwm       = 60;       // 0–100
let total     = 0, stamped = 0, rejectCount = 0;
let autoTimer = null;

const stCounts = { inlet:0, ir1:0, stamp:0, ir2:0, outlet:0, 'reject-box':0 };
const sensorState = { 'ir-inlet':true, stamp:true, qc:true, reject:true };

const thrData   = Array(25).fill(0);
const thrLabels = Array(25).fill('');

// ════════════════════════════════
//  CLOCK
// ════════════════════════════════
function tick() {
  document.getElementById('clock').textContent =
    new Date().toLocaleTimeString('id-ID');
}
setInterval(tick, 1000); tick();

// ════════════════════════════════
//  CHART.JS DEFAULTS
// ════════════════════════════════
Chart.defaults.font.family = 'Segoe UI';
Chart.defaults.font.size   = 12;
Chart.defaults.color       = '#a8b4c0';

// ── Throughput Chart ──
const thrCtx = document.getElementById('thrChart').getContext('2d');
const thrChart = new Chart(thrCtx, {
  type: 'line',
  data: { labels: [...thrLabels], datasets: [{
    label: 'Unit/menit', data: [...thrData],
    borderColor: '#5cc7ff', backgroundColor: 'rgba(92,199,255,.12)',
    fill: true, tension: 0.45, pointRadius: 0, borderWidth: 2.5,
  }]},
  options: {
    responsive: true, animation: false,
    plugins: { legend: { display: false }, tooltip: {
      backgroundColor: 'rgba(20,28,45,.96)', titleColor: '#ffffff', bodyColor: '#c8d4e0',
      borderColor: 'rgba(92,199,255,.32)', borderWidth: 1,
      callbacks: { label: c => ` ${c.parsed.y} unit/menit` }
    }},
    scales: {
      x: { display: false },
      y: { grid: { color: 'rgba(92,199,255,.12)' }, ticks: { color: '#7a8a9a' }, min: 0, max: 25 }
    }
  }
});

// ── Donut Chart ──
const donutCtx = document.getElementById('donutChart').getContext('2d');
const donutChart = new Chart(donutCtx, {
  type: 'doughnut',
  data: { labels: ['Terstempel','Reject','Proses'], datasets: [{
    data: [0, 0, 0],
    backgroundColor: ['#5cc7ff','#ef4444','#6eb3ff'],
    borderWidth: 2, borderColor: 'rgba(106,82,77,.95)', hoverOffset: 4
  }]},
  options: {
    cutout: '68%', responsive: true,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(20,28,45,.96)', titleColor:'#ffffff', bodyColor:'#c8d4e0',
        borderColor: 'rgba(92,199,255,.32)', borderWidth: 1
      }
    }
  }
});

// ════════════════════════════════
//  BELT SETUP
// ════════════════════════════════
(function buildBelt() {
  const surf = document.getElementById('beltSurf');
  surf.innerHTML = '';
})();

function setBeltAnimation() {
  const surf = document.getElementById('beltSurf');
  if (!running) {
    surf.classList.remove('running');
    return;
  }
  // speed: pwm 0→100 maps to duration 6s→1s
  const dur = (6 - (pwm / 100) * 5).toFixed(2) + 's';
  surf.style.setProperty('--dur', dur);
  surf.classList.add('running');
}

// ════════════════════════════════
//  SPAWN ITEM ON BELT
// ════════════════════════════════
function spawnItem(isReject = false) {
  const belt = document.getElementById('beltItems');
  const el   = document.createElement('div');
  el.className = 'belt-item ' + (isReject ? 'reject' : 'ok');
  el.textContent = isReject ? '⚠️' : '📦';
  const spd = (6 - (pwm / 100) * 4.5).toFixed(1) + 's';
  el.style.setProperty('--spd', spd);
  el.style.top = (28 + Math.random() * 10) + '%';
  belt.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

// ════════════════════════════════
//  LOG
// ════════════════════════════════
function addLog(msg, type = 'ok') {
  const body = document.getElementById('logBody');
  const el   = document.createElement('div');
  el.className = 'log-item';
  el.innerHTML = `<span class="log-time">${new Date().toLocaleTimeString('id-ID')}</span>
    <div class="log-dot ${type}"></div><span>${msg}</span>`;
  body.prepend(el);
  if (body.children.length > 40) body.lastChild.remove();
}

// ════════════════════════════════
//  STATION FLASH
// ════════════════════════════════
function flashStn(id) {
  const el = document.getElementById('st-' + id);
  if (!el) return;
  el.classList.add('active');
  setTimeout(() => el.classList.remove('active'), 350);
}

// ════════════════════════════════
//  UPDATE UI
// ════════════════════════════════
function updateUI() {
  document.getElementById('sc-total').textContent   = total.toLocaleString('id-ID');
  document.getElementById('sc-stamped').textContent = stamped.toLocaleString('id-ID');
  document.getElementById('sc-reject').textContent  = rejectCount.toLocaleString('id-ID');
  const rate = total > 0 ? ((stamped / total) * 100).toFixed(1) : '0.0';
  document.getElementById('sc-rate').textContent    = rate + '%';
  document.getElementById('sc-pwm').textContent     = pwm + '%';

  Object.entries(stCounts).forEach(([k, v]) => {
    const el = document.getElementById('cnt-' + k);
    if (el) el.textContent = v;
  });

  const inProc = Math.max(0, total - stamped - rejectCount);
  donutChart.data.datasets[0].data = [stamped, rejectCount, inProc];
  donutChart.update('none');
}

// ════════════════════════════════
//  PROCESS ONE ITEM (single cycle)
// ════════════════════════════════
function processItem() {
  if (!running) return;

  // Inlet
  stCounts.inlet++;
  flashStn('inlet');
  total++;

  setTimeout(() => {
    // IR Sensor
    if (!sensorState['ir-inlet']) return;
    stCounts.ir1++;
    flashStn('ir1');
  }, 300);

  setTimeout(() => {
    // Stampling
    if (!sensorState['stamp']) return;
    stCounts.stamp++;
    flashStn('stamp');
    // stamp flash animation
    const stampEl = document.getElementById('dot-stamp');
    if (stampEl) { stampEl.classList.remove('green'); stampEl.classList.add('yellow'); }
    setTimeout(() => {
      if (stampEl) { stampEl.classList.remove('yellow'); stampEl.classList.add('green'); }
    }, 200);
  }, 600);

  setTimeout(() => {
    // QC
    if (!sensorState['qc']) return;
    stCounts.ir2++;
    flashStn('ir2');

    const isReject = sensorState.reject && (Math.random() < 0.05);

    if (isReject) {
      rejectCount++;
      stCounts['reject-box']++;
      stCounts.outlet++;
      spawnItem(true);
      addLog(`⚠ Barang #${total} REJECT — dikeluarkan`, 'err');
      const rDot = document.getElementById('dot-reject');
      if (rDot) { rDot.classList.add('red'); setTimeout(() => rDot.classList.remove('red'), 600); }
    } else {
      stamped++;
      stCounts.outlet++;
      flashStn('outlet');
      spawnItem(false);
      if (Math.random() < 0.1) addLog(`✓ Barang #${total} berhasil distempel`, 'ok');
    }

    // Throughput update
    const upm = Math.round(pwm * 0.18 + Math.random() * 3);
    thrData.push(upm); thrData.shift();
    thrChart.data.datasets[0].data = [...thrData];
    thrChart.update('none');

    updateUI();
  }, 900);
}

// ════════════════════════════════
//  CONVEYOR ON / OFF
// ════════════════════════════════
window.conveyorOn = function () {
  running = true;
  document.getElementById('btnOn').disabled  = true;
  document.getElementById('btnOff').disabled = false;
  document.getElementById('beltOffOverlay').classList.remove('show');

  const sp = document.getElementById('systemStatus');
  sp.classList.remove('off');
  document.getElementById('statusText').textContent = 'KONVEYOR RUNNING';
  sp.querySelector('.sp-dot').style.background = '#22c55e';

  setBeltAnimation();

  if (mode === 'auto') startAuto();
  addLog('✅ Konveyor dihidupkan', 'ok');
  updateUI();
};

window.conveyorOff = function () {
  running = false;
  document.getElementById('btnOn').disabled  = false;
  document.getElementById('btnOff').disabled = true;
  document.getElementById('beltOffOverlay').classList.add('show');

  const sp = document.getElementById('systemStatus');
  sp.classList.add('off');
  document.getElementById('statusText').textContent = 'KONVEYOR BERHENTI';

  setBeltAnimation();
  stopAuto();

  // disable stamp in manual
  document.getElementById('btnStamp').disabled = true;

  addLog('⏸ Konveyor dimatikan', 'warn');
  updateUI();
};

// ════════════════════════════════
//  MODE AUTO / MANUAL
// ════════════════════════════════
window.setMode = function (m) {
  mode = m;
  document.getElementById('modeAuto').classList.toggle('active',   m === 'auto');
  document.getElementById('modeManual').classList.toggle('active', m === 'manual');
  document.getElementById('modeInfo').textContent = m.toUpperCase();
  document.getElementById('modeInfo').style.color = m === 'auto' ? '#22d3ff' : '#ffbb6b';

  const stampBtn  = document.getElementById('btnStamp');
  const note      = document.getElementById('manualNote');

  if (m === 'manual') {
    stopAuto();
    if (running) {
      stampBtn.disabled = false;
      note.textContent = 'Klik PRESS STAMP untuk stampling manual';
      note.style.color = '#ffbb6b';
    } else {
      note.textContent = 'Hidupkan konveyor terlebih dahulu';
    }
  } else {
    stampBtn.disabled = true;
    note.textContent  = 'Aktifkan mode MANUAL terlebih dahulu';
    note.style.color  = '#88abd2';
    if (running) startAuto();
  }
  addLog(`Mode diubah ke ${m.toUpperCase()}`, 'ok');
};

// ════════════════════════════════
//  AUTO LOOP
// ════════════════════════════════
function startAuto() {
  stopAuto();
  // interval: pwm 0→100 maps 3000ms→400ms
  const interval = Math.round(3000 - (pwm / 100) * 2600);
  autoTimer = setInterval(() => {
    if (running && mode === 'auto') processItem();
  }, interval);
}

function stopAuto() {
  if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
}

// ════════════════════════════════
//  SPEED CONTROL
// ════════════════════════════════
window.updateSpeed = function (val) {
  pwm = parseInt(val);
  document.getElementById('speedVal').textContent = pwm;
  document.getElementById('sc-pwm').textContent   = pwm + '%';
  document.getElementById('beltSpeedInfo').textContent = pwm + '%';

  // update slider gradient
  const slider = document.getElementById('speedSlider');
  slider.style.background = `linear-gradient(90deg, #5cc7ff ${pwm}%, rgba(92,199,255,.2) ${pwm}%)`;


  // update preset active state
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
  if (pwm <= 30)      document.querySelectorAll('.preset-btn')[0].classList.add('active');
  else if (pwm <= 70) document.querySelectorAll('.preset-btn')[1].classList.add('active');
  else                document.querySelectorAll('.preset-btn')[2].classList.add('active');

  setBeltAnimation();
  if (running && mode === 'auto') startAuto(); // restart with new interval
  addLog(`Kecepatan motor diubah: PWM ${pwm}%`, 'ok');
};

window.setSpeed = function (val) {
  document.getElementById('speedSlider').value = val;
  updateSpeed(val);
};

// ════════════════════════════════
//  MANUAL STAMP
// ════════════════════════════════
window.manualStamp = function () {
  if (!running || mode !== 'manual') return;

  const btn = document.getElementById('btnStamp');
  btn.classList.add('stamp-flash');
  btn.disabled = true;
  setTimeout(() => { btn.disabled = false; btn.classList.remove('stamp-flash'); }, 500);

  processItem();
  addLog('🔨 Manual stamp dieksekusi', 'warn');
};

// ════════════════════════════════
//  SENSOR TOGGLE
// ════════════════════════════════
window.toggleSensor = function (id, chk) {
  sensorState[id] = chk.checked;
  addLog(`Sensor ${id} ${chk.checked ? 'diaktifkan' : 'dinonaktifkan'}`, chk.checked ? 'ok' : 'warn');
};

// ════════════════════════════════
//  RESET
// ════════════════════════════════
window.resetSystem = function () {
  total = stamped = rejectCount = 0;
  Object.keys(stCounts).forEach(k => stCounts[k] = 0);
  thrData.fill(0);
  thrChart.data.datasets[0].data = [...thrData];
  thrChart.update('none');
  updateUI();
  addLog('🔄 Counter di-reset', 'warn');
};

// init slider gradient
updateSpeed(60);

// ── INIT LOG ──
addLog('Sistem diinisialisasi, siap beroperasi', 'ok');
addLog('Semua sensor aktif', 'ok');
addLog('Tekan ON untuk memulai konveyor', 'ok');
