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
const uiFuelPitLap = document.getElementById("ui-fuel-pit-lap");
const uiFuelStintTimeRemain = document.getElementById("ui-fuel-stint-time-remain");
const uiFuelChartCanvas = document.getElementById("ui-fuel-chart-canvas");
const uiFuelChartEmpty = document.getElementById("ui-fuel-chart-empty");
const uiFuelNoData = document.getElementById("ui-fuel-no-data");
const uiCurrentLapTime = document.getElementById("ui-current-lap-time");
const uiBestLapTime = document.getElementById("ui-best-lap-time");
const uiCompletedLaps = document.getElementById("ui-completed-laps");
const uiSessionTime = document.getElementById("ui-session-time");
const uiDriverPosition = document.getElementById("ui-driver-position");
const uiDriverGap = document.getElementById("ui-driver-gap");
const uiDriverStintLaps = document.getElementById("ui-driver-stint-laps");
const uiAheadName = document.getElementById("ui-ahead-name");
const uiAheadInterval = document.getElementById("ui-ahead-interval");
const uiAheadGap = document.getElementById("ui-ahead-gap");
const uiAheadPace = document.getElementById("ui-ahead-pace");
const uiBehindName = document.getElementById("ui-behind-name");
const uiBehindInterval = document.getElementById("ui-behind-interval");
const uiBehindGap = document.getElementById("ui-behind-gap");
const uiBehindPace = document.getElementById("ui-behind-pace");
const uiSessionElapsed = document.getElementById("ui-session-elapsed");
const uiSessionTotal = document.getElementById("ui-session-total");

// Stint Planner Elements
const cardStintPlanner = document.getElementById("card-stint-planner");
const uiTimelineProgress = document.getElementById("ui-timeline-progress");
const uiTimelineCar = document.getElementById("ui-timeline-car");
const uiPitMarkers = document.getElementById("ui-pit-markers");
const uiStintCurrent = document.getElementById("ui-stint-current-lap");
const uiStintTotal = document.getElementById("ui-stint-total-laps");
const uiSplashBadge = document.getElementById("ui-splash-badge");
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

// New feature DOM refs
const cardDriverAverages = document.getElementById("card-driver-averages");
const uiDriverAveragesBody = document.getElementById("ui-driver-averages-body");
const cardTireStrategy = document.getElementById("card-tire-strategy");
const uiTireStrategySubtitle = document.getElementById("ui-tire-strategy-subtitle");
const uiTireBadges = document.getElementById("ui-tire-badges");
const uiTireFasterLabel = document.getElementById("ui-tire-faster-label");
const uiTireBarFill = document.getElementById("ui-tire-bar-fill");
const uiTireBarDry = document.getElementById("ui-tire-bar-dry");
const uiTireBarWet = document.getElementById("ui-tire-bar-wet");
const uiTireDryDelta = document.getElementById("ui-tire-dry-delta");
const uiTireWetDelta = document.getElementById("ui-tire-wet-delta");
const uiTireCrossover = document.getElementById("ui-tire-crossover");
const uiTireDryCount = document.getElementById("ui-tire-dry-count");
const uiTireWetCount = document.getElementById("ui-tire-wet-count");
const uiTireAvgDry = document.getElementById("ui-tire-avg-dry");
const uiTireAvgWet = document.getElementById("ui-tire-avg-wet");

// Gap trend tracking: driver name → array of {ts, gapRaw} (gap in seconds as a number)
const gapHistory = new Map();
const GAP_HISTORY_WINDOW_S = 120;
const GAP_TREND_THRESHOLD_S = 0.5; // change smaller than this = neutral

// App State
let app = null;
let db = null;
let roomRef = null;
let previousBestTime = null;
let stintChart = null;
let fuelChart = null;
let fuelHistory = [];          // per-lap consumption data points
let fuelChartSamples = [];     // parallel to chart data array (null for stint separators)
let stintCounter = 1;          // incremented on refuel
let lastFuelSampleKey = "";
let lastLapBoundaryState = null; // { liters, completedLaps } at last lap crossing
let stintStartLap = 0;          // absolute lap number at which current stint started
let lastFuelPayloadTimestampMs = 0; // wall-clock ms of the most recent payload.fuel received
let lastKnownAvgLapSeconds = 0;   // best available avg lap time for stint-time calculation
const FUEL_NO_DATA_TIMEOUT_MS = 60_000; // 1 min before showing "no fuel data" notice
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

    // Poll every 5 s to detect stale / absent fuel data
    setInterval(checkFuelDataFreshness, 5000);
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

    let lastSuccessfulDataTime = null;  // Track last time we received meaningful data
    const DATA_TIMEOUT_MS = 10000;       // Show "Waiting" if no data for 10 seconds

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
                    // Check if we have recent fuel data (the most important metric)
                    const hasFuel = data.fuel && isRecentData(data.fuel.timestamp);
                    const hasRecentData = hasFuel || 
                                         (data.timing && isRecentData(data.timing.timestamp)) ||
                                         (data.leaderboard && isRecentData(data.leaderboard.timestamp)) ||
                                         (data.playerStint && isRecentData(data.playerStint.timestamp));
                    
                    if (hasRecentData) {
                        updateDashboard(data);
                        lastSuccessfulDataTime = Date.now();

                        // Visual connection status
                        uiStatusDot.className = "status-dot connected";
                        
                        // Show more detailed status
                        let statusSuffix = "";
                        if (hasFuel && !data.timing) {
                            statusSuffix = " (fuel only)";
                        } else if (hasFuel && !data.leaderboard) {
                            statusSuffix = " (partial)";
                        }
                        
                        uiStatusText.textContent = `Live: ${formatRoomLabel(room)}${statusSuffix}`;
                        uiLastUpdate.textContent = `Last sync: ${new Date().toLocaleTimeString()}`;
                    } else if (lastSuccessfulDataTime && Date.now() - lastSuccessfulDataTime < DATA_TIMEOUT_MS) {
                        // Data exists but is stale - keep showing as connected for a grace period
                        uiStatusDot.className = "status-dot connected";
                        uiStatusText.textContent = `Live: ${formatRoomLabel(room)} (updating...)`;
                    } else {
                        // No recent data
                        uiStatusText.textContent = "Waiting for data...";
                        uiStatusDot.className = "status-dot disconnected";
                    }
                } catch (err) {
                    console.error("Dashboard Update Error:", err);
                    uiStatusText.textContent = "Data Error (Check Console)";
                    uiStatusDot.className = "status-dot disconnected";
                }
            } else {
                // No data at all
                uiStatusText.textContent = "Waiting for data...";
                uiStatusDot.className = "status-dot disconnected";
                lastSuccessfulDataTime = null;
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

/**
 * Check if a timestamp is recent (within 30 seconds).
 * Handles ISO strings and various date formats.
 */
function isRecentData(timestamp) {
    if (!timestamp) return false;
    try {
        const timestampMs = Date.parse(timestamp);
        if (!Number.isFinite(timestampMs)) return false;
        
        const ageMs = Date.now() - timestampMs;
        const RECENT_THRESHOLD_MS = 30000; // 30 seconds
        
        return ageMs >= 0 && ageMs < RECENT_THRESHOLD_MS;
    } catch {
        return false;
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

    if (payload.timing && payload.timing.position !== undefined) {
        uiDriverPosition.textContent = `P${payload.timing.position}`;
    }

    // Driver race KPIs — gap, interval ahead/behind with pace comparison, stint laps
    if (playerLeaderboardEntry) {
        const rows = getLeaderboardRows(payload?.leaderboard);
        const myPos = parseInt(playerLeaderboardEntry.p) || 0;
        const isLeader = myPos === 1;
        const myPace = parseLapTimeSeconds(playerLeaderboardEntry.a5);

        // Gap to leader
        uiDriverGap.textContent = isLeader ? "LEADER" : (playerLeaderboardEntry.g || "--");

        // Find car immediately ahead and behind in class (by position)
        const ahead = rows.find(r => (parseInt(r.p) || 0) === myPos - 1);
        const behind = rows.find(r => (parseInt(r.p) || 0) === myPos + 1);

        function renderRival(nameEl, intervalEl, gapEl, paceEl, rival, intervalValue, isBehind) {
            if (!rival) {
                nameEl.textContent = "--";
                intervalEl.textContent = "--";
                if (gapEl) gapEl.textContent = "--";
                paceEl.innerHTML = "";
                return;
            }
            nameEl.textContent = rival.n || `#${rival.c}` || "--";
            intervalEl.textContent = intervalValue || "--";
            if (gapEl) gapEl.textContent = rival.g || "--";

            const rivalPace = parseLapTimeSeconds(rival.a5);
            if (myPace && rivalPace) {
                const delta = rivalPace - myPace; // positive = rival is slower = we are faster
                const faster = delta > 0;
                const sign = delta >= 0 ? "+" : "-";
                const absDelta = Math.abs(delta);
                const badgeClass = faster ? "pace-faster" : "pace-slower";
                const desc = isBehind
                    ? (faster ? "they are slower" : "they are faster")
                    : (faster ? "we are faster" : "we are slower");
                paceEl.innerHTML =
                    `<span class="pace-badge ${badgeClass}">${sign}${absDelta.toFixed(2)}s</span>` +
                    `<span class="pace-badge-5l-label" title="Based on 5-lap average pace">${desc} · 5L avg</span>`;
            } else {
                paceEl.innerHTML = "";
            }
        }

        // Car ahead: interval is playerLeaderboardEntry.i (gap to car directly ahead)
        renderRival(uiAheadName, uiAheadInterval, uiAheadGap, uiAheadPace, ahead,
            isLeader ? "--" : (playerLeaderboardEntry.i || "--"), false);

        // Car behind: find their interval field (their i = gap to us)
        renderRival(uiBehindName, uiBehindInterval, uiBehindGap, uiBehindPace, behind,
            behind?.i || "--", true);

        uiDriverStintLaps.textContent = playerLeaderboardEntry.st ?? payload.playerStint?.currentStintLaps ?? "--";
    }

    if (payload.timing && payload.timing.sessionTime !== undefined && payload.timing.sessionTime !== null) {
        uiSessionTime.textContent = formatSessionTime(payload.timing.sessionTime);

        if (payload.timing.sessionTimeTotal !== undefined) {
            const tTotal = parseDurationSeconds(payload.timing.sessionTimeTotal) || 0;
            const tLeft = parseDurationSeconds(payload.timing.sessionTime) || 0;
            const timeElapsed = Math.max(0, tTotal - tLeft);
            uiSessionElapsed.textContent = formatSessionTime(timeElapsed);
            uiSessionTotal.textContent = formatSessionTime(tTotal);
        } else {
            uiSessionElapsed.textContent = "--:--:--";
            uiSessionTotal.textContent = "--:--:--";
        }
    }

    // Hoisted so the stint-time write below can also be gated by it.
    let fuelIsStale = false;

    // Fuel Box
    if (payload.fuel) {
        // Use the timestamp the C# plugin embedded at write time, not Date.now().
        // Firebase delivers the last-written value on every connect, so using Date.now()
        // would reset the staleness clock even when the payload is hours old.
        const fuelWriteTs = payload.fuel.timestamp ? new Date(payload.fuel.timestamp).getTime() : 0;
        lastFuelPayloadTimestampMs = fuelWriteTs > 0 ? fuelWriteTs : Date.now();
        const connectedLive = roomRef && uiStatusDot.classList.contains("connected");
        fuelIsStale = connectedLive && (Date.now() - lastFuelPayloadTimestampMs > FUEL_NO_DATA_TIMEOUT_MS);
        checkFuelDataFreshness(); // show/hide the notice and blank KPIs if stale

        // Only write KPI values when data is actually fresh — checkFuelDataFreshness()
        // just blanked them to "--"; overwriting with stale values causes visible flicker.
        if (!fuelIsStale) {
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

                // Collect all upcoming pit stops to identify the last one (S&D)
                const pitStops = [];
                while (nextPitLap < totalLaps && markerCount < 10) {
                    pitStops.push((nextPitLap / totalLaps) * 100);
                    if (tankSizeLaps > 0) {
                        nextPitLap += tankSizeLaps;
                    } else {
                        break;
                    }
                    markerCount++;
                }

                // Compute Splash & Dash laps: laps remaining in race at the last pit stop
                if (uiSplashBadge) {
                    if (pitStops.length > 0) {
                        const lastPitLap = (pitStops[pitStops.length - 1] / 100) * totalLaps;
                        const splashLaps = Math.max(0, Math.ceil(totalLaps - lastPitLap));
                        const splashFuel = tankSizeLaps > 0
                            ? Math.min(
                                parseFloat(payload.fuel.maxLiters || 0),
                                Math.max(0, splashLaps * parseFloat(payload.fuel.fuelPerLap || 0))
                              )
                            : 0;
                        const fuelStr = splashFuel > 0 ? ` · ${splashFuel.toFixed(1)} L` : "";
                        uiSplashBadge.textContent = `S&D: ${splashLaps} lap${splashLaps !== 1 ? "s" : ""}${fuelStr}`;
                        uiSplashBadge.style.display = "inline-flex";
                    } else {
                        uiSplashBadge.style.display = "none";
                    }
                }

                // Render markers — the last one is highlighted as the Splash & Dash stop
                pitStops.forEach((pct, idx) => {
                    const isSplash = idx === pitStops.length - 1;
                    const cls = isSplash ? "pit-marker pit-marker-splash" : "pit-marker";
                    uiPitMarkers.innerHTML += `<div class="${cls}" style="left: ${pct}%"></div>`;
                });
            }
        } else {
            cardStintPlanner.style.display = "none";
        }
    }

    renderPlayerStintChart(payload.playerStint, payload.timing?.driverName || uiDriverName.textContent);

    // Update best-available avg lap seconds for stint-time calculation.
    // Prefer a locally-computed outlier-filtered mean from the raw lapTimes array
    // so that out-laps / safety-car laps / in-laps don't inflate the estimate.
    const rawLapTimes = Array.isArray(payload.playerStint?.lapTimes)
        ? payload.playerStint.lapTimes
            .map(p => Number(p?.seconds))
            .filter(s => Number.isFinite(s) && s > 0)
        : [];
    const filteredAvg = filteredLapAverage(rawLapTimes, 5, 0.07); // last 5, max +7 % vs window best
    const stintL5     = toPositiveNumber(payload.playerStint?.last5LapAverageSeconds);
    const stintAvg    = toPositiveNumber(payload.playerStint?.averageLapSeconds);
    const lastLapS    = parseLapTimeSeconds(payload.timing?.lastLapTime);
    // Priority: filtered local > plugin-side 5L avg > stint avg > last lap
    const avgCandidate = filteredAvg || stintL5 || stintAvg || lastLapS || 0;
    if (avgCandidate > 0) lastKnownAvgLapSeconds = avgCandidate;

    // Stint time remaining = laps remaining × avg lap time.
    // Guard with fuelIsStale to prevent overwriting the "--" that checkFuelDataFreshness() set.
    if (!fuelIsStale && uiFuelStintTimeRemain) {
        const lapsRem = parseFloat(payload.fuel?.lapsRemaining || 0);
        if (lapsRem > 0 && lastKnownAvgLapSeconds > 0) {
            uiFuelStintTimeRemain.textContent = formatStintDuration(lapsRem * lastKnownAvgLapSeconds);
        } else if (payload.fuel) {
            uiFuelStintTimeRemain.textContent = "--";
        }
    }

    // Leaderboard
    updateTimingHeaders(isDeltaMode);
    const leaderboardRows = payload.leaderboard ? (payload.leaderboard.leaderboard || payload.leaderboard) : null;
    if (leaderboardRows) {
        updateGapHistory(leaderboardRows);
        renderLeaderboard(leaderboardRows, { isDeltaMode });
        renderDriverAverages(leaderboardRows);
    }

    renderTireStrategy(payload.tireStrategy);
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

/**
 * Shows/hides the "no fuel data" notice based on how long ago fuel was last received.
 * Only shows after FUEL_NO_DATA_TIMEOUT_MS ms *and* only once we have ever connected
 * (i.e., the room is live but the driver simply isn't sharing fuel).
 */
function checkFuelDataFreshness() {
    if (!uiFuelNoData) return;
    const connectedLive = roomRef && uiStatusDot.classList.contains("connected");
    const noRecentFuel = connectedLive && (Date.now() - lastFuelPayloadTimestampMs > FUEL_NO_DATA_TIMEOUT_MS);
    uiFuelNoData.style.display = noRecentFuel ? "flex" : "none";

    // Blank out stale fuel KPIs so observers don't mistake old values for live data
    if (noRecentFuel) {
        uiFuelLiters.textContent = "--";
        uiFuelBar.style.width = "0%";
        uiFuelBar.style.background = "linear-gradient(90deg, rgba(255,255,255,0.12), rgba(255,255,255,0.05))";
        uiFuelBar.style.boxShadow = "none";
        uiFuelPerLap.textContent = "--";
        uiFuelLapsRemain.textContent = "--";
        if (uiFuelPitLap) uiFuelPitLap.textContent = "--";
        if (uiFuelStintTimeRemain) uiFuelStintTimeRemain.textContent = "--";
    }
}

function updateFuelHistory(payload) {
    const fuelPayload = payload?.fuel;
    if (!fuelPayload) return;

    const liters = Number(fuelPayload.currentLiters);
    if (!Number.isFinite(liters)) return;

    const completedLaps = Number(payload?.timing?.completedLaps || 0);
    const timestamp = fuelPayload.timestamp || payload?.timing?.timestamp || new Date().toISOString();
    const sampleKey = `${timestamp}|${completedLaps}|${liters.toFixed(3)}`;

    if (sampleKey === lastFuelSampleKey) return;
    lastFuelSampleKey = sampleKey;

    // Detect refuel (liters jumped up) or lap counter reset — start a new stint
    const isRefuel = lastLapBoundaryState !== null && liters > lastLapBoundaryState.liters + 1.25;
    const isLapReset = lastLapBoundaryState !== null && completedLaps < lastLapBoundaryState.completedLaps;

    if (isRefuel || isLapReset) {
        stintCounter++;
        stintStartLap = completedLaps;
        lastLapBoundaryState = { liters, completedLaps };
        return; // need two boundary samples before we can compute consumption
    }

    // Bootstrap state on first sample ever
    if (lastLapBoundaryState === null) {
        lastLapBoundaryState = { liters, completedLaps };
        stintStartLap = completedLaps;
        return;
    }

    // When a new completed lap is seen, record per-lap consumption
    const newLap = Math.floor(completedLaps);
    const prevLap = Math.floor(lastLapBoundaryState.completedLaps);

    if (newLap > prevLap) {
        const lapsDelta = newLap - prevLap;
        const consumed = lastLapBoundaryState.liters - liters;
        if (consumed > 0 && lapsDelta > 0) {
            const consumedPerLap = consumed / lapsDelta;
            for (let l = prevLap + 1; l <= newLap; l++) {
                const lapWithinStint = l - stintStartLap;
                fuelHistory.push({
                    stintIndex: stintCounter,
                    absoluteLap: l,
                    lapWithinStint,
                    consumed: consumedPerLap,
                    liters: lastLapBoundaryState.liters - consumedPerLap * (l - prevLap),
                    label: `S${stintCounter}-L${lapWithinStint}`
                });
            }
        }
        lastLapBoundaryState = { liters, completedLaps };
    }

    // Cap history to avoid memory bloat (~500 laps is more than enough)
    if (fuelHistory.length > 500) {
        fuelHistory = fuelHistory.slice(-500);
    }
}

/**
 * Linear regression over [{x, y}] points.
 * Returns { slope, intercept } or null if degenerate.
 */
function linearRegression(points) {
    const n = points.length;
    if (n < 2) return null;
    const sumX  = points.reduce((s, p) => s + p.x, 0);
    const sumY  = points.reduce((s, p) => s + p.y, 0);
    const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
    const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
    const denom = n * sumX2 - sumX * sumX;
    if (Math.abs(denom) < 1e-10) return null;
    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;
    return { slope, intercept };
}

function renderFuelChart() {
    if (!uiFuelChartCanvas || !uiFuelChartEmpty) return;

    // Only show current stint, and only samples that carry a fuel level
    const currentStint = fuelHistory.filter(s => s.stintIndex === stintCounter && s.liters != null);

    if (currentStint.length < 1) {
        uiFuelChartEmpty.style.display = "flex";
        if (fuelChart) {
            fuelChart.data.datasets.forEach(ds => { ds.data = []; });
            fuelChart.update("none");
        }
        if (uiFuelPitLap) uiFuelPitLap.textContent = "--";
        return;
    }

    uiFuelChartEmpty.style.display = "none";
    ensureFuelChart();
    if (!fuelChart) return;

    // Dataset 0: actual fuel level per completed lap  {x: lap, y: liters}
    const actualData = currentStint.map(s => ({ x: s.absoluteLap, y: s.liters }));

    // Linear regression from the last 5 samples (or fewer)
    const regSamples = currentStint.slice(-5);
    const reg = linearRegression(regSamples.map(s => ({ x: s.absoluteLap, y: s.liters })));

    let forecastData = [];
    let pitMarkerData = [];
    let pitLap = null;

    if (reg && reg.slope < 0) {
        // x-intercept: when fuel hits 0
        pitLap = -reg.intercept / reg.slope;

        // Forecast line anchors at start of the regression window
        const forecastStartLap = regSamples[0].absoluteLap;
        const forecastStartY = reg.slope * forecastStartLap + reg.intercept;
        forecastData = [
            { x: forecastStartLap, y: Math.max(0, forecastStartY) },
            { x: pitLap,           y: 0 }
        ];
        pitMarkerData = [{ x: pitLap, y: 0 }];
    }

    if (uiFuelPitLap) {
        uiFuelPitLap.textContent = pitLap !== null ? `L${Math.ceil(pitLap)}` : "--";
    }

    // Axis bounds
    const lapMin  = currentStint[0].absoluteLap;
    const lapMax  = pitLap !== null
        ? Math.ceil(pitLap) + 1
        : currentStint[currentStint.length - 1].absoluteLap + 3;
    const litersTop = currentStint.reduce((max, s) => Math.max(max, s.liters), 0);

    fuelChart.data.datasets[0].data = actualData;
    fuelChart.data.datasets[1].data = forecastData;
    fuelChart.data.datasets[2].data = pitMarkerData;

    fuelChart.options.scales.x.min = Math.max(0, lapMin - 0.5);
    fuelChart.options.scales.x.max = lapMax;
    fuelChart.options.scales.y.max = Math.ceil(litersTop * 1.12);

    // Footer in tooltip: laps remaining until predicted stop
    const pitLapForFooter = pitLap;
    fuelChart.options.plugins.tooltip.callbacks.footer = pitLapForFooter !== null
        ? (items) => {
            const x = items[0]?.parsed?.x;
            if (x == null) return "";
            const lapsLeft = Math.max(0, pitLapForFooter - x).toFixed(1);
            return `\u25CF  Pit in ~${lapsLeft} laps  (L${Math.ceil(pitLapForFooter)})`;
          }
        : undefined;

    fuelChart.update();

    // Show the inline legend once real data is present
    const legendEl = document.getElementById("ui-fuel-chart-legend");
    if (legendEl) legendEl.style.display = "flex";
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
    // Use outlier-filtered mean for 5L Avg so out-laps / SC laps don't skew the display.
    // Falls back to the plugin-side pre-computed value when fewer than 2 clean laps exist.
    const rawSeconds = lapTimes.map(p => p.seconds);
    const last5LapAverageSeconds =
        filteredLapAverage(rawSeconds, 5, 0.07) ||
        toPositiveNumber(stintPayload?.last5LapAverageSeconds);
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
    if (fuelChart || !uiFuelChartCanvas) return;

    fuelChart = new Chart(uiFuelChartCanvas, {
        type: "line",
        data: {
            datasets: [
                // 0 — Actual fuel level for the current stint
                {
                    label: "Fuel Level",
                    data: [],
                    fill: true,
                    tension: 0.3,
                    borderWidth: 2.6,
                    borderColor: "rgba(48, 209, 88, 0.96)",
                    backgroundColor: (context) => createChartGradient(
                        context.chart,
                        "rgba(48, 209, 88, 0.30)",
                        "rgba(48, 209, 88, 0.02)"
                    ),
                    pointRadius: 3.5,
                    pointHoverRadius: 6,
                    pointHitRadius: 16,
                    pointBorderColor: "rgba(48, 209, 88, 0.96)",
                    pointBackgroundColor: "rgba(13, 17, 23, 0.9)",
                    pointHoverBorderWidth: 2,
                    pointHoverBorderColor: "rgba(255, 255, 255, 0.92)",
                    pointHoverBackgroundColor: "rgba(48, 209, 88, 1)"
                },
                // 1 — Linear regression forecast (dashed orange, no fill)
                {
                    label: "Forecast",
                    data: [],
                    fill: false,
                    tension: 0,
                    borderWidth: 2,
                    borderColor: "rgba(255, 159, 64, 0.85)",
                    borderDash: [8, 5],
                    backgroundColor: "transparent",
                    pointRadius: 0,
                    pointHoverRadius: 0
                },
                // 2 — Predicted pit stop marker (red dot at y=0)
                {
                    label: "Pit Stop",
                    data: [],
                    fill: false,
                    tension: 0,
                    borderWidth: 2,
                    backgroundColor: "rgba(255, 69, 58, 0.18)",
                    borderColor: "rgba(255, 69, 58, 0.95)",
                    pointStyle: "circle",
                    pointRadius: 7,
                    pointHoverRadius: 9,
                    pointBorderWidth: 2,
                    pointBorderColor: "rgba(255, 69, 58, 1)",
                    pointBackgroundColor: "rgba(255, 69, 58, 0.18)"
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 300, easing: "easeOutQuart" },
            interaction: { mode: "nearest", intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: "rgba(10, 14, 20, 0.94)",
                    borderColor: "rgba(255, 255, 255, 0.12)",
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false,
                    titleColor: "#ffffff",
                    bodyColor: "#d7dee7",
                    footerColor: "rgba(255, 159, 64, 0.9)",
                    footerFont: { family: "Inter, sans-serif", size: 11, style: "normal" },
                    footerMarginTop: 8,
                    titleFont: { family: "Inter, sans-serif", weight: "600", size: 12 },
                    bodyFont:  { family: "Inter, sans-serif", size: 12 },
                    filter: (item) => item.datasetIndex !== 2 && item.parsed.y !== null,
                    callbacks: {
                        title: (items) => {
                            const x = items[0]?.parsed?.x;
                            return x != null ? `Lap ${Math.round(x)}` : "";
                        },
                        label: (context) => {
                            const y = context.parsed.y;
                            if (y === null || y === undefined) return "";
                            if (context.datasetIndex === 0) return `Fuel: ${y.toFixed(1)} L`;
                            if (context.datasetIndex === 1) return `Forecast: ${Math.max(0, y).toFixed(1)} L`;
                            return "";
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: "linear",
                    border: { display: false },
                    grid: { color: "rgba(255, 255, 255, 0.06)", drawBorder: false },
                    ticks: {
                        color: "rgba(156, 163, 175, 0.7)",
                        maxTicksLimit: 8,
                        padding: 8,
                        font: { family: "Inter, sans-serif", size: 11 },
                        callback: (value) => `L${Math.round(value)}`
                    }
                },
                y: {
                    min: 0,
                    border: { display: false },
                    grid: { color: "rgba(255, 255, 255, 0.06)", drawBorder: false },
                    ticks: {
                        color: "rgba(156, 163, 175, 0.7)",
                        maxTicksLimit: 5,
                        padding: 10,
                        font: { family: "Inter, sans-serif", size: 11 },
                        callback: (value) => `${Number(value).toFixed(0)}L`
                    }
                }
            }
        }
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

/**
 * Formats a sector time sent as total seconds (e.g. "73.15") into
 * a human-readable string: "42.15" if under 60 s, or "1:13.15" if over.
 */
function formatSectorTime(value) {
    if (!value && value !== 0) return '';
    const total = parseFloat(value);
    if (!Number.isFinite(total) || total <= 0) return '';
    if (total < 60) {
        return total.toFixed(2);
    }
    const mins = Math.floor(total / 60);
    const secs = (total % 60).toFixed(2).padStart(5, '0');
    return `${mins}:${secs}`;
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

/**
 * Computes an outlier-filtered mean from the last `windowSize` lap times.
 * Any lap slower than (windowMin * (1 + maxOutlierRatio)) is discarded.
 * Returns 0 if fewer than 2 clean laps remain.
 *
 * @param {number[]} allLapSeconds  - array of lap times in seconds, chronological
 * @param {number}   windowSize     - how many of the most-recent laps to consider (default 5)
 * @param {number}   maxOutlierRatio - fraction above window-best to tolerate (e.g. 0.07 = 7 %)
 */
function filteredLapAverage(allLapSeconds, windowSize = 5, maxOutlierRatio = 0.07) {
    if (!Array.isArray(allLapSeconds) || allLapSeconds.length < 2) return 0;
    const window = allLapSeconds.slice(-windowSize);
    const windowBest = Math.min(...window);
    const threshold  = windowBest * (1 + maxOutlierRatio);
    const clean = window.filter(s => s <= threshold);
    if (clean.length < 1) return 0;
    return clean.reduce((sum, s) => sum + s, 0) / clean.length;
}

/**
 * Formats a duration in seconds to a compact H:MM:SS or MM:SS string.
 */
function formatStintDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "--";
    const totalS = Math.round(seconds);
    const h = Math.floor(totalS / 3600);
    const m = Math.floor((totalS % 3600) / 60);
    const s = totalS % 60;
    if (h > 0) {
        return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
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

/**
 * Records the latest gap value for each driver and prunes stale entries.
 * @param {Array} rows - leaderboard row array
 */
function updateGapHistory(rows) {
    const now = Date.now();
    const arr = Array.isArray(rows) ? rows : Object.values(rows);
    arr.forEach(s => {
        const key = s.n || s.c || String(s.p);
        if (!key) return;
        const gapRaw = parseGapSeconds(s.g);
        if (gapRaw === null) return;
        if (!gapHistory.has(key)) gapHistory.set(key, []);
        const hist = gapHistory.get(key);
        hist.push({ ts: now, gap: gapRaw, pos: s.p });
        // prune old entries
        const cutoff = now - GAP_HISTORY_WINDOW_S * 1000;
        while (hist.length > 1 && hist[0].ts < cutoff) hist.shift();
    });
}

/**
 * Parses a gap string like "+5.123" or "1L" or "-" into seconds.
 * Returns null when the gap cannot be parsed (leader, lapped, etc.).
 */
function parseGapSeconds(gapStr) {
    if (!gapStr || gapStr === "-" || gapStr === "" || String(gapStr).includes("L")) return null;
    const n = parseFloat(String(gapStr).replace("+", ""));
    return isNaN(n) ? null : n;
}

/**
 * Returns a trend object for the named driver: { dir: 'up'|'down'|'neutral', delta }
 * 'up' = gap decreasing (gaining on leader), 'down' = gap growing (falling back).
 */
function getGapTrend(driverKey) {
    const hist = gapHistory.get(driverKey);
    if (!hist || hist.length < 2) return { dir: 'neutral', delta: 0 };
    const oldest = hist[0];
    const newest = hist[hist.length - 1];
    const delta = newest.gap - oldest.gap; // positive = gap grew = losing
    if (Math.abs(delta) < GAP_TREND_THRESHOLD_S) return { dir: 'neutral', delta };
    return { dir: delta < 0 ? 'up' : 'down', delta };
}

function renderLeaderboard(leaderboardArr, options = {}) {
    const isDeltaMode = options.isDeltaMode === true;

    // Firebase may return arrays as objects with string keys if indices are non-sequential
    const arrayData = getLeaderboardRows(leaderboardArr);

    if (!arrayData || arrayData.length === 0) {
        uiTimingTbody.innerHTML = `<tr><td colspan="13" style="text-align: center; color: var(--text-secondary);">No live timing data available.</td></tr>`;
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

        // Gap trend arrow
        const driverKey = s.n || s.c || String(s.p);
        const trend = getGapTrend(driverKey);
        let trendHtml;
        if (s.p === 1 || s.p === "1") {
            trendHtml = `<span class="trend-neutral">P1</span>`;
        } else if (trend.dir === 'up') {
            trendHtml = `<span class="trend-up" title="Gap closing ${Math.abs(trend.delta).toFixed(1)}s">&#8593;</span>`;
        } else if (trend.dir === 'down') {
            trendHtml = `<span class="trend-down" title="Gap growing ${Math.abs(trend.delta).toFixed(1)}s">&#8595;</span>`;
        } else {
            trendHtml = `<span class="trend-neutral">&mdash;</span>`;
        }

        html += `<tr class="${rowClasses.join(" ")}" style="position: relative;">
            <td style="font-weight: bold; position: relative;">${classColorBar}<span style="margin-left:8px;">${s.p || '-'}</span></td>
            <td style="font-family: monospace; color: var(--text-secondary);">${s.c || '-'}</td>
            <td style="font-weight: 600;">${s.n || 'Unknown'}</td>
            <td style="font-family: monospace;">${gapDisplay}</td>
            <td style="font-family: monospace; color: var(--text-secondary);">${intervalDisplay}</td>
            <td style="text-align: center;">${trendHtml}</td>
            <td style="font-family: monospace;">${formatLapDisplay(s.l)}</td>
            <td style="font-family: monospace; color: var(--text-secondary);">${formatLapDisplay(s.a5)}</td>
            <td style="font-family: monospace; color: var(--text-secondary);">${formatLapDisplay(s.b)}</td>
            <td style="font-family: monospace; font-size: 0.85rem;">${formatSectorTime(s.s1)}</td>
            <td style="font-family: monospace; font-size: 0.85rem;">${formatSectorTime(s.s2)}</td>
            <td style="font-family: monospace; font-size: 0.85rem;">${formatSectorTime(s.s3)}</td>
            <td>${pitText}</td>
        </tr>`;
    });

    uiTimingTbody.innerHTML = html;
}

/**
 * Renders the Driver Pace Comparison card.
 * Shows each driver's 5-lap avg deviation from the class average as a bar.
 */
function renderDriverAverages(leaderboardPayload) {
    const rows = getLeaderboardRows(leaderboardPayload);
    if (!rows || rows.length < 2) {
        if (cardDriverAverages) cardDriverAverages.style.display = 'none';
        return;
    }

    // Parse 5-lap averages as seconds
    const parsed = rows.map(s => {
        const rawA5 = s.a5;
        const secs = parseLapToSeconds(rawA5);
        return { name: s.n || `#${s.c}`, secs, isPlayer: s.me === true || s.me === 1 };
    }).filter(d => d.secs !== null && d.secs > 0);

    if (parsed.length < 2) {
        if (cardDriverAverages) cardDriverAverages.style.display = 'none';
        return;
    }

    const avg = parsed.reduce((sum, d) => sum + d.secs, 0) / parsed.length;
    const maxDeviation = Math.max(...parsed.map(d => Math.abs(d.secs - avg)), 0.001);
    const barMaxPct = 100; // max bar fills its entire half at max deviation

    let html = `<div class="driver-avg-section-header">5-Lap Avg — All Drivers Avg: ${formatSecondsToLap(avg)}</div>`;
    parsed.forEach(d => {
        const dev = d.secs - avg; // positive = slower, negative = faster
        const pct = Math.min(barMaxPct, (Math.abs(dev) / maxDeviation) * barMaxPct);
        const isFaster = dev < 0;
        const devSign = dev > 0 ? '+' : '';
        const devStr = `${devSign}${dev.toFixed(3)}s`;
        const nameClass = d.isPlayer ? 'driver-avg-name is-player' : 'driver-avg-name';
        const leftFill  = isFaster ? `<div class="driver-avg-fill faster" style="width: ${pct}%"></div>` : '';
        const rightFill = !isFaster ? `<div class="driver-avg-fill slower" style="width: ${pct}%"></div>` : '';
        html += `
        <div class="driver-avg-row">
            <div class="${nameClass}" title="${d.name}">${d.name}</div>
            <div class="driver-avg-track">
                <div class="driver-avg-half left-half">${leftFill}</div>
                <div class="driver-avg-center-line"></div>
                <div class="driver-avg-half right-half">${rightFill}</div>
            </div>
            <div class="driver-avg-value">${devStr}</div>
        </div>`;
    });

    if (uiDriverAveragesBody) uiDriverAveragesBody.innerHTML = html;
    if (cardDriverAverages) cardDriverAverages.style.display = 'flex';
}

/**
 * Parses a lap time string "M:SS.mmm" or seconds number into seconds.
 * Returns null on failure.
 */
function parseLapToSeconds(value) {
    if (!value || value === '--:--.--' || value === '') return null;
    if (typeof value === 'number') return value > 0 ? value : null;
    const s = String(value).trim();
    const colonIdx = s.indexOf(':');
    if (colonIdx !== -1) {
        const mins = parseFloat(s.substring(0, colonIdx));
        const secs = parseFloat(s.substring(colonIdx + 1));
        if (isNaN(mins) || isNaN(secs)) return null;
        return mins * 60 + secs;
    }
    const n = parseFloat(s);
    return isNaN(n) || n <= 0 ? null : n;
}

/** Formats a seconds value to "M:SS.mmm" */
function formatSecondsToLap(secs) {
    if (!secs || secs <= 0) return '--:--.--';
    const m = Math.floor(secs / 60);
    const s = secs - m * 60;
    return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}

/**
 * Renders the Mixed Conditions Tire Strategy card.
 * @param {object|null} payload - tireStrategy node from Firebase
 */
function renderTireStrategy(payload) {
    if (!payload || (payload.dryCount === 0 && payload.wetCount === 0)) {
        if (cardTireStrategy) cardTireStrategy.style.display = 'none';
        return;
    }

    const dryDelta = parseFloat(payload.dryDelta ?? -1);
    const wetDelta = parseFloat(payload.wetDelta ?? -1);
    const dryCount = payload.dryCount || 0;
    const wetCount = payload.wetCount || 0;
    const avgDry = parseFloat(payload.avgDryDelta ?? -1);
    const avgWet = parseFloat(payload.avgWetDelta ?? -1);
    const crossover = payload.crossoverTime || '--';

    // Determine which compound is faster
    // dryDelta = time lost vs fastest if on dry (0 when dry IS fastest)
    // wetDelta = time lost vs fastest if on wet (0 when wet IS fastest)
    const dryIsFaster = wetDelta > 0 && dryDelta <= wetDelta;
    const advantageSecs = Math.abs(dryDelta - wetDelta);
    const totalDrivers = dryCount + wetCount;

    // Badge row
    if (uiTireBadges) {
        const fasterClass = dryIsFaster ? 'faster-dry' : 'faster-wet';
        const fasterLabel = dryIsFaster ? 'DRY faster' : 'WET faster';
        uiTireBadges.innerHTML =
            `<span class="tire-compound-badge ${fasterClass}">${fasterLabel}</span>` +
            `<span class="tire-compound-badge dry">${dryCount} on DRY</span>` +
            `<span class="tire-compound-badge wet">${wetCount} on WET</span>`;
    }

    // Advantage bar: fill is centered, extends left for dry advantage, right for wet
    // We use left% + width%: center = 50%, bar extends toward faster side
    const maxBarPct = 48;
    const fillPct = totalDrivers > 0 ? Math.min(maxBarPct, (advantageSecs / Math.max(advantageSecs, 3)) * maxBarPct) : 0;
    if (uiTireBarFill) {
        if (dryIsFaster) {
            // bar extends from center toward left (dry side)
            uiTireBarFill.style.left = `${50 - fillPct}%`;
            uiTireBarFill.style.width = `${fillPct}%`;
            uiTireBarFill.style.backgroundColor = '#4fc3f7'; // blue = dry
        } else {
            // bar extends from center toward right (wet side)
            uiTireBarFill.style.left = '50%';
            uiTireBarFill.style.width = `${fillPct}%`;
            uiTireBarFill.style.backgroundColor = '#81d4fa'; // teal = wet
        }
    }

    // Delta labels
    const fmtDelta = v => v < 0 ? 'N/A' : `${v > 0 ? '+' : ''}${v.toFixed(3)}s`;
    if (uiTireDryDelta) uiTireDryDelta.textContent = dryDelta > 0 ? `+${dryDelta.toFixed(3)}s` : '';
    if (uiTireWetDelta) uiTireWetDelta.textContent = wetDelta > 0 ? `+${wetDelta.toFixed(3)}s` : '';
    if (uiTireFasterLabel) {
        uiTireFasterLabel.textContent = dryIsFaster
            ? `DRY tires ${advantageSecs.toFixed(3)}s faster per lap`
            : `WET tires ${advantageSecs.toFixed(3)}s faster per lap`;
    }

    // Stats
    if (uiTireCrossover) uiTireCrossover.textContent = crossover;
    if (uiTireDryCount) uiTireDryCount.textContent = dryCount;
    if (uiTireWetCount) uiTireWetCount.textContent = wetCount;
    if (uiTireAvgDry) uiTireAvgDry.textContent = fmtDelta(avgDry);
    if (uiTireAvgWet) uiTireAvgWet.textContent = fmtDelta(avgWet);

    if (cardTireStrategy) cardTireStrategy.style.display = 'flex';
}

// Startup
document.addEventListener("DOMContentLoaded", init);
