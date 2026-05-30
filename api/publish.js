const mqtt = require('mqtt');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  let payload;
  try {
    payload = typeof req.body === 'object' ? req.body : JSON.parse(req.body);
  } catch (err) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const broker = process.env.MQTT_BROKER;
  const username = process.env.MQTT_USERNAME;
  const password = process.env.MQTT_PASSWORD;
  const topic = process.env.MQTT_TOPIC_CMD || 'kelompok4/stamping/cmd';

  if (!broker || !username || !password) {
    return res.status(500).json({ error: 'MQTT credentials not configured on server' });
  }

  const client = mqtt.connect(broker, {
    username,
    password,
    reconnectPeriod: 0,
    connectTimeout: 5000,
    clean: true,
  });

  const body = JSON.stringify(payload);

  const tidy = () => {
    try { client.end(true); } catch (e) {}
  };

  client.on('connect', () => {
    client.publish(topic, body, { qos: 0 }, (err) => {
      tidy();
      if (err) return res.status(500).json({ error: 'Publish failed', detail: String(err) });
      return res.status(200).json({ ok: true });
    });
  });

  client.on('error', (err) => {
    tidy();
    return res.status(500).json({ error: 'MQTT connect error', detail: String(err) });
  });
};
