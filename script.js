// ════════════════════════════════
//  MQTT CONFIG
// ════════════════════════════════
const MQTT_BROKER = 'wss://68c31b50ae9e4ae79325b503da99b709.s1.eu.hivemq.cloud:8884/mqtt';
const TOPIC_STATUS = 'kelompok4/stamping/status';
const TOPIC_CMD = 'kelompok4/stamping/cmd';

const MQTT_USERNAME = window.HIVEMQ_USERNAME || '';
const MQTT_PASSWORD = window.HIVEMQ_PASSWORD || '';

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
    console.error('MQTT.js not loaded');
    setConnectionState(false, 'MQTT Error');
    return;
  }

  if (!MQTT_USERNAME || !MQTT_PASSWORD) {
    console.warn('MQTT credentials are missing from config.js');
    logMessage('MQTT credentials missing from config.js', 'warn');
  }

  console.log('Connecting to MQTT broker:', MQTT_BROKER);
  console.log('MQTT credentials:', { username: MQTT_USERNAME, passwordSet: !!MQTT_PASSWORD });

  mqttClient = mqtt.connect(MQTT_BROKER, {
    username: MQTT_USERNAME,
    password: MQTT_PASSWORD,
    clientId: `WEB-STAMPING-${Math.random().toString(16).substring(2, 10)}`,
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
    console.log('MQTT connection closed');
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
  publishCommand('STOP');
};

window.resetSystem = function () {
  publishCommand('RESET_COUNTER');
};

window.updateSpeed = function (value) {
  const pwmValue = toNumber(value);
  const speedVal = document.getElementById('speedVal');
  const scPwm = document.getElementById('sc-pwm');
  if (speedVal) speedVal.textContent = String(pwmValue);
  if (scPwm) scPwm.textContent = String(pwmValue);
  publishCommand({ command: 'SET_PWM', value: pwmValue });
};

window.setSpeed = function (value) {
  const slider = document.getElementById('speedSlider');
  if (slider) slider.value = value;
  window.updateSpeed(value);
};

window.setMode = function () {
  logMessage('Mode controls disabled in MQTT-only dashboard', 'warn');
};

window.pressStamp = function () {
  logMessage('pressStamp disabled in MQTT-only dashboard', 'warn');
};

window.runServo2 = function () {
  logMessage('runServo2 disabled in MQTT-only dashboard', 'warn');
};

window.runStepper = function () {
  logMessage('runStepper disabled in MQTT-only dashboard', 'warn');
};

window.manualStamp = window.pressStamp;
window.sendServo2 = window.runServo2;
window.sendStepper = window.runStepper;
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
