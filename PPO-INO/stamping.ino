#include <ArduinoJson.h>
#include <ESP32Servo.h>
#include <PubSubClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>

// WiFi credentials
const char *WIFI_SSID = "EKO";
const char *WIFI_PASS = "alhamdulillah";

// HiveMQ Cloud credentials
const char *MQTT_HOST = "68c31b50ae9e4ae79325b503da99b709.s1.eu.hivemq.cloud";
const uint16_t MQTT_PORT = 8883;
const char *MQTT_USER = "ardisalim";
const char *MQTT_PASS = "Tarlina06)";

// MQTT topics
const char *TOPIC_STATUS = "kelompok4/stamping/status";
const char *TOPIC_CMD = "kelompok4/stamping/cmd";

// GPIO mapping
const uint8_t PIN_IR1 = 32;
const uint8_t PIN_IR2 = 33;
const uint8_t PIN_SERVO1 = 26;
const uint8_t PIN_SERVO2 = 27;
const uint8_t PIN_CONVEYOR_PWM = 25;
const uint8_t PIN_STEPPER_PUL = 18;
const uint8_t PIN_STEPPER_DIR = 19;
const uint8_t PIN_STEPPER_EN = 23; // enable pin for TB6600

// Behavior tuning
const bool IR_ACTIVE_LOW = true;
const int CONVEYOR_PWM_CHANNEL = 0;
const int CONVEYOR_PWM_FREQ = 5000;
const int CONVEYOR_PWM_RESOLUTION = 8;
const int DEFAULT_CONVEYOR_PWM = 120;
const int SERVO_HOME_ANGLE = 0;
const int SERVO1_STAMP_ANGLE = 90;
const int SERVO2_REJECT_ANGLE = 90;
const unsigned long SERVO1_DOWN_TIME_MS = 350;
const unsigned long SERVO1_RETURN_TIME_MS = 350;
const unsigned long SERVO2_DOWN_TIME_MS = 350;
const unsigned long SERVO2_RETURN_TIME_MS = 350;
const unsigned long AUTO_STOP_TIME_MS = 150;
const unsigned long STEP_PULSE_INTERVAL_US = 1000;
const uint16_t STEP_PULSE_COUNT = 200;
const bool STEPPER_DIR_FORWARD_LEVEL = HIGH;
const bool STEPPER_PULSE_ACTIVE_LEVEL = LOW;
const bool STEPPER_PULSE_IDLE_LEVEL = HIGH;
const int IR_DETECTED_LEVEL = LOW;

WiFiClientSecure secureClient;
PubSubClient mqttClient(secureClient);
Servo servo1;
Servo servo2;

enum OperatingMode { MODE_AUTO, MODE_MANUAL };
enum ServoActionState { SERVO_IDLE, SERVO_DOWN, SERVO_RETURN };
enum StepperActionState { STEPPER_READY, STEPPER_PULSING };
enum AutoProcessState { AUTO_IDLE, AUTO_STOPPING, AUTO_RUN_SERVO1, AUTO_RUN_STEPPER };

OperatingMode currentMode = MODE_AUTO;
bool systemRunning = false;
int conveyorPwm = DEFAULT_CONVEYOR_PWM;

uint32_t totalCount = 0;
uint32_t stampedCount = 0;
uint32_t rejectCount = 0;

ServoActionState servo1State = SERVO_IDLE;
ServoActionState servo2State = SERVO_IDLE;
StepperActionState stepperState = STEPPER_READY;
AutoProcessState autoState = AUTO_IDLE;

unsigned long servo1StateStartMs = 0;
unsigned long servo2StateStartMs = 0;
unsigned long autoStateStartMs = 0;
unsigned long lastStepperToggleUs = 0;
uint16_t stepperPulseCount = 0;
bool stepperPulseLevel = STEPPER_PULSE_IDLE_LEVEL;
bool stepperBusy = false;

bool lastIr1Detected = false;
bool lastIr2Detected = false;

unsigned long lastPublishMs = 0;
const unsigned long publishIntervalMs = 500;

String conveyorStateText = "OFF";

String toText(OperatingMode mode) {
  return (mode == MODE_AUTO) ? "AUTO" : "MANUAL";
}

String toText(ServoActionState state) {
  switch (state) {
    case SERVO_DOWN:
    case SERVO_RETURN:
      return "RUNNING";
    case SERVO_IDLE:
    default:
      return "IDLE";
  }
}

String toText(StepperActionState state) {
  return (state == STEPPER_PULSING) ? "RUNNING" : "READY";
}

bool isIrDetected(uint8_t pin) {
  return digitalRead(pin) == IR_DETECTED_LEVEL;
}

void connectWiFi();
bool connectMQTT();
void publishStatus();
void mqttCallback(char *topic, byte *payload, unsigned int length);
void setConveyorPWM(int pwm);
void stopConveyor();
void runServo1();
void runServo2();
void runStepper();

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print('.');
  }

  Serial.println();
  Serial.print("WiFi connected. IP: ");
  Serial.println(WiFi.localIP());
}

bool connectMQTT() {
  if (mqttClient.connected()) {
    return true;
  }

  String clientId = "esp32-stamping-" + String((uint32_t)ESP.getEfuseMac(), HEX);

  Serial.print("Connecting to MQTT");
  while (!mqttClient.connected()) {
    bool ok = mqttClient.connect(clientId.c_str(), MQTT_USER, MQTT_PASS);
    if (ok) {
      Serial.println(" connected");
      mqttClient.subscribe(TOPIC_CMD);
      return true;
    }

    Serial.print('.');
    delay(1000);
  }

  return mqttClient.connected();
}

void setConveyorPWM(int pwm) {
  conveyorPwm = constrain(pwm, 0, 255);

  if (!systemRunning) {
    stopConveyor();
    return;
  }

  ledcWrite(CONVEYOR_PWM_CHANNEL, conveyorPwm);
  conveyorStateText = (conveyorPwm > 0) ? "ON" : "OFF";
}

void stopConveyor() {
  ledcWrite(CONVEYOR_PWM_CHANNEL, 0);
  conveyorStateText = "OFF";
}

void startServoAction(Servo &servo, ServoActionState &state, unsigned long &stateStartMs, int targetAngle) {
  servo.write(targetAngle);
  state = SERVO_DOWN;
  stateStartMs = millis();
}

void runServo1() {
  startServoAction(servo1, servo1State, servo1StateStartMs, SERVO1_STAMP_ANGLE);
}

void runServo2() {
  startServoAction(servo2, servo2State, servo2StateStartMs, SERVO2_REJECT_ANGLE);
}

void runStepper() {
  // enable stepper driver (active LOW assumed)
  digitalWrite(PIN_STEPPER_EN, LOW);
  digitalWrite(PIN_STEPPER_DIR, STEPPER_DIR_FORWARD_LEVEL);
  digitalWrite(PIN_STEPPER_PUL, STEPPER_PULSE_IDLE_LEVEL);

  stepperPulseCount = 0;
  stepperPulseLevel = STEPPER_PULSE_IDLE_LEVEL;
  lastStepperToggleUs = micros();
  stepperState = STEPPER_PULSING;
  stepperBusy = true;
}

void updateServo1Action() {
  if (servo1State == SERVO_IDLE) {
    return;
  }

  unsigned long now = millis();
  if (servo1State == SERVO_DOWN && now - servo1StateStartMs >= SERVO1_DOWN_TIME_MS) {
    servo1.write(SERVO_HOME_ANGLE);
    servo1State = SERVO_RETURN;
    servo1StateStartMs = now;
  } else if (servo1State == SERVO_RETURN && now - servo1StateStartMs >= SERVO1_RETURN_TIME_MS) {
    servo1State = SERVO_IDLE;
    servo1.write(SERVO_HOME_ANGLE);
  }
}

void updateServo2Action() {
  if (servo2State == SERVO_IDLE) {
    return;
  }

  unsigned long now = millis();
  if (servo2State == SERVO_DOWN && now - servo2StateStartMs >= SERVO2_DOWN_TIME_MS) {
    servo2.write(SERVO_HOME_ANGLE);
    servo2State = SERVO_RETURN;
    servo2StateStartMs = now;
  } else if (servo2State == SERVO_RETURN && now - servo2StateStartMs >= SERVO2_RETURN_TIME_MS) {
    servo2State = SERVO_IDLE;
    servo2.write(SERVO_HOME_ANGLE);
  }
}

void updateStepperAction() {
  if (!stepperBusy || stepperState != STEPPER_PULSING) {
    return;
  }

  unsigned long nowUs = micros();
  if (nowUs - lastStepperToggleUs < STEP_PULSE_INTERVAL_US) {
    return;
  }

  lastStepperToggleUs = nowUs;
  stepperPulseLevel = !stepperPulseLevel;
  digitalWrite(PIN_STEPPER_PUL, stepperPulseLevel);

  if (stepperPulseLevel == STEPPER_PULSE_IDLE_LEVEL) {
    stepperPulseCount++;
    if (stepperPulseCount >= STEP_PULSE_COUNT) {
      digitalWrite(PIN_STEPPER_PUL, STEPPER_PULSE_IDLE_LEVEL);
      stepperState = STEPPER_READY;
      stepperBusy = false;
      // disable stepper driver after motion
      digitalWrite(PIN_STEPPER_EN, HIGH);
    }
  }
}

void resetAutoCycle() {
  autoState = AUTO_IDLE;
}

void handleAutoProcess() {
  if (!systemRunning || currentMode != MODE_AUTO) {
    resetAutoCycle();
    return;
  }

  bool ir1Detected = isIrDetected(PIN_IR1);
  bool ir2Detected = isIrDetected(PIN_IR2);

  if (ir1Detected && !lastIr1Detected && autoState == AUTO_IDLE) {
    totalCount++;
    stopConveyor();
    autoState = AUTO_STOPPING;
    autoStateStartMs = millis();
  }

  if (ir2Detected && !lastIr2Detected) {
    stampedCount++;
  }

  lastIr1Detected = ir1Detected;
  lastIr2Detected = ir2Detected;

  unsigned long now = millis();

  switch (autoState) {
    case AUTO_STOPPING:
      if (now - autoStateStartMs >= AUTO_STOP_TIME_MS) {
        // first run servo2 to hold the item
        runServo2();
        // wait servo2 down time before running servo1
        autoState = AUTO_RUN_SERVO1;
        autoStateStartMs = now;
      }
      break;

    case AUTO_RUN_SERVO1:
      if (now - autoStateStartMs >= SERVO2_DOWN_TIME_MS) {
        // now run stamping servo
        runServo1();
        autoState = AUTO_RUN_STEPPER;
      }
      break;

    case AUTO_RUN_STEPPER:
      if (!stepperBusy) {
        if (systemRunning) {
          setConveyorPWM(conveyorPwm);
        }
        autoState = AUTO_IDLE;
      }
      break;

    case AUTO_IDLE:
    default:
      break;
  }
}

void resetCounters() {
  totalCount = 0;
  stampedCount = 0;
  rejectCount = 0;
}

void publishStatus() {
  StaticJsonDocument<512> doc;
  doc["running"] = systemRunning;
  doc["mode"] = toText(currentMode);
  doc["ir1"] = isIrDetected(PIN_IR1) ? 1 : 0;
  doc["ir2"] = isIrDetected(PIN_IR2) ? 1 : 0;
  doc["pwm"] = conveyorPwm;
  doc["total"] = totalCount;
  doc["stamped"] = stampedCount;
  doc["reject"] = rejectCount;
  doc["conveyor"] = conveyorStateText;
  doc["servo1"] = toText(servo1State);
  doc["servo2"] = toText(servo2State);
  doc["stepper"] = toText(stepperState);

  char payload[512];
  size_t length = serializeJson(doc, payload, sizeof(payload));
  payload[length] = '\0';

  mqttClient.publish(TOPIC_STATUS, payload, true);
}

void applyCommand(const String &command, int value) {
  String upper = command;
  upper.trim();
  upper.toUpperCase();

  if (upper == "START") {
    systemRunning = true;
    setConveyorPWM(conveyorPwm);
  } else if (upper == "STOP") {
    systemRunning = false;
    stopConveyor();
    resetAutoCycle();
  } else if (upper == "RESET_COUNTER") {
    resetCounters();
  } else if (upper == "SET_PWM") {
    if (value >= 0) {
      setConveyorPWM(value);
      if (systemRunning) {
        setConveyorPWM(conveyorPwm);
      }
    }
  } else if (upper == "SERVO1") {
    runServo1();
  } else if (upper == "SERVO2") {
    rejectCount++;
    runServo2();
  } else if (upper == "STEPPER") {
    runStepper();
  } else if (upper == "AUTO") {
    currentMode = MODE_AUTO;
  } else if (upper == "MANUAL") {
    currentMode = MODE_MANUAL;
  }
}

void mqttCallback(char *topic, byte *payload, unsigned int length) {
  if (String(topic) != TOPIC_CMD) {
    return;
  }

  String message;
  message.reserve(length + 1);
  for (unsigned int i = 0; i < length; i++) {
    message += static_cast<char>(payload[i]);
  }
  message.trim();

  int value = -1;
  String command = message;

  StaticJsonDocument<256> doc;
  if (deserializeJson(doc, message) == DeserializationError::Ok) {
    if (doc["command"].is<const char *>()) {
      command = doc["command"].as<String>();
    } else if (doc["cmd"].is<const char *>()) {
      command = doc["cmd"].as<String>();
    }

    if (doc["value"].is<int>()) {
      value = doc["value"].as<int>();
    }
  } else {
    int separator = message.indexOf(' ');
    if (separator < 0) {
      separator = message.indexOf(':');
    }
    if (separator < 0) {
      separator = message.indexOf(',');
    }

    if (separator > 0) {
      command = message.substring(0, separator);
      value = message.substring(separator + 1).toInt();
    }
  }

  if (command.equalsIgnoreCase("SET_PWM") && value < 0) {
    value = conveyorPwm;
  }

  applyCommand(command, value);
}

void setup() {
  Serial.begin(115200);
  delay(200);

  pinMode(PIN_IR1, INPUT_PULLUP);
  pinMode(PIN_IR2, INPUT_PULLUP);
  pinMode(PIN_STEPPER_PUL, OUTPUT);
  pinMode(PIN_STEPPER_DIR, OUTPUT);
  pinMode(PIN_STEPPER_EN, OUTPUT);
  digitalWrite(PIN_STEPPER_EN, HIGH); // keep stepper disabled by default

  ledcSetup(CONVEYOR_PWM_CHANNEL, CONVEYOR_PWM_FREQ, CONVEYOR_PWM_RESOLUTION);
  ledcAttachPin(PIN_CONVEYOR_PWM, CONVEYOR_PWM_CHANNEL);

  servo1.setPeriodHertz(50);
  servo2.setPeriodHertz(50);
  servo1.attach(PIN_SERVO1, 500, 2400);
  servo2.attach(PIN_SERVO2, 500, 2400);
  servo1.write(SERVO_HOME_ANGLE);
  servo2.write(SERVO_HOME_ANGLE);

  digitalWrite(PIN_STEPPER_PUL, STEPPER_PULSE_IDLE_LEVEL);
  digitalWrite(PIN_STEPPER_DIR, STEPPER_DIR_FORWARD_LEVEL);

  secureClient.setInsecure();
  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  mqttClient.setBufferSize(512);
  mqttClient.setKeepAlive(30);

  connectWiFi();
  connectMQTT();
  setConveyorPWM(conveyorPwm);
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  if (!mqttClient.connected()) {
    connectMQTT();
  }

  mqttClient.loop();

  updateServo1Action();
  updateServo2Action();
  updateStepperAction();
  handleAutoProcess();

  unsigned long now = millis();
  if (now - lastPublishMs >= publishIntervalMs) {
    lastPublishMs = now;
    publishStatus();
  }
}
