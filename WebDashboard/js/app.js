import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";
import {
    Chart,
    CategoryScale,
    Filler,
    LineController,
    LineElement,
    LinearScale,
    PointElement,
    Tooltip
} from "https://cdn.jsdelivr.net/npm/chart.js@4.4.7/+esm";

Chart.register(
    CategoryScale,
    Filler,
    LineController,
    LineElement,
    LinearScale,
    PointElement,
    Tooltip
);

// DOM Elements
const overlay = document.getElementById("setup-overlay");
const inputDbUrl = document.getElementById("db-url");
const inputApiKey = document.getElementById("api-key");
const inputSheetUrl = document.getElementById("sheet-url");
const inputRoomId = document.getElementById("input-room-id");
const btnConnect = document.getElementById("btn-connect");

const uiConnectionStatus = document.getElementById("connection-status");
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
const uiFuelChartCanvas = document.getElementById("ui-fuel-chart-canvas");
const uiFuelChartEmpty = document.getElementById("ui-fuel-chart-empty");
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
const cardStintChart = document.getElementById("card-stint-chart");
const uiStintChartDriver = document.getElementById("ui-stint-chart-driver");
const uiStintChartCanvas = document.getElementById("ui-stint-chart-canvas");
const uiStintChartEmpty = document.getElementById("ui-stint-chart-empty");
const uiStintAverage = document.getElementById("ui-stint-average");
const uiStintBest = document.getElementById("ui-stint-best");
const uiStintLast5 = document.getElementById("ui-stint-last-5");
const uiStintLapCount = document.getElementById("ui-stint-lap-count");

// Strategy Grid Elements
const cardStrategyGrid = document.getElementById("card-strategy-grid");
const uiStrategyTbody = document.getElementById("ui-strategy-tbody");
const uiStrategyStatus = document.getElementById("ui-strategy-status");
let googleSheetStints = [];
let currentTelemetryLap = 0;

// Tab & Timing Elements
const tabBtnStrategy = document.getElementById("tab-btn-strategy");
const tabBtnTiming = document.getElementById("tab-btn-timing");
const viewStrategy = document.getElementById("view-strategy");
const viewTiming = document.getElementById("view-timing");
const uiTimingTbody = document.getElementById("ui-timing-tbody");
const uiTimingGapHeader = document.getElementById("ui-timing-gap-header");
const uiTimingIntHeader = document.getElementById("ui-timing-int-header");

// App State
let app = null;
let db = null;
let roomRef = null;
let previousBestTime = null;
let stintChart = null;
let fuelChart = null;
let fuelHistory = [];
let lastFuelSampleKey = "";
const LAP_TIME_PLACEHOLDER = "--:--.--";

// Default Firebase Configuration
const DEFAULT_DB_URL = "https://scheitelpunkt-telemetry-default-rtdb.europe-west1.firebasedatabase.app/";
const DEFAULT_API_KEY = "AIzaSyDcSBc62j_tRGhAS1oygmoUpS1NZmRt_sg";

// Initialize from URL Params
const urlParams = new URLSearchParams(window.location.search);
const pDbUrl = urlParams.get('dbUrl') || DEFAULT_DB_URL;
const pApiKey = urlParams.get('apiKey') || DEFAULT_API_KEY;
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
        overlay.classList.add("hidden");
        connectToFirebase(pDbUrl, pApiKey, pRoom);
    } else {
        // Show overlay if credentials are missing
        overlay.classList.remove("hidden");
    }
}

// Connect Button Event
btnConnect.addEventListener("click", () => {
    const db = inputDbUrl.value.trim() || DEFAULT_DB_URL;
    const key = inputApiKey.value.trim() || DEFAULT_API_KEY;
    const room = inputRoomId.value.trim();
    const sheet = inputSheetUrl.value.trim();

    if (!room) {
        alert("Please provide the Room ID.");
        return;
    }

    // Build URL to reload with parameters so it can be bookmarked
    let newUrl = `${window.location.pathname}?room=${encodeURIComponent(room)}`;

    if (db !== DEFAULT_DB_URL) {
        newUrl += `&dbUrl=${encodeURIComponent(db)}`;
    }
    if (key !== DEFAULT_API_KEY) {
        newUrl += `&apiKey=${encodeURIComponent(key)}`;
    }

    if (sheet) {
        newUrl += `&sheet=${encodeURIComponent(sheet)}`;
    }
    window.location.href = newUrl;
});

// Tab Switching Logic
tabBtnStrategy.addEventListener("click", () => {
    tabBtnStrategy.classList.add("active");
    tabBtnTiming.classList.remove("active");
    viewStrategy.style.display = "block";
    viewTiming.style.display = "none";
});

tabBtnTiming.addEventListener("click", () => {
    tabBtnTiming.classList.add("active");
    tabBtnStrategy.classList.remove("active");
    viewTiming.style.display = "block";
    viewStrategy.style.display = "none";
});

function connectToFirebase(dbUrl, apiKey, room) {
    uiStatusText.textContent = "Connecting...";
    if (uiConnectionStatus) {
        uiConnectionStatus.title = room;
    }

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
            console.log("Firebase Data Received:", data);
            if (data) {
                try {
                    updateDashboard(data);

                    // Visual connection status
                    uiStatusDot.className = "status-dot connected";
                    uiStatusText.textContent = `Live: ${formatRoomLabel(room)}`;
                    uiLastUpdate.textContent = `Last sync: ${new Date().toLocaleTimeString()}`;
                } catch (err) {
                    console.error("Dashboard Update Error:", err);
                    uiStatusText.textContent = "Data Error (Check Console)";
                    uiStatusDot.className = "status-dot disconnected";
                }
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
    const playerLeaderboardEntry = getPlayerLeaderboardEntry(payload);
    const isDeltaMode = shouldUseDeltaToBestMode(payload?.timing?.sessionTypeName);

    // Top Level
    if (payload.timing && payload.timing.driverName) {
        uiDriverName.textContent = payload.timing.driverName;
    }

    if (payload.fuel && payload.fuel.carId) {
        uiCarId.textContent = payload.fuel.carId;
    }

    if (payload.timing && payload.timing.sessionTime !== undefined && payload.timing.sessionTime !== null) {
        uiSessionTime.textContent = formatSessionTime(payload.timing.sessionTime);
    }

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

        updateFuelHistory(payload);
        renderFuelChart();
    }

    // Timing
    if (payload.timing) {
        uiCurrentLapTime.textContent = formatLapDisplay(
            payload.timing.lastLapTime ?? playerLeaderboardEntry?.l
        );
        uiCompletedLaps.textContent = payload.timing.completedLaps || "0";
        currentTelemetryLap = parseFloat(payload.timing.completedLaps || 0);
        renderStrategyGrid();

        const bestTime = formatLapDisplay(payload.timing.bestLapTime ?? playerLeaderboardEntry?.b);
        uiBestLapTime.textContent = bestTime;

        // Flash animation when a new personal best is delivered
        if (previousBestTime && bestTime !== previousBestTime && bestTime !== LAP_TIME_PLACEHOLDER) {
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

    renderPlayerStintChart(payload.playerStint, payload.timing?.driverName || uiDriverName.textContent);

    // Leaderboard
    updateTimingHeaders(isDeltaMode);
    if (payload.leaderboard) {
        renderLeaderboard(payload.leaderboard.leaderboard || payload.leaderboard, { isDeltaMode });
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

function updateFuelHistory(payload) {
    const fuelPayload = payload?.fuel;
    if (!fuelPayload) {
        return;
    }

    const liters = Number(fuelPayload.currentLiters);
    if (!Number.isFinite(liters)) {
        return;
    }

    const completedLaps = Number(payload?.timing?.completedLaps || 0);
    const trackPositionPercent = Math.min(1, Math.max(0, Number(payload?.timing?.trackPositionPercent || 0)));
    const timestamp = fuelPayload.timestamp || payload?.timing?.timestamp || new Date().toISOString();
    const sampleKey = `${timestamp}|${completedLaps}|${trackPositionPercent.toFixed(3)}|${liters.toFixed(3)}`;

    if (sampleKey === lastFuelSampleKey) {
        return;
    }

    if (fuelHistory.length > 0) {
        const previousSample = fuelHistory[fuelHistory.length - 1];
        const isReset = completedLaps < previousSample.completedLaps || liters > previousSample.liters + 1.25;
        if (isReset) {
            fuelHistory = [];
        }
    }

    fuelHistory.push({
        label: formatSampleTime(timestamp),
        timeLabel: formatSampleTime(timestamp),
        liters,
        completedLaps,
        lapDisplay: completedLaps + trackPositionPercent
    });

    if (fuelHistory.length > 72) {
        fuelHistory = fuelHistory.slice(-72);
    }

    lastFuelSampleKey = sampleKey;
}

function renderFuelChart() {
    if (!uiFuelChartCanvas || !uiFuelChartEmpty) {
        return;
    }

    if (fuelHistory.length < 2) {
        uiFuelChartEmpty.style.display = "flex";
        if (fuelChart) {
            fuelChart.data.labels = [];
            fuelChart.data.datasets[0].data = [];
            fuelChart.update("none");
        }
        return;
    }

    uiFuelChartEmpty.style.display = "none";
    ensureFuelChart();
    if (!fuelChart) {
        return;
    }

    const labels = fuelHistory.map(sample => sample.label);
    const liters = fuelHistory.map(sample => sample.liters);
    const minValue = Math.min(...liters);
    const maxValue = Math.max(...liters);
    const span = Math.max(0.75, maxValue - minValue);

    fuelChart.data.labels = labels;
    fuelChart.data.datasets[0].data = liters;
    fuelChart.options.scales.y.suggestedMin = Math.max(0, minValue - span * 0.18);
    fuelChart.options.scales.y.suggestedMax = maxValue + span * 0.18;
    fuelChart.update();
}

function renderPlayerStintChart(stintPayload, fallbackDriverName = "") {
    const hasContext = Boolean(stintPayload || fallbackDriverName);
    if (!hasContext) {
        cardStintChart.style.display = "none";
        return;
    }

    cardStintChart.style.display = "flex";
    uiStintChartDriver.textContent = stintPayload?.driverName || fallbackDriverName || "Player car";

    const lapTimes = Array.isArray(stintPayload?.lapTimes)
        ? stintPayload.lapTimes
            .map(point => ({
                lap: Number(point?.lap),
                seconds: Number(point?.seconds)
            }))
            .filter(point => Number.isFinite(point.lap) && point.lap >= 0 && Number.isFinite(point.seconds) && point.seconds > 0)
        : [];

    const averageLapSeconds = toPositiveNumber(stintPayload?.averageLapSeconds) || calculateAverageSeconds(lapTimes);
    const last5LapAverageSeconds = toPositiveNumber(stintPayload?.last5LapAverageSeconds);
    const bestLapSeconds = lapTimes.length > 0 ? Math.min(...lapTimes.map(point => point.seconds)) : 0;
    const currentStintLaps = Number.isFinite(Number(stintPayload?.currentStintLaps))
        ? Number(stintPayload.currentStintLaps)
        : lapTimes.length;

    uiStintAverage.textContent = formatLapTime(averageLapSeconds);
    uiStintBest.textContent = formatLapTime(bestLapSeconds);
    uiStintLast5.textContent = formatLapTime(last5LapAverageSeconds);
    uiStintLapCount.textContent = String(Math.max(currentStintLaps, lapTimes.length, 0));

    if (lapTimes.length === 0) {
        uiStintChartEmpty.style.display = "flex";
        if (stintChart) {
            stintChart.data.labels = [];
            stintChart.data.datasets[0].data = [];
            stintChart.data.datasets[1].data = [];
            stintChart.update("none");
        }
        return;
    }

    uiStintChartEmpty.style.display = "none";
    ensureStintChart();
    if (!stintChart) {
        return;
    }

    const labels = lapTimes.map(point => `L${point.lap}`);
    const values = lapTimes.map(point => point.seconds);
    const minValue = Math.min(...values, averageLapSeconds);
    const maxValue = Math.max(...values, averageLapSeconds);
    const span = Math.max(0.35, maxValue - minValue);

    stintChart.data.labels = labels;
    stintChart.data.datasets[0].data = values;
    stintChart.data.datasets[1].data = values.map(() => averageLapSeconds);
    stintChart.options.scales.y.suggestedMin = Math.max(0, minValue - span * 0.2);
    stintChart.options.scales.y.suggestedMax = maxValue + span * 0.2;
    stintChart.update();
}

function ensureStintChart() {
    if (stintChart || !uiStintChartCanvas) {
        return;
    }

    stintChart = new Chart(uiStintChartCanvas, {
        type: "line",
        data: {
            labels: [],
            datasets: [
                createPrimaryLineDataset({
                    label: "Lap Time",
                    startColor: "rgba(118, 214, 255, 0.38)",
                    endColor: "rgba(10, 132, 255, 0.02)",
                    borderColor: "rgba(118, 214, 255, 0.98)"
                }),
                {
                    label: "Average",
                    data: [],
                    borderColor: "rgba(255, 255, 255, 0.72)",
                    borderWidth: 1.5,
                    borderDash: [7, 6],
                    pointRadius: 0,
                    pointHoverRadius: 0,
                    fill: false,
                    tension: 0
                }
            ]
        },
        options: buildAppleLineOptions({
            maxXAxisTicks: 6,
            yTickFormatter: (value) => formatLapTime(Number(value)),
            tooltipTitle: (items) => items[0]?.label || "",
            tooltipLabel: (context) => context.datasetIndex === 0
                ? `Lap time ${formatLapTime(context.parsed.y)}`
                : `Stint avg ${formatLapTime(context.parsed.y)}`
        })
    });
}

function ensureFuelChart() {
    if (fuelChart || !uiFuelChartCanvas) {
        return;
    }

    fuelChart = new Chart(uiFuelChartCanvas, {
        type: "line",
        data: {
            labels: [],
            datasets: [
                createPrimaryLineDataset({
                    label: "Fuel",
                    startColor: "rgba(76, 217, 100, 0.32)",
                    endColor: "rgba(52, 199, 89, 0.03)",
                    borderColor: "rgba(95, 229, 120, 0.96)"
                })
            ]
        },
        options: buildAppleLineOptions({
            maxXAxisTicks: 4,
            yTickFormatter: (value) => `${Number(value).toFixed(1)}L`,
            tooltipTitle: (items) => {
                const sample = fuelHistory[items[0]?.dataIndex ?? -1];
                return sample?.timeLabel || items[0]?.label || "Fuel";
            },
            tooltipLabel: (context) => {
                const sample = fuelHistory[context.dataIndex];
                if (!sample) {
                    return `${context.parsed.y.toFixed(1)} L`;
                }

                return `${context.parsed.y.toFixed(1)} L at lap ${sample.lapDisplay.toFixed(2)}`;
            }
        })
    });
}

function createPrimaryLineDataset({ label, startColor, endColor, borderColor }) {
    return {
        label,
        data: [],
        fill: true,
        tension: 0.38,
        borderWidth: 2.6,
        borderColor,
        backgroundColor: (context) => createChartGradient(context.chart, startColor, endColor),
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHitRadius: 16,
        pointHoverBorderWidth: 2,
        pointHoverBorderColor: "rgba(255, 255, 255, 0.92)",
        pointHoverBackgroundColor: borderColor
    };
}

function buildAppleLineOptions({ maxXAxisTicks, yTickFormatter, tooltipTitle, tooltipLabel }) {
    const theme = getChartTheme();

    return {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
            duration: 280,
            easing: "easeOutQuart"
        },
        interaction: {
            mode: "index",
            intersect: false
        },
        plugins: {
            legend: {
                display: false
            },
            tooltip: {
                backgroundColor: "rgba(10, 14, 20, 0.94)",
                borderColor: "rgba(255, 255, 255, 0.12)",
                borderWidth: 1,
                padding: 12,
                displayColors: false,
                titleColor: "#ffffff",
                bodyColor: "#d7dee7",
                titleFont: {
                    family: theme.fontFamily,
                    weight: "600",
                    size: 12
                },
                bodyFont: {
                    family: theme.fontFamily,
                    size: 12
                },
                callbacks: {
                    title: tooltipTitle,
                    label: tooltipLabel
                }
            }
        },
        scales: {
            x: {
                border: {
                    display: false
                },
                grid: {
                    display: false,
                    drawBorder: false
                },
                ticks: {
                    color: theme.axisColor,
                    autoSkip: true,
                    maxTicksLimit: maxXAxisTicks,
                    maxRotation: 0,
                    padding: 8,
                    font: {
                        family: theme.fontFamily,
                        size: 11
                    }
                }
            },
            y: {
                border: {
                    display: false
                },
                grid: {
                    color: theme.gridColor,
                    drawBorder: false
                },
                ticks: {
                    color: theme.axisColor,
                    maxTicksLimit: 5,
                    padding: 10,
                    font: {
                        family: theme.fontFamily,
                        size: 11
                    },
                    callback: (value) => yTickFormatter(value)
                }
            }
        }
    };
}

function getChartTheme() {
    const styles = getComputedStyle(document.documentElement);

    return {
        fontFamily: styles.getPropertyValue("--font-family").trim() || "Inter, sans-serif",
        axisColor: styles.getPropertyValue("--chart-axis").trim() || "rgba(156, 163, 175, 0.7)",
        gridColor: styles.getPropertyValue("--chart-grid").trim() || "rgba(255, 255, 255, 0.08)"
    };
}

function createChartGradient(chart, startColor, endColor) {
    const { ctx, chartArea } = chart;
    if (!chartArea) {
        return endColor;
    }

    const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    gradient.addColorStop(0, startColor);
    gradient.addColorStop(1, endColor);
    return gradient;
}

function formatRoomLabel(room) {
    const match = String(room || "").match(/(?:^|_)(team|user)_(\d+)$/i);
    if (match) {
        const label = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
        return `${label} ${match[2]}`;
    }

    const roomText = String(room || "").trim();
    if (!roomText) {
        return "Room";
    }

    const segments = roomText.split("_");
    return `Room ${segments[segments.length - 1] || roomText}`;
}

function formatSessionTime(rawValue) {
    const seconds = parseDurationSeconds(rawValue);
    if (seconds === null) {
        return rawValue ? String(rawValue) : "--";
    }

    const totalMinutes = Math.max(0, Math.floor(seconds / 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function getLeaderboardRows(leaderboardPayload) {
    const leaderboard = leaderboardPayload?.leaderboard || leaderboardPayload;
    if (!leaderboard) {
        return [];
    }

    return Array.isArray(leaderboard) ? leaderboard : Object.values(leaderboard);
}

function getPlayerLeaderboardEntry(payload) {
    const rows = getLeaderboardRows(payload?.leaderboard);
    if (rows.length === 0) {
        return null;
    }

    const ownTeamRow = rows.find(row => row?.me === true || row?.me === 1);
    if (ownTeamRow) {
        return ownTeamRow;
    }

    const driverName = String(payload?.timing?.driverName || payload?.playerStint?.driverName || "")
        .trim()
        .toLowerCase();

    if (!driverName) {
        return null;
    }

    return rows.find(row => String(row?.n || "").trim().toLowerCase() === driverName) || null;
}

function parseDurationSeconds(value) {
    if (value === undefined || value === null || value === "") {
        return null;
    }

    if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
    }

    const text = String(value).trim();
    if (!text) {
        return null;
    }

    const numericValue = Number(text);
    if (Number.isFinite(numericValue)) {
        return numericValue;
    }

    let days = 0;
    let timeText = text;
    const dayMatch = text.match(/^(\d+)\.(.+)$/);
    if (dayMatch && dayMatch[2].includes(":")) {
        days = Number(dayMatch[1]) * 24 * 60 * 60;
        timeText = dayMatch[2];
    }

    const parts = timeText.split(":");
    if (parts.length === 2) {
        const minutes = Number(parts[0]);
        const seconds = Number(parts[1]);
        return Number.isFinite(minutes) && Number.isFinite(seconds)
            ? days + minutes * 60 + seconds
            : null;
    }

    if (parts.length === 3) {
        const hours = Number(parts[0]);
        const minutes = Number(parts[1]);
        const seconds = Number(parts[2]);
        return Number.isFinite(hours) && Number.isFinite(minutes) && Number.isFinite(seconds)
            ? days + hours * 60 * 60 + minutes * 60 + seconds
            : null;
    }

    return null;
}

function parseLapTimeSeconds(value) {
    if (value === undefined || value === null || value === "") {
        return null;
    }

    if (typeof value === "number") {
        return Number.isFinite(value) && value > 0 ? value : null;
    }

    const text = String(value).trim();
    if (!text) {
        return null;
    }

    const parsed = parseDurationSeconds(text);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatLapDisplay(value) {
    const seconds = parseLapTimeSeconds(value);
    return seconds === null ? LAP_TIME_PLACEHOLDER : formatLapTime(seconds);
}

function formatDeltaToBestDisplay(value) {
    if (value === undefined || value === null || value === "") {
        return "-";
    }

    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
        return "-";
    }

    if (numericValue <= 0) {
        return "0.000";
    }

    return `+${numericValue.toFixed(3)}`;
}

function formatLapTime(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) {
        return LAP_TIME_PLACEHOLDER;
    }

    const totalCentiseconds = Math.round(seconds * 100);
    const totalSeconds = Math.floor(totalCentiseconds / 100);
    const minutes = Math.floor(totalSeconds / 60);
    const secondsPart = totalSeconds % 60;
    const centiseconds = totalCentiseconds % 100;
    return `${String(minutes).padStart(2, "0")}:${String(secondsPart).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
}

function formatSampleTime(value) {
    const timestamp = new Date(value);
    if (Number.isNaN(timestamp.getTime())) {
        return String(value || "--");
    }

    return timestamp.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
    });
}

function calculateAverageSeconds(lapTimes) {
    if (!Array.isArray(lapTimes) || lapTimes.length === 0) {
        return 0;
    }

    const total = lapTimes.reduce((sum, point) => sum + point.seconds, 0);
    return total / lapTimes.length;
}

function toPositiveNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function shouldUseDeltaToBestMode(sessionTypeName) {
    const sessionText = String(sessionTypeName || "").trim().toLowerCase();
    if (!sessionText) {
        return false;
    }

    return sessionText.includes("practice") || sessionText.includes("qual");
}

function updateTimingHeaders(isDeltaMode) {
    if (uiTimingGapHeader) {
        uiTimingGapHeader.textContent = isDeltaMode ? "Delta" : "Gap";
    }

    if (uiTimingIntHeader) {
        uiTimingIntHeader.textContent = isDeltaMode ? "" : "Int";
    }
}

function renderLeaderboard(leaderboardArr, options = {}) {
    const isDeltaMode = options.isDeltaMode === true;

    // Firebase may return arrays as objects with string keys if indices are non-sequential
    const arrayData = getLeaderboardRows(leaderboardArr);

    if (!arrayData || arrayData.length === 0) {
        uiTimingTbody.innerHTML = `<tr><td colspan="12" style="text-align: center; color: var(--text-secondary);">No live timing data available.</td></tr>`;
        return;
    }

    let html = "";
    arrayData.forEach(s => {
        // Pit badge
        const rowClasses = [];
        if (s.pit === 1) {
            rowClasses.push("row-in-pit");
        }
        if (s.me === true || s.me === 1) {
            rowClasses.push("row-own-team");
        }

        let pitText = s.pit === 1 ? `<span class="pill-badge pill-gray">PIT</span>` : (s.st || "0");
        const gapDisplay = isDeltaMode ? formatDeltaToBestDisplay(s.d) : (s.g || "-");
        const intervalDisplay = isDeltaMode ? "" : (s.i || "-");

        let classColorBar = s.cl ? `<div style="width: 4px; height: 100%; position: absolute; left: 0; top: 0; background-color: ${s.cl}"></div>` : '';

        html += `<tr class="${rowClasses.join(" ")}" style="position: relative;">
            <td style="font-weight: bold; position: relative;">${classColorBar}<span style="margin-left:8px;">${s.p || '-'}</span></td>
            <td style="font-family: monospace; color: var(--text-secondary);">${s.c || '-'}</td>
            <td style="font-weight: 600;">${s.n || 'Unknown'}</td>
            <td style="font-family: monospace;">${gapDisplay}</td>
            <td style="font-family: monospace; color: var(--text-secondary);">${intervalDisplay}</td>
            <td style="font-family: monospace;">${formatLapDisplay(s.l)}</td>
            <td style="font-family: monospace; color: var(--text-secondary);">${formatLapDisplay(s.a5)}</td>
            <td style="font-family: monospace; color: var(--text-secondary);">${formatLapDisplay(s.b)}</td>
            <td style="font-family: monospace; font-size: 0.85rem;">${s.s1 || ''}</td>
            <td style="font-family: monospace; font-size: 0.85rem;">${s.s2 || ''}</td>
            <td style="font-family: monospace; font-size: 0.85rem;">${s.s3 || ''}</td>
            <td>${pitText}</td>
        </tr>`;
    });

    uiTimingTbody.innerHTML = html;
}

// Startup
document.addEventListener("DOMContentLoaded", init);
