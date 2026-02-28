import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

// DOM Elements
const overlay = document.getElementById("setup-overlay");
const inputDbUrl = document.getElementById("db-url");
const inputApiKey = document.getElementById("api-key");
const inputSheetUrl = document.getElementById("sheet-url");
const inputRoomId = document.getElementById("input-room-id");
const btnConnect = document.getElementById("btn-connect");

const uiStatusDot = document.querySelector(".status-dot");
const uiStatusText = document.querySelector(".status-text");
const uiLastUpdate = document.getElementById("ui-last-update");

// Data UI Elements
const uiDriverName = document.getElementById("ui-driver-name");
const uiCarId = document.getElementById("ui-car-id");
const uiFuelLiters = document.getElementById("ui-fuel-liters");
const uiFuelBar = document.getElementById("ui-fuel-bar");
const uiFuelPerLap = document.getElementById("ui-fuel-per-lap");
const uiFuelLapsRemain = document.getElementById("ui-fuel-laps-remain");
const uiCurrentLapTime = document.getElementById("ui-current-lap-time");
const uiBestLapTime = document.getElementById("ui-best-lap-time");
const uiCompletedLaps = document.getElementById("ui-completed-laps");
const uiSessionTime = document.getElementById("ui-session-time");

// Stint Planner Elements
const cardStintPlanner = document.getElementById("card-stint-planner");
const uiTimelineProgress = document.getElementById("ui-timeline-progress");
const uiTimelineCar = document.getElementById("ui-timeline-car");
const uiPitMarkers = document.getElementById("ui-pit-markers");
const uiStintCurrent = document.getElementById("ui-stint-current-lap");
const uiStintTotal = document.getElementById("ui-stint-total-laps");

// Strategy Grid Elements
const cardStrategyGrid = document.getElementById("card-strategy-grid");
const uiStrategyTbody = document.getElementById("ui-strategy-tbody");
const uiStrategyStatus = document.getElementById("ui-strategy-status");
let googleSheetStints = [];
let currentTelemetryLap = 0;

// App State
let app = null;
let db = null;
let roomRef = null;
let previousBestTime = null;

// Initialize from URL Params
const urlParams = new URLSearchParams(window.location.search);
const pDbUrl = urlParams.get('dbUrl');
const pApiKey = urlParams.get('apiKey');
const pRoom = urlParams.get('room');
const pSheet = urlParams.get('sheet');

function init() {
    if (pDbUrl) inputDbUrl.value = pDbUrl;
    if (pApiKey) inputApiKey.value = pApiKey;
    if (pSheet) inputSheetUrl.value = pSheet;
    if (pRoom) inputRoomId.value = pRoom;

    // Load CSV if provided
    if (pSheet) {
        fetchStrategyCSV(pSheet);
    }

    if (pDbUrl && pApiKey && pRoom) {
        connectToFirebase(pDbUrl, pApiKey, pRoom);
    } else {
        // Show overlay if credentials are missing
        overlay.classList.remove("hidden");
    }
}

// Connect Button Event
btnConnect.addEventListener("click", () => {
    const db = inputDbUrl.value.trim();
    const key = inputApiKey.value.trim();
    const room = inputRoomId.value.trim();
    const sheet = inputSheetUrl.value.trim();

    if (!db || !key || !room) {
        alert("Please provide the Database URL, API Key, and Room ID.");
        return;
    }

    // Build URL to reload with parameters so it can be bookmarked
    let newUrl = `${window.location.pathname}?dbUrl=${encodeURIComponent(db)}&apiKey=${encodeURIComponent(key)}&room=${encodeURIComponent(room)}`;
    if (sheet) {
        newUrl += `&sheet=${encodeURIComponent(sheet)}`;
    }
    window.location.href = newUrl;
});

function connectToFirebase(dbUrl, apiKey, room) {
    uiStatusText.textContent = "Connecting...";

    // Normalize DB URL explicitly for Firebase RTDB
    // Some regions require databaseURL to be exact, so we pass it in the config
    const firebaseConfig = {
        apiKey: apiKey,
        databaseURL: dbUrl.endsWith('/') ? dbUrl.slice(0, -1) : dbUrl
    };

    try {
        app = initializeApp(firebaseConfig);
        db = getDatabase(app);
        roomRef = ref(db, `rooms/${room}`);

        // Listen for Realtime Updates
        onValue(roomRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                updateDashboard(data);

                // Visual connection status
                uiStatusDot.className = "status-dot connected";
                uiStatusText.textContent = `Live: Room ${room}`;
                uiLastUpdate.textContent = `Last sync: ${new Date().toLocaleTimeString()}`;
            } else {
                uiStatusText.textContent = "Waiting for data...";
                uiStatusDot.className = "status-dot disconnected";
            }
        }, (error) => {
            console.error("Firebase Read Error:", error);
            uiStatusText.textContent = "Connection Error";
            uiStatusDot.className = "status-dot disconnected";
        });
    } catch (e) {
        console.error("Firebase Init Error:", e);
        alert("Found invalid configuration parameters. Please verify your DB URL and API key.");
        overlay.classList.remove("hidden");
    }
}

function updateDashboard(payload) {
    // Top Level
    uiDriverName.textContent = payload.driverName || "Unknown";
    uiCarId.textContent = payload.carId || "--";
    uiSessionTime.textContent = payload.sessionTime || "--:--:--";

    // Fuel Box
    if (payload.fuel) {
        const liters = parseFloat(payload.fuel.currentLiters || 0);
        const max = parseFloat(payload.fuel.maxLiters || 1);
        const pct = payload.fuel.currentPercentage || (liters / max) * 100;

        uiFuelLiters.textContent = liters.toFixed(1);
        uiFuelBar.style.width = `${Math.min(100, Math.max(0, pct))}%`;

        uiFuelPerLap.textContent = parseFloat(payload.fuel.fuelPerLap || 0).toFixed(2);
        uiFuelLapsRemain.textContent = parseFloat(payload.fuel.lapsRemaining || 0).toFixed(1);

        // Color warnings based on fuel percentage
        if (pct < 10) {
            uiFuelBar.style.background = "linear-gradient(90deg, #ff3b30, #ff6961)";
            uiFuelBar.style.boxShadow = "0 0 10px rgba(255, 59, 48, 0.5)";
        } else if (pct < 25) {
            uiFuelBar.style.background = "linear-gradient(90deg, #ffcc00, #ffdb4d)";
            uiFuelBar.style.boxShadow = "0 0 10px rgba(255, 204, 0, 0.5)";
        } else {
            uiFuelBar.style.background = "linear-gradient(90deg, #0a84ff, #5e5ce6)";
            uiFuelBar.style.boxShadow = "0 0 10px rgba(10, 132, 255, 0.5)";
        }
    }

    // Timing
    if (payload.timing) {
        uiCurrentLapTime.textContent = payload.timing.currentLapTime || "--:--.---";
        uiCompletedLaps.textContent = payload.timing.completedLaps || "0";
        currentTelemetryLap = parseFloat(payload.timing.completedLaps || 0);
        renderStrategyGrid();

        const bestTime = payload.timing.bestLapTime || "--:--.---";
        uiBestLapTime.textContent = bestTime;

        // Flash animation when a new personal best is delivered
        if (previousBestTime && bestTime !== previousBestTime && bestTime !== "--:--.---") {
            const card = uiBestLapTime.closest('.kpi-box');
            card.classList.remove("update-flash-best");
            void card.offsetWidth; // trigger reflow
            card.classList.add("update-flash-best");
        }
        previousBestTime = bestTime;

        // Stint Planner timeline rendering
        if (payload.timing.totalLaps > 0) {
            cardStintPlanner.style.display = "flex";

            const completed = parseFloat(payload.timing.completedLaps || 0);
            const trackPct = parseFloat(payload.timing.trackPositionPercent || 0);
            const totalLaps = parseFloat(payload.timing.totalLaps);

            const exactCurrentLap = Math.min(totalLaps, completed + Math.min(1, Math.max(0, trackPct)));
            const progressPct = (exactCurrentLap / totalLaps) * 100;

            uiTimelineProgress.style.width = `${progressPct}%`;
            uiTimelineCar.style.left = `${Math.min(100, progressPct)}%`;

            uiStintCurrent.textContent = Math.floor(exactCurrentLap);
            uiStintTotal.textContent = Math.ceil(totalLaps);

            // Calculate predicted pit stops
            uiPitMarkers.innerHTML = "";
            if (payload.fuel && payload.fuel.lapsRemaining > 0) {
                let nextPitLap = exactCurrentLap + parseFloat(payload.fuel.lapsRemaining);
                let markerCount = 0;
                let tankSizeLaps = 0;

                if (payload.fuel.maxLiters > 0 && payload.fuel.fuelPerLap > 0) {
                    tankSizeLaps = payload.fuel.maxLiters / payload.fuel.fuelPerLap;
                }

                // Show markers for upcoming stops within the race limit
                while (nextPitLap < totalLaps && markerCount < 10) {
                    const markerPct = (nextPitLap / totalLaps) * 100;
                    uiPitMarkers.innerHTML += `<div class="pit-marker" style="left: ${markerPct}%"></div>`;

                    if (tankSizeLaps > 0) {
                        nextPitLap += tankSizeLaps;
                    } else {
                        break;
                    }
                    markerCount++;
                }
            }
        } else {
            cardStintPlanner.style.display = "none";
        }
    }
}

// Strategy Grid Logic
async function fetchStrategyCSV(url) {
    try {
        uiStrategyStatus.textContent = "Loading...";
        uiStrategyStatus.style.color = "var(--text-secondary)";
        cardStrategyGrid.style.display = "flex";

        const response = await fetch(url);
        if (!response.ok) throw new Error("Failed to fetch CSV");

        const csvText = await response.text();
        const rows = csvText.split('\n');

        // Skip header row
        googleSheetStints = [];
        for (let i = 1; i < rows.length; i++) {
            const cols = rows[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
            if (cols.length >= 6 && cols[0] !== "") {
                googleSheetStints.push({
                    stintId: cols[0],
                    driver: cols[1],
                    targetLaps: parseInt(cols[2]) || 0,
                    pace: cols[3],
                    tires: cols[4],
                    fuelAdd: cols[5],
                    notes: cols[6] || ""
                });
            }
        }

        uiStrategyStatus.textContent = "Live Linked";
        uiStrategyStatus.style.color = "var(--accent-green)";
        renderStrategyGrid();

    } catch (e) {
        console.error("CSV Fetch Error:", e);
        uiStrategyStatus.textContent = "Sync Error";
        uiStrategyStatus.style.color = "var(--accent-red)";
    }
}

function renderStrategyGrid() {
    if (googleSheetStints.length === 0) {
        uiStrategyTbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-secondary);">No valid stints found in the spreadsheet.</td></tr>`;
        return;
    }

    // Determine active stint based on telemetry laps
    let accumulatedLaps = 0;
    let activeStintIndex = -1;

    for (let i = 0; i < googleSheetStints.length; i++) {
        accumulatedLaps += googleSheetStints[i].targetLaps;
        if (currentTelemetryLap < accumulatedLaps && activeStintIndex === -1) {
            activeStintIndex = i;
        }
    }

    // If race finished or laps exceed plan
    if (activeStintIndex === -1) activeStintIndex = googleSheetStints.length - 1;

    let html = "";
    googleSheetStints.forEach((s, idx) => {
        let rowClass = "";
        let statusIcon = "";

        if (idx < activeStintIndex) {
            rowClass = "stint-completed";
            statusIcon = "✓ ";
        } else if (idx === activeStintIndex) {
            rowClass = "stint-active";
            statusIcon = "▶ ";
        }

        html += `<tr class="${rowClass}">
            <td>${statusIcon}Stint ${s.stintId}</td>
            <td style="font-weight: 600;">${s.driver}</td>
            <td style="font-family: monospace;">${s.targetLaps} LAPS</td>
            <td style="font-family: monospace; color: var(--text-secondary);">${s.pace}</td>
            <td><span class="pill-badge pill-${s.tires.toLowerCase() === 'new' ? 'green' : 'gray'}">${s.tires}</span></td>
            <td><span class="pill-badge pill-blue">${s.fuelAdd}</span></td>
            <td style="font-size: 0.8rem; color: var(--text-secondary);">${s.notes}</td>
        </tr>`;
    });

    uiStrategyTbody.innerHTML = html;
}

// Startup
document.addEventListener("DOMContentLoaded", init);
