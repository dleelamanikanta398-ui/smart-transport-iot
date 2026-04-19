/* ============================================
   SMART TRANSPORT SECURITY - IoT COMMAND CENTER
   Firebase Real-Time Application Logic
   ============================================ */

// ─── FIREBASE CONFIGURATION ─────────────────────────────────────────
const firebaseConfig = {
    apiKey: "AIzaSyBrbxtNzYyj2z6n8Rkh5hggMbumlwzz9RM",
    authDomain: "freshair-ae7ac.firebaseapp.com",
    databaseURL: "https://freshair-ae7ac-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "freshair-ae7ac",
    storageBucket: "freshair-ae7ac.firebasestorage.app",
    messagingSenderId: "281645449615",
    appId: "1:281645449615:web:17e88aba105c97cbb94bfa",
    measurementId: "G-KX84QJ5ZN1"
};

// ─── INITIALIZE FIREBASE ────────────────────────────────────────────
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ─── DATABASE REFERENCES ────────────────────────────────────────────
const refs = {
    // Read-only sensor data
    temperature: db.ref('data/temperature'),
    humidity:    db.ref('data/humidity'),
    motion:      db.ref('data/motion'),
    gpsLat:      db.ref('data/gps_lat'),
    gpsLng:      db.ref('data/gps_lng'),
    systemStatus:db.ref('data/systemStatus'),
    fanStatus:   db.ref('data/fanStatus'),

    // Alerts
    alertStatus: db.ref('alerts/status'),
    alertTimestamp: db.ref('alerts/timestamp'),
    sosActive:   db.ref('alerts/sosActive'),

    // Control (write)
    controlFan:       db.ref('control/fan'),
    controlSystemMode:db.ref('control/systemMode'),
    controlEmergencyReset: db.ref('control/emergencyReset'),
    controlSosToggle: db.ref('control/sosToggle'),

    // SMS
    smsStatus:   db.ref('sms/status'),
    smsLastSent: db.ref('sms/lastSentTime'),
};

// ─── DOM REFERENCES ─────────────────────────────────────────────────
const dom = {
    // Sensor values
    tempValue:      document.getElementById('tempValue'),
    humValue:       document.getElementById('humValue'),
    motionValue:    document.getElementById('motionValue'),
    sysStatusValue: document.getElementById('sysStatusValue'),
    tempBar:        document.getElementById('tempBar'),
    humBar:         document.getElementById('humBar'),
    motionIndicator:document.getElementById('motionIndicator'),
    sysIndicator:   document.getElementById('sysIndicator'),
    motionCard:     document.getElementById('motionCard'),
    tempCard:       document.getElementById('tempCard'),
    humCard:        document.getElementById('humCard'),

    // Fan
    fanHwStatus:    document.getElementById('fanHwStatus'),
    fanCmdStatus:   document.getElementById('fanCmdStatus'),
    fanBladeContainer: document.getElementById('fanBladeContainer'),
    fanOnBtn:       document.getElementById('fanOnBtn'),
    fanOffBtn:      document.getElementById('fanOffBtn'),

    // SOS
    sosOverlay:     document.getElementById('sosOverlay'),
    sosMessage:     document.getElementById('sosMessage'),
    sosTimestamp:   document.getElementById('sosTimestamp'),
    sosRing:        document.getElementById('sosRing'),
    sosRingText:    document.getElementById('sosRingText'),
    alertStatusValue: document.getElementById('alertStatusValue'),
    sosActiveValue: document.getElementById('sosActiveValue'),

    // Alert bar
    alertBar:       document.getElementById('alertBar'),
    alertBarText:   document.getElementById('alertBarText'),
    alertBarTime:   document.getElementById('alertBarTime'),
    alertBarIcon:   document.querySelector('.alert-bar-icon'),

    // GPS
    gpsLat:         document.getElementById('gpsLat'),
    gpsLng:         document.getElementById('gpsLng'),
    gpsMapFrame:    document.getElementById('gpsMapFrame'),
    gpsMapPlaceholder: document.getElementById('gpsMapPlaceholder'),
    gpsOpenMaps:    document.getElementById('gpsOpenMaps'),

    // SMS
    smsStatus:      document.getElementById('smsStatus'),
    smsLastSent:    document.getElementById('smsLastSent'),

    // System Controls
    modeArmedBtn:   document.getElementById('modeArmedBtn'),
    modeDisarmedBtn:document.getElementById('modeDisarmedBtn'),

    // Header
    connectionStatus: document.getElementById('connectionStatus'),
    headerClock:    document.getElementById('headerClock'),
};

// ─── STATE ──────────────────────────────────────────────────────────
let state = {
    sosAlarmActive: false,
    audioCtx: null,
    alarmOscillator: null,
    alarmGain: null,
    alarmInterval: null,
    gpsLat: null,
    gpsLng: null,
    currentFanCmd: null,
};

// ─── HEADER CLOCK ───────────────────────────────────────────────────
function updateClock() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    const secs = String(now.getSeconds()).padStart(2, '0');
    dom.headerClock.textContent = `${hours}:${mins}:${secs}`;
}
setInterval(updateClock, 1000);
updateClock();

// ─── CONNECTION STATUS ──────────────────────────────────────────────
const connectedRef = db.ref('.info/connected');
connectedRef.on('value', (snap) => {
    if (snap.val() === true) {
        dom.connectionStatus.classList.add('connected');
        dom.connectionStatus.querySelector('.status-text').textContent = 'CONNECTED';
    } else {
        dom.connectionStatus.classList.remove('connected');
        dom.connectionStatus.querySelector('.status-text').textContent = 'DISCONNECTED';
    }
});

// ─── UTILITY: Flash value update ────────────────────────────────────
function flashValue(element) {
    element.classList.remove('value-updated');
    // Force reflow
    void element.offsetWidth;
    element.classList.add('value-updated');
}

// ─── WEB AUDIO API: SOS ALARM ───────────────────────────────────────
function initAudioContext() {
    if (!state.audioCtx) {
        state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (state.audioCtx.state === 'suspended') {
        state.audioCtx.resume();
    }
}

function startAlarmSound() {
    if (state.sosAlarmActive) return; // Already playing
    state.sosAlarmActive = true;

    try {
        initAudioContext();
        const ctx = state.audioCtx;

        // Create a pulsing alarm: alternating high/low tones
        let isHigh = true;

        function playBeep() {
            if (!state.sosAlarmActive) return;

            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'square';
            osc.frequency.value = isHigh ? 880 : 660;

            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.4);

            isHigh = !isHigh;
        }

        playBeep();
        state.alarmInterval = setInterval(playBeep, 500);

    } catch (e) {
        console.warn('Audio alarm could not start:', e);
    }
}

function stopAlarmSound() {
    state.sosAlarmActive = false;

    if (state.alarmInterval) {
        clearInterval(state.alarmInterval);
        state.alarmInterval = null;
    }
}

// ─── SOS OVERLAY CONTROL ────────────────────────────────────────────
function showSOSOverlay(message, timestamp) {
    dom.sosOverlay.classList.remove('hidden');
    dom.sosMessage.textContent = message || 'EMERGENCY ALERT ACTIVE';
    dom.sosTimestamp.textContent = timestamp ? `Alert Time: ${timestamp}` : '';
    startAlarmSound();
}

function hideSOSOverlay() {
    dom.sosOverlay.classList.add('hidden');
    stopAlarmSound();
}

// ─── FIREBASE CONTROL WRITES ────────────────────────────────────────

// Fan control
function setFan(value) {
    // User interaction → unlock audio context
    initAudioContext();
    refs.controlFan.set(value)
        .then(() => console.log(`Fan command sent: ${value}`))
        .catch(err => console.error('Fan write error:', err));
}

// SOS controls
function activateSOS() {
    initAudioContext();
    refs.controlSosToggle.set('ON')
        .then(() => console.log('SOS activated from dashboard'))
        .catch(err => console.error('SOS activate error:', err));
}

function deactivateSOS() {
    refs.controlSosToggle.set('OFF')
        .then(() => {
            console.log('SOS deactivated from dashboard');
            hideSOSOverlay();
        })
        .catch(err => console.error('SOS deactivate error:', err));
}

// System mode
function setSystemMode(mode) {
    initAudioContext();
    refs.controlSystemMode.set(mode)
        .then(() => console.log(`System mode set: ${mode}`))
        .catch(err => console.error('System mode error:', err));
}

// Emergency reset
function emergencyReset() {
    initAudioContext();
    refs.controlEmergencyReset.set(true)
        .then(() => {
            console.log('Emergency reset triggered');
            // Auto-clear after 2 seconds so hardware can detect the pulse
            setTimeout(() => {
                refs.controlEmergencyReset.set(false);
            }, 2000);
        })
        .catch(err => console.error('Emergency reset error:', err));
}

// ─── FIREBASE REAL-TIME LISTENERS ───────────────────────────────────

// === TEMPERATURE ===
refs.temperature.on('value', (snapshot) => {
    const val = snapshot.val();
    if (val !== null && val !== undefined) {
        dom.tempValue.textContent = parseFloat(val).toFixed(1);
        flashValue(dom.tempValue);
        // Bar: 0-60°C range
        const pct = Math.min(100, Math.max(0, (parseFloat(val) / 60) * 100));
        dom.tempBar.style.width = pct + '%';
    } else {
        dom.tempValue.textContent = '--';
        dom.tempBar.style.width = '0%';
    }
});

// === HUMIDITY ===
refs.humidity.on('value', (snapshot) => {
    const val = snapshot.val();
    if (val !== null && val !== undefined) {
        dom.humValue.textContent = parseFloat(val).toFixed(1);
        flashValue(dom.humValue);
        const pct = Math.min(100, Math.max(0, parseFloat(val)));
        dom.humBar.style.width = pct + '%';
    } else {
        dom.humValue.textContent = '--';
        dom.humBar.style.width = '0%';
    }
});

// === MOTION ===
refs.motion.on('value', (snapshot) => {
    const val = snapshot.val();
    const motionDetected = (val === true || val === 1 || val === "1" || val === "true" || val === "DETECTED" || val === "YES");

    if (val !== null && val !== undefined) {
        if (motionDetected) {
            dom.motionValue.textContent = 'DETECTED';
            dom.motionValue.className = 'card-value motion-value detected';
            dom.motionIndicator.className = 'motion-indicator active';
            dom.motionCard.classList.add('alert');
        } else {
            dom.motionValue.textContent = 'CLEAR';
            dom.motionValue.className = 'card-value motion-value clear';
            dom.motionIndicator.className = 'motion-indicator inactive';
            dom.motionCard.classList.remove('alert');
        }
        flashValue(dom.motionValue);
    } else {
        dom.motionValue.textContent = '--';
        dom.motionValue.className = 'card-value motion-value';
        dom.motionIndicator.className = 'motion-indicator';
        dom.motionCard.classList.remove('alert');
    }
});

// === SYSTEM STATUS ===
refs.systemStatus.on('value', (snapshot) => {
    const val = snapshot.val();
    if (val !== null && val !== undefined) {
        dom.sysStatusValue.textContent = String(val).toUpperCase();
        flashValue(dom.sysStatusValue);

        const isOnline = (val === 'ONLINE' || val === 'ON' || val === 'ACTIVE' || val === true || val === 1);
        dom.sysIndicator.className = isOnline ? 'sys-indicator online' : 'sys-indicator offline';
    } else {
        dom.sysStatusValue.textContent = '--';
        dom.sysIndicator.className = 'sys-indicator';
    }
});

// === FAN STATUS (Hardware feedback) ===
refs.fanStatus.on('value', (snapshot) => {
    const val = snapshot.val();
    if (val !== null && val !== undefined) {
        const isOn = (String(val).toUpperCase() === 'ON');
        dom.fanHwStatus.textContent = isOn ? 'ON' : 'OFF';
        dom.fanHwStatus.className = 'fan-hw-status ' + (isOn ? 'on' : 'off');

        // Spin the fan visual
        if (isOn) {
            dom.fanBladeContainer.classList.add('spinning');
        } else {
            dom.fanBladeContainer.classList.remove('spinning');
        }
    } else {
        dom.fanHwStatus.textContent = '--';
        dom.fanHwStatus.className = 'fan-hw-status';
        dom.fanBladeContainer.classList.remove('spinning');
    }
});

// === FAN CONTROL (Read back what command was sent) ===
refs.controlFan.on('value', (snapshot) => {
    const val = snapshot.val();
    state.currentFanCmd = val;
    if (val !== null && val !== undefined) {
        const isOn = (String(val).toUpperCase() === 'ON');
        dom.fanCmdStatus.textContent = isOn ? 'ON' : 'OFF';
        dom.fanCmdStatus.className = 'fan-cmd-status ' + (isOn ? 'on' : 'off');

        // Highlight active button
        dom.fanOnBtn.classList.toggle('active', isOn);
        dom.fanOffBtn.classList.toggle('active', !isOn);
    } else {
        dom.fanCmdStatus.textContent = '--';
        dom.fanCmdStatus.className = 'fan-cmd-status';
        dom.fanOnBtn.classList.remove('active');
        dom.fanOffBtn.classList.remove('active');
    }
});

// === ALERT STATUS ===
refs.alertStatus.on('value', (snapshot) => {
    const val = snapshot.val();
    if (val !== null && val !== undefined) {
        const statusStr = String(val).toUpperCase();
        dom.alertStatusValue.textContent = statusStr;

        if (statusStr === 'THEFT DETECTED' || statusStr === 'ALERT' || statusStr === 'DANGER') {
            // Danger mode
            dom.alertBar.className = 'alert-bar alert-danger';
            dom.alertBarIcon.textContent = '🔴';
            dom.alertBarText.textContent = `⚠️ ${statusStr} — SECURITY BREACH DETECTED`;

            dom.sosRing.classList.add('danger');
            dom.sosRingText.textContent = 'ALERT';

            // Auto-trigger SOS overlay
            showSOSOverlay(statusStr);
        } else if (statusStr === 'SAFE' || statusStr === 'NORMAL' || statusStr === 'OK') {
            // Safe mode
            dom.alertBar.className = 'alert-bar alert-safe';
            dom.alertBarIcon.textContent = '🟢';
            dom.alertBarText.textContent = 'System Secure — All Sensors Normal';

            dom.sosRing.classList.remove('danger');
            dom.sosRingText.textContent = 'SAFE';
        } else {
            // Unknown status
            dom.alertBar.className = 'alert-bar alert-safe';
            dom.alertBarIcon.textContent = '🟡';
            dom.alertBarText.textContent = `Status: ${statusStr}`;

            dom.sosRing.classList.remove('danger');
            dom.sosRingText.textContent = statusStr;
        }
    } else {
        dom.alertStatusValue.textContent = '--';
        dom.alertBar.className = 'alert-bar alert-safe';
        dom.alertBarIcon.textContent = '⚪';
        dom.alertBarText.textContent = 'Awaiting status from hardware...';
    }
});

// === ALERT TIMESTAMP ===
refs.alertTimestamp.on('value', (snapshot) => {
    const val = snapshot.val();
    if (val !== null && val !== undefined) {
        dom.alertBarTime.textContent = String(val);
    } else {
        dom.alertBarTime.textContent = '';
    }
});

// === SOS ACTIVE ===
refs.sosActive.on('value', (snapshot) => {
    const val = snapshot.val();
    const isActive = (val === true || val === 'true' || val === 1 || val === '1');
    dom.sosActiveValue.textContent = isActive ? 'YES' : 'NO';

    if (isActive) {
        dom.sosRing.classList.add('danger');
        dom.sosRingText.textContent = 'SOS';
        showSOSOverlay('SOS EMERGENCY — ALERT ACTIVE');
    } else {
        // Only hide overlay if alert status is also not dangerous
        const alertText = dom.alertStatusValue.textContent;
        if (alertText !== 'THEFT DETECTED' && alertText !== 'ALERT' && alertText !== 'DANGER') {
            hideSOSOverlay();
            dom.sosRing.classList.remove('danger');
            dom.sosRingText.textContent = 'SAFE';
        }
    }
});

// === GPS ===
refs.gpsLat.on('value', (snapshot) => {
    const val = snapshot.val();
    state.gpsLat = val;
    if (val !== null && val !== undefined) {
        dom.gpsLat.textContent = parseFloat(val).toFixed(6);
        flashValue(dom.gpsLat);
    } else {
        dom.gpsLat.textContent = '--';
    }
    updateGPSMap();
});

refs.gpsLng.on('value', (snapshot) => {
    const val = snapshot.val();
    state.gpsLng = val;
    if (val !== null && val !== undefined) {
        dom.gpsLng.textContent = parseFloat(val).toFixed(6);
        flashValue(dom.gpsLng);
    } else {
        dom.gpsLng.textContent = '--';
    }
    updateGPSMap();
});

function updateGPSMap() {
    if (state.gpsLat !== null && state.gpsLng !== null &&
        state.gpsLat !== undefined && state.gpsLng !== undefined) {
        const lat = parseFloat(state.gpsLat);
        const lng = parseFloat(state.gpsLng);

        if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
            // Update map embed (OpenStreetMap — no API key needed)
            const embedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${lng-0.005},${lat-0.005},${lng+0.005},${lat+0.005}&layer=mapnik&marker=${lat},${lng}`;
            
            // Only update if URL actually changed to avoid iframe flicker
            if (dom.gpsMapFrame.src !== embedUrl) {
                dom.gpsMapFrame.src = embedUrl;
                dom.gpsMapFrame.classList.add('visible');
                dom.gpsMapPlaceholder.classList.add('hidden');
            }

            // Google Maps link
            dom.gpsOpenMaps.href = `https://www.google.com/maps?q=${lat},${lng}`;
            dom.gpsOpenMaps.style.pointerEvents = 'auto';
            dom.gpsOpenMaps.style.opacity = '1';
        }
    } else {
        dom.gpsMapFrame.classList.remove('visible');
        dom.gpsMapPlaceholder.classList.remove('hidden');
        dom.gpsOpenMaps.style.pointerEvents = 'none';
        dom.gpsOpenMaps.style.opacity = '0.5';
    }
}

// === SYSTEM MODE (Read back) ===
refs.controlSystemMode.on('value', (snapshot) => {
    const val = snapshot.val();
    if (val !== null && val !== undefined) {
        const mode = String(val).toUpperCase();
        dom.modeArmedBtn.classList.toggle('active-mode', mode === 'ARMED');
        dom.modeDisarmedBtn.classList.toggle('active-mode', mode === 'DISARMED');
    } else {
        dom.modeArmedBtn.classList.remove('active-mode');
        dom.modeDisarmedBtn.classList.remove('active-mode');
    }
});

// === SMS STATUS ===
refs.smsStatus.on('value', (snapshot) => {
    const val = snapshot.val();
    if (val !== null && val !== undefined) {
        const statusStr = String(val).toUpperCase();
        dom.smsStatus.textContent = statusStr;

        if (statusStr === 'SENT' || statusStr === 'DELIVERED' || statusStr === 'SUCCESS') {
            dom.smsStatus.className = 'sms-value sent';
        } else if (statusStr === 'FAILED' || statusStr === 'ERROR') {
            dom.smsStatus.className = 'sms-value failed';
        } else {
            dom.smsStatus.className = 'sms-value';
        }
    } else {
        dom.smsStatus.textContent = '--';
        dom.smsStatus.className = 'sms-value';
    }
});

refs.smsLastSent.on('value', (snapshot) => {
    const val = snapshot.val();
    if (val !== null && val !== undefined) {
        dom.smsLastSent.textContent = String(val);
    } else {
        dom.smsLastSent.textContent = '--';
    }
});

// ─── INITIAL STATE ──────────────────────────────────────────────────
// Disable Google Maps link initially
dom.gpsOpenMaps.style.pointerEvents = 'none';
dom.gpsOpenMaps.style.opacity = '0.5';

// Unlock audio on first user interaction (browsers require gesture)
document.body.addEventListener('click', () => {
    initAudioContext();
}, { once: true });

console.log('🛡️ Smart Transport Security Dashboard initialized.');
console.log('📡 Firebase listeners active — awaiting real-time data...');
