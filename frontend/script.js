// ============================================
// DETEKSI KEMACETAN OSM
// Integrasi Overpass API untuk data real-time
// ============================================

// ========== KONFIGURASI ==========
const CONFIG = window.appConfig || {
  debug: true,
  useOSM: true,
  maxZoom: 19,
  defaultLocation: {
    lat: -6.2088,
    lng: 106.8456,
  },
  overpassApi: "https://overpass-api.de/api/interpreter",
  nominatimApi: "https://nominatim.openstreetmap.org/search",
  trafficUpdateInterval: 30000, // 30 detik
  maxTrafficPoints: 50,
};

// Backend URL - update this if backend runs on different port/host
const BACKEND_URL = window.BACKEND_URL || 'http://localhost:5000';

// ========== DEBUG FUNCTIONS ==========
function debugLog(...args) {
  if (CONFIG.debug) console.log("[TrafficOSM]", ...args);
}

function debugError(...args) {
  if (CONFIG.debug) console.error("[TrafficOSM ERROR]", ...args);
}

// ========== APP STATE ==========
let appState = {
  map: null,
  geocoder: null,
  routingControl: null,
  markers: [],
  trafficLayer: null,
  incidentsLayer: null,
  userMarker: null,
  searchMarker: null,

  currentLocation: null,
  theme: "light",
  reports: [],
  locations: [],
  incidents: [],
  trafficData: [],

  mapInitialized: false,
  trafficLayerActive: false,
  routeCalculating: false,

  isLoading: false,
  lastUpdate: null,
  apiStatus: "unknown",

  currentRoute: null,
  searchResults: [],
};

// ========== DATA SIMULASI ==========
const trafficData = {
  travelTimes: [
    "12 menit",
    "25 menit",
    "36 menit",
    "45 menit",
    "52 menit",
    "68 menit",
    "85 menit",
    "102 menit",
  ],
  conditions: [
    { text: "Lancar", color: "#06d6a0", level: "low", speed: "≥ 40 km/h" },
    { text: "Sedang", color: "#ffd166", level: "medium", speed: "20-40 km/h" },
    { text: "Macet", color: "#ef476f", level: "high", speed: "≤ 20 km/h" },
  ],
  distances: [
    "3.2 km",
    "6.5 km",
    "8.1 km",
    "12.3 km",
    "15.7 km",
    "21.4 km",
    "28.9 km",
    "35.2 km",
  ],

  // Sample locations dari OSM Jakarta
  sampleLocations: [
    {
      id: 1,
      name: "Bundaran HI",
      address: "Jl. M.H. Thamrin, Jakarta Pusat",
      lat: -6.1945,
      lng: 106.8229,
      severity: "high",
      reports: 18,
      averageSpeed: 12,
      lastUpdated: "3 menit lalu",
      osmType: "node",
      osmId: 123456789,
    },
    {
      id: 2,
      name: "Slipi",
      address: "Jl. Jenderal S. Parman, Jakarta Barat",
      lat: -6.192,
      lng: 106.797,
      severity: "medium",
      reports: 12,
      averageSpeed: 25,
      lastUpdated: "8 menit lalu",
      osmType: "node",
      osmId: 987654321,
    },
    {
      id: 3,
      name: "Kemang",
      address: "Jl. Kemang Raya, Jakarta Selatan",
      lat: -6.2656,
      lng: 106.8133,
      severity: "high",
      reports: 15,
      averageSpeed: 15,
      lastUpdated: "5 menit lalu",
      osmType: "node",
      osmId: 456789123,
    },
    {
      id: 4,
      name: "Mangga Dua",
      address: "Jl. Mangga Dua, Jakarta Utara",
      lat: -6.1376,
      lng: 106.8269,
      severity: "medium",
      reports: 10,
      averageSpeed: 20,
      lastUpdated: "12 menit lalu",
      osmType: "node",
      osmId: 789123456,
    },
    {
      id: 5,
      name: "Pasar Minggu",
      address: "Jl. Raya Pasar Minggu, Jakarta Selatan",
      lat: -6.2828,
      lng: 106.8404,
      severity: "low",
      reports: 5,
      averageSpeed: 35,
      lastUpdated: "15 menit lalu",
      osmType: "node",
      osmId: 321654987,
    },
  ],

  // Sample incidents dari OSM
  sampleIncidents: [
    {
      id: 1,
      type: "accident",
      title: "Kecelakaan Tabrakan",
      description: "Tabrakan antara mobil dan motor",
      location: "Jl. Sudirman, depan Plaza Senayan",
      lat: -6.2276,
      lng: 106.7992,
      severity: "high",
      time: "30 menit lalu",
      verified: true,
      osmTags: {
        highway: "accident",
        accident: "collision",
      },
    },
    {
      id: 2,
      type: "construction",
      title: "Konstruksi Jalan",
      description: "Pengerjaan drainase, 1 jalur ditutup",
      location: "Jl. Gatot Subroto, depta Hotel Mulia",
      lat: -6.2247,
      lng: 106.8099,
      severity: "medium",
      time: "2 jam lalu",
      verified: true,
      osmTags: {
        highway: "construction",
        construction: "drainage",
      },
    },
    {
      id: 3,
      type: "hazard",
      title: "Lubang di Jalan",
      description: "Lubang besar di jalur lambat",
      location: "Jl. Casablanca, depan Mall Ambassador",
      lat: -6.2385,
      lng: 106.8304,
      severity: "low",
      time: "1 jam lalu",
      verified: false,
      osmTags: {
        highway: "hazard",
        hazard: "pothole",
      },
    },
  ],
};

// ========== DOM ELEMENTS ==========
let elements = {};

// ========== INITIALIZATION ==========

/**
 * Initialize the application
 */
function initApp() {
  debugLog("🚀 Initializing Traffic OSM app...");

  try {
    initElements();
    loadState();
    setupEventListeners();
    initTheme();

    setTimeout(() => {
      loadSampleData();
      updateUI();

      if (window.L && !appState.mapInitialized) {
        initOSMMap();
      }

      // Cek status API
      checkAPIStatus();
    }, 100);

    showNotification("Sistem Deteksi Kemacetan OSM siap digunakan!", "success");

    debugLog("✅ App initialization complete");
  } catch (error) {
    debugError("❌ Failed to initialize app:", error);
    showNotification("Gagal memulai aplikasi. Refresh halaman.", "error");
  }
}

/**
 * Initialize DOM elements
 */
function initElements() {
  debugLog("Initializing DOM elements...");

  elements = {
    // Theme
    themeToggle: document.getElementById("themeToggle"),

    // Search
    searchInput: document.getElementById("searchInput"),
    searchBtn: document.getElementById("searchBtn"),

    // Location
    locationBtn: document.getElementById("locationBtn"),
    addLocationBtn: document.getElementById("addLocationBtn"),

    // Controls
    refreshBtn: document.getElementById("refreshBtn"),
    routeBtn: document.getElementById("routeBtn"),
    reportBtn: document.getElementById("reportBtn"),
    settingsBtn: document.getElementById("settingsBtn"),
    toggleTrafficLayer: document.getElementById("toggleTrafficLayer"),
    filterBtn: document.getElementById("filterBtn"),
    refreshIncidentsBtn: document.getElementById("refreshIncidentsBtn"),

    // Map Controls
    zoomIn: document.getElementById("zoomIn"),
    zoomOut: document.getElementById("zoomOut"),
    centerMap: document.getElementById("centerMap"),

    // Route
    routeOrigin: document.getElementById("routeOrigin"),
    routeDestination: document.getElementById("routeDestination"),
    optimizationType: document.getElementById("optimizationType"),
    calculateRouteBtn: document.getElementById("calculateRouteBtn"),
    clearRouteBtn: document.getElementById("clearRouteBtn"),
    routeResults: document.getElementById("routeResults"),

    // Display Elements
    travelTime: document.getElementById("travelTime"),
    trafficCondition: document.getElementById("trafficCondition"),
    distanceText: document.getElementById("distanceText"),
    trafficDataSource: document.getElementById("trafficDataSource"),
    locationsList: document.getElementById("locationsList"),
    incidentsList: document.getElementById("incidentsList"),
    mapCoordinates: document.getElementById("mapCoordinates"),
    mapZoom: document.getElementById("mapZoom"),
    apiStatus: document.getElementById("apiStatus"),
    apiStatusText: document.getElementById("apiStatusText"),
    lastUpdate: document.getElementById("lastUpdate"),

    // Modals
    reportModal: document.getElementById("reportModal"),
    addLocationModal: document.getElementById("addLocationModal"),
    closeModal: document.getElementById("closeModal"),
    closeLocationModal: document.getElementById("closeLocationModal"),
    cancelBtn: document.getElementById("cancelBtn"),
    cancelLocationBtn: document.getElementById("cancelLocationBtn"),
    submitReportBtn: document.getElementById("submitReportBtn"),
    submitLocationBtn: document.getElementById("submitLocationBtn"),

    // Form Inputs
    reportLocation: document.getElementById("reportLocation"),
    reportSeverity: document.getElementById("reportSeverity"),
    reportDescription: document.getElementById("reportDescription"),
    locationName: document.getElementById("locationName"),
    locationAddress: document.getElementById("locationAddress"),
    locationSeverity: document.getElementById("locationSeverity"),

    // Legend
    legendItems: document.querySelectorAll(".legend-item"),

    // Notification
    notification: document.getElementById("notification"),

    // Map
    mapElement: document.getElementById("map"),
  };

  // Initialize accessibility state for toggleTrafficLayer if present
  if (elements.toggleTrafficLayer) {
    // Ensure aria-pressed is set to a default boolean string
    elements.toggleTrafficLayer.setAttribute('aria-pressed', appState.trafficLayerActive ? 'true' : 'false');
    // Ensure visual state matches current app state
    try {
      updateTrafficButtonState(appState.trafficLayerActive);
    } catch (e) {
      debugError('Could not update traffic button state on init:', e);
    }
  }

  debugLog("✅ Elements initialized");
}

/**
 * Initialize OSM Map with Overpass integration
 */
function initOSMMap() {
  debugLog("📍 Initializing OpenStreetMap with Overpass API...");

  if (!L || !elements.mapElement) {
    debugError("Leaflet not loaded or map element not found");
    setTimeout(initOSMMap, 500);
    return;
  }

  try {
    // Create OSM map
    appState.map = L.map("map", {
      center: [CONFIG.defaultLocation.lat, CONFIG.defaultLocation.lng],
      zoom: 13,
      zoomControl: false,
      attributionControl: true,
    });

    // Add OSM tile layer
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: CONFIG.maxZoom,
    }).addTo(appState.map);

    // Add OSM Humanitarian layer
    L.tileLayer("https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png", {
      attribution:
        "© OpenStreetMap contributors, Tiles style by Humanitarian OpenStreetMap Team",
      maxZoom: CONFIG.maxZoom,
    }).addTo(appState.map);

    // Initialize geocoder
    initGeocoder();

    // Add map event listeners
    appState.map.on("moveend", updateMapInfo);
    appState.map.on("zoomend", updateMapInfo);
    appState.map.on("click", onMapClick);

    appState.mapInitialized = true;
    updateMapInfo();

    // Load traffic data
    loadOSMTrafficData();
    loadOSMIncidents();

    showNotification(
      "Peta OpenStreetMap berhasil dimuat dengan data real-time!",
      "success"
    );
  } catch (error) {
    debugError("❌ Error initializing OSM map:", error);
    showNotification("Error memuat peta OSM", "error");
  }
}

/**
 * Initialize Leaflet Geocoder dengan Nominatim
 */
function initGeocoder() {
  if (!appState.map || !L.Control.Geocoder) return;

  try {
    appState.geocoder = L.Control.geocoder({
      defaultMarkGeocode: false,
      placeholder: "Cari lokasi di OSM...",
      errorMessage: "Lokasi tidak ditemukan.",
      showResultIcons: true,
      collapsed: true,
      position: "topleft",
      geocoder: L.Control.Geocoder.nominatim({
        geocodingQueryParams: {
          countrycodes: "id",
          "accept-language": "id",
          bounded: 1,
          viewbox: "106.6899,-6.4185,107.0000,-6.0990", // Bbox Jakarta
        },
      }),
    }).addTo(appState.map);

    appState.geocoder.on("markgeocode", function (e) {
      const center = e.geocode.center;
      const name = e.geocode.name;

      appState.map.setView(center, 15);

      clearSearchMarker();

      appState.searchMarker = L.marker(center, {
        icon: L.divIcon({
          className: "search-marker",
          html: '<div style="background: #4361ee; width: 36px; height: 36px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-size: 16px;"><i class="fas fa-search"></i></div>',
          iconSize: [36, 36],
        }),
      })
        .addTo(appState.map)
        .bindPopup(
          `
                <div style="min-width: 250px;">
                    <strong style="color: #333; font-size: 16px;">📍 ${
                      name.split(",")[0]
                    }</strong><br>
                    <small style="color: #666;">${name}</small><br>
                    <div style="margin-top: 8px; font-size: 12px; color: #888;">
                        <i class="fas fa-database"></i> Sumber: OpenStreetMap
                    </div>
                </div>
            `
        )
        .openPopup();

      showNotification(`📍 Ditemukan di OSM: ${name}`, "success");

      if (elements.searchInput) {
        elements.searchInput.value = name;
      }

      // Load traffic data untuk area ini
      loadTrafficDataForLocation(center.lat, center.lng);
    });

    debugLog("✅ Geocoder initialized");
  } catch (error) {
    debugError("❌ Error initializing geocoder:", error);
  }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  debugLog("Setting up event listeners...");

  // Theme Toggle
  if (elements.themeToggle) {
    elements.themeToggle.addEventListener("click", toggleTheme);
  }

  // Search
  if (elements.searchBtn) {
    elements.searchBtn.addEventListener("click", handleSearch);
  }

  if (elements.searchInput) {
    elements.searchInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") handleSearch();
    });

    elements.searchInput.addEventListener("input", handleSearchInput);
  }

  // Location
  if (elements.locationBtn) {
    elements.locationBtn.addEventListener("click", getCurrentLocation);
  }

  if (elements.addLocationBtn) {
    elements.addLocationBtn.addEventListener("click", () =>
      showModal("location")
    );
  }

  // Controls
  if (elements.refreshBtn) {
    elements.refreshBtn.addEventListener("click", refreshTrafficData);
  }

  if (elements.routeBtn) {
    elements.routeBtn.addEventListener("click", showRoutePanel);
  }

  if (elements.reportBtn) {
    elements.reportBtn.addEventListener("click", () => showModal("report"));
  }

  if (elements.settingsBtn) {
    elements.settingsBtn.addEventListener("click", showSettings);
  }

  if (elements.toggleTrafficLayer) {
    elements.toggleTrafficLayer.addEventListener("click", toggleTrafficOverlay);
  }

  if (elements.filterBtn) {
    elements.filterBtn.addEventListener("click", showFilterOptions);
  }

  if (elements.refreshIncidentsBtn) {
    elements.refreshIncidentsBtn.addEventListener("click", loadOSMIncidents);
  }

  // Map Controls
  if (elements.zoomIn) {
    elements.zoomIn.addEventListener("click", () => zoomMap(1));
  }

  if (elements.zoomOut) {
    elements.zoomOut.addEventListener("click", () => zoomMap(-1));
  }

  if (elements.centerMap) {
    elements.centerMap.addEventListener("click", centerToCurrentLocation);
  }

  // Route
  if (elements.calculateRouteBtn) {
    elements.calculateRouteBtn.addEventListener("click", calculateRoute);
  }

  if (elements.clearRouteBtn) {
    elements.clearRouteBtn.addEventListener("click", clearRoute);
  }

  // Modals
  if (elements.closeModal) {
    elements.closeModal.addEventListener("click", () => hideModal("report"));
  }

  if (elements.closeLocationModal) {
    elements.closeLocationModal.addEventListener("click", () =>
      hideModal("location")
    );
  }

  if (elements.cancelBtn) {
    elements.cancelBtn.addEventListener("click", () => hideModal("report"));
  }

  if (elements.cancelLocationBtn) {
    elements.cancelLocationBtn.addEventListener("click", () =>
      hideModal("location")
    );
  }

  if (elements.submitReportBtn) {
    elements.submitReportBtn.addEventListener("click", submitReport);
  }

  if (elements.submitLocationBtn) {
    elements.submitLocationBtn.addEventListener("click", submitLocation);
  }

  // Legend Items
  if (elements.legendItems) {
    elements.legendItems.forEach((item) => {
      item.addEventListener("click", () => {
        const filter = item.dataset.filter;
        filterLocations(filter);
      });
    });
  }

  // Close modals on outside click
  window.addEventListener("click", (e) => {
    if (e.target === elements.reportModal) hideModal("report");
    if (e.target === elements.addLocationModal) hideModal("location");
  });

  window.addEventListener("resize", handleResize);
  window.addEventListener("beforeunload", saveState);

  debugLog("✅ Event listeners setup complete");
}

// ========== OSM & OVERPASS FUNCTIONS ==========

/**
 * Load OSM traffic data using Overpass API
 */
async function loadOSMTrafficData() {
  if (!appState.map) return;

  try {
    const bounds = appState.map.getBounds();
    const bbox = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;

    // Query Overpass API untuk data jalan dan traffic
    const query = `
            [out:json][timeout:30];
            (
                // Jalan utama dan sekunder
                way["highway"~"motorway|trunk|primary|secondary|tertiary"](${bbox});
                // Titik traffic
                node["highway"="traffic_signals"](${bbox});
                node["traffic_calming"](${bbox});
                // Area konstruksi
                way["highway"="construction"](${bbox});
                // Kecelakaan (dari tags OSM)
                node["highway"="accident"](${bbox});
                way["highway"="accident"](${bbox});
            );
            out body;
            >;
            out skel qt;
        `;

    const response = await fetch(CONFIG.overpassApi, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // Process OSM data
    processOSMData(data);

    // Update API status
    updateAPIStatus("online");
    updateLastUpdateTime();

    debugLog(
      "✅ OSM traffic data loaded:",
      data.elements?.length || 0,
      "elements"
    );
  } catch (error) {
    debugError("❌ Error loading OSM traffic data:", error);
    updateAPIStatus("offline");
    showNotification("Gagal memuat data traffic dari OSM", "warning");

    // Gunakan data sample sebagai fallback
    useSampleTrafficData();
  }
}

/**
 * Load OSM incidents data
 */
async function loadOSMIncidents() {
  if (!appState.map) return;

  try {
    const bounds = appState.map.getBounds();
    const bbox = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;

    // Query untuk insiden lalu lintas
    const query = `
            [out:json][timeout:25];
            (
                // Kecelakaan
                node["highway"="accident"](${bbox});
                // Bahaya jalan
                node["highway"="hazard"](${bbox});
                // Konstruksi
                node["highway"="construction"](${bbox});
                way["highway"="construction"](${bbox});
                // Kendala lalu lintas
                node["traffic_calming"](${bbox});
            );
            out body;
            >;
            out skel qt;
        `;

    const response = await fetch(CONFIG.overpassApi, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (response.ok) {
      const data = await response.json();
      processOSMIncidents(data);
    }
  } catch (error) {
    debugError("Error loading OSM incidents:", error);
    useSampleIncidents();
  }
}

/**
 * Process OSM data untuk ditampilkan di map
 */
function processOSMData(osmData) {
  if (!osmData.elements || !appState.map) return;

  // Clear existing traffic layer
  if (appState.trafficLayer) {
    appState.map.removeLayer(appState.trafficLayer);
  }

  // Create feature group untuk traffic data
  appState.trafficLayer = L.featureGroup().addTo(appState.map);

  // Process each element
  osmData.elements.forEach((element) => {
    if (element.type === "node") {
      processOSMNode(element);
    } else if (element.type === "way") {
      processOSMWay(element);
    }
  });

  // Update locations list dengan data OSM
  updateLocationsFromOSM(osmData);
}

/**
 * Process OSM node
 */
function processOSMNode(node) {
  if (!node.lat || !node.lon) return;

  let marker = null;
  let popupContent = "";
  let iconColor = "#4361ee";

  // Determine type and styling
  if (node.tags) {
    if (node.tags.highway === "traffic_signals") {
      iconColor = "#ef476f";
      popupContent = `
                <div style="min-width: 200px;">
                    <strong style="color: #333;">🚦 Lampu Lalu Lintas</strong><br>
                    <small style="color: #666;">Koordinat: ${node.lat.toFixed(
                      6
                    )}, ${node.lon.toFixed(6)}</small>
                </div>
            `;
    } else if (node.tags.highway === "accident") {
      iconColor = "#ff6b35";
      popupContent = `
                <div style="min-width: 200px;">
                    <strong style="color: #333;">⚠️ Titik Kecelakaan</strong><br>
                    <small style="color: #666;">Dilaporkan di OSM</small>
                </div>
            `;
    } else if (node.tags.hazard) {
      iconColor = "#ffd166";
      popupContent = `
                <div style="min-width: 200px;">
                    <strong style="color: #333;">🚧 Bahaya Jalan</strong><br>
                    <small style="color: #666;">${
                      node.tags.hazard || "Hazard"
                    }</small>
                </div>
            `;
    }
  }

  if (popupContent) {
    marker = L.marker([node.lat, node.lon], {
      icon: L.divIcon({
        className: "traffic-marker",
        html: `<div style="background: ${iconColor}; width: 24px; height: 24px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);"></div>`,
        iconSize: [24, 24],
      }),
    }).bindPopup(popupContent);

    appState.trafficLayer.addLayer(marker);
  }
}

/**
 * Process OSM way (jalan)
 */
function processOSMWay(way) {
  if (!way.nodes || !appState.map) return;

  // Get coordinates untuk polyline
  const coordinates = [];
  let hasCoordinates = false;

  // Untuk demo, kita buat coordinates sederhana
  // Di production, Anda perlu resolve node coordinates dari OSM data
  if (way.geometry) {
    way.geometry.forEach((geom) => {
      coordinates.push([geom.lat, geom.lon]);
      hasCoordinates = true;
    });
  }

  if (!hasCoordinates || coordinates.length < 2) return;

  // Determine road type and color
  let roadColor = "#666";
  let roadWeight = 3;
  let roadOpacity = 0.7;

  if (way.tags) {
    switch (way.tags.highway) {
      case "motorway":
        roadColor = "#ef476f";
        roadWeight = 5;
        break;
      case "trunk":
        roadColor = "#ff6b35";
        roadWeight = 4;
        break;
      case "primary":
        roadColor = "#ffd166";
        roadWeight = 4;
        break;
      case "secondary":
        roadColor = "#06d6a0";
        roadWeight = 3;
        break;
      case "tertiary":
        roadColor = "#4361ee";
        roadWeight = 3;
        break;
      case "construction":
        roadColor = "#7209b7";
        roadWeight = 3;
        roadOpacity = 0.5;
        break;
    }
  }

  // Create polyline
  const polyline = L.polyline(coordinates, {
    color: roadColor,
    weight: roadWeight,
    opacity: roadOpacity,
    lineJoin: "round",
  });

  // Add popup dengan info jalan
  const popupContent = `
        <div style="min-width: 250px;">
            <strong style="color: #333;">🛣️ ${
              way.tags?.name || "Jalan"
            }</strong><br>
            <small style="color: #666;">Tipe: ${
              way.tags?.highway || "unknown"
            }</small><br>
            ${
              way.tags?.construction
                ? '<small style="color: #7209b7;">🚧 Dalam Konstruksi</small>'
                : ""
            }
        </div>
    `;

  polyline.bindPopup(popupContent);
  appState.trafficLayer.addLayer(polyline);
}

/**
 * Process OSM incidents data
 */
function processOSMIncidents(osmData) {
  if (!osmData.elements) return;

  // Clear existing incidents layer
  if (appState.incidentsLayer) {
    appState.map.removeLayer(appState.incidentsLayer);
  }

  appState.incidents = [];
  appState.incidentsLayer = L.featureGroup().addTo(appState.map);

  osmData.elements.forEach((element) => {
    if (element.type === "node" && element.lat && element.lon) {
      const incident = createIncidentFromOSM(element);
      if (incident) {
        appState.incidents.push(incident);
        addIncidentMarker(incident);
      }
    }
  });

  updateIncidentsList();
  debugLog(
    "✅ OSM incidents processed:",
    appState.incidents.length,
    "incidents"
  );
}

/**
 * Create incident object from OSM element
 */
function createIncidentFromOSM(element) {
  if (!element.tags) return null;

  const incident = {
    id: element.id,
    lat: element.lat,
    lng: element.lon,
    type: "other",
    title: "Insiden Lalu Lintas",
    description: "",
    severity: "medium",
    time: "Baru dilaporkan",
    verified: false,
    osmTags: element.tags,
  };

  // Determine type based on OSM tags
  if (element.tags.highway === "accident") {
    incident.type = "accident";
    incident.title = "Kecelakaan";
    incident.severity = "high";
    incident.description =
      element.tags.description || "Kecelakaan dilaporkan di OSM";
  } else if (element.tags.highway === "construction") {
    incident.type = "construction";
    incident.title = "Konstruksi Jalan";
    incident.severity = "medium";
    incident.description =
      element.tags.construction || "Pekerjaan konstruksi jalan";
  } else if (element.tags.hazard) {
    incident.type = "hazard";
    incident.title = "Bahaya Jalan";
    incident.severity = element.tags.hazard === "pothole" ? "medium" : "low";
    incident.description = `Bahaya: ${element.tags.hazard}`;
  } else if (element.tags.traffic_calming) {
    incident.type = "traffic_calming";
    incident.title = "Penghambat Lalu Lintas";
    incident.severity = "low";
    incident.description = `Penghambat: ${element.tags.traffic_calming}`;
  }

  return incident;
}

/**
 * Add incident marker to map
 */
function addIncidentMarker(incident) {
  if (!appState.map || !appState.incidentsLayer) return;

  const iconColors = {
    accident: "#ef476f",
    construction: "#ff6b35",
    hazard: "#ffd166",
    traffic_calming: "#06d6a0",
    other: "#4361ee",
  };

  const icon = L.divIcon({
    className: "incident-marker",
    html: `
            <div style="
                background: ${iconColors[incident.type] || "#4361ee"};
                width: 28px;
                height: 28px;
                border-radius: 50%;
                border: 3px solid white;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: 14px;
            ">
                <i class="fas ${getIncidentIcon(incident.type)}"></i>
            </div>
        `,
    iconSize: [28, 28],
  });

  const marker = L.marker([incident.lat, incident.lng], { icon }).addTo(
    appState.incidentsLayer
  ).bindPopup(`
            <div style="min-width: 250px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <strong style="color: #333; font-size: 16px;">
                        <i class="fas ${getIncidentIcon(incident.type)}"></i> ${
    incident.title
  }
                    </strong>
                    <span style="background: ${getSeverityColor(
                      incident.severity
                    )}; color: white; padding: 2px 8px; border-radius: 12px; font-size: 12px;">
                        ${getSeverityText(incident.severity)}
                    </span>
                </div>
                <div style="color: #666; font-size: 14px; margin-bottom: 8px;">${
                  incident.description
                }</div>
                <div style="font-size: 12px; color: #888;">
                    <div><i class="far fa-clock"></i> ${incident.time}</div>
                    <div><i class="fas fa-map-marker-alt"></i> ${incident.lat.toFixed(
                      6
                    )}, ${incident.lng.toFixed(6)}</div>
                    ${
                      incident.verified
                        ? '<div><i class="fas fa-check-circle"></i> Terverifikasi OSM</div>'
                        : ""
                    }
                </div>
            </div>
        `);

  return marker;
}

/**
 * Get incident icon based on type
 */
function getIncidentIcon(type) {
  const icons = {
    accident: "fa-car-crash",
    construction: "fa-road",
    hazard: "fa-exclamation-triangle",
    traffic_calming: "fa-tachometer-alt",
    other: "fa-exclamation-circle",
  };
  return icons[type] || "fa-exclamation-circle";
}

/**
 * Update locations list from OSM data
 */
function updateLocationsFromOSM(osmData) {
  if (!osmData.elements) return;

  // Collect important locations from OSM
  const osmLocations = [];

  osmData.elements.forEach((element) => {
    if (element.type === "node" && element.tags) {
      // Cari lokasi penting berdasarkan tags
      if (
        element.tags.place === "suburb" ||
        element.tags.place === "neighbourhood" ||
        element.tags.place === "quarter" ||
        (element.tags.name && element.tags.place)
      ) {
        const severity = getRandomSeverity();
        osmLocations.push({
          id: element.id,
          name: element.tags.name || `Location ${element.id}`,
          address:
            element.tags["addr:street"] ||
            element.tags.name ||
            "Unknown address",
          lat: element.lat,
          lng: element.lon,
          severity: severity,
          reports: Math.floor(Math.random() * 20),
          averageSpeed:
            severity === "high"
              ? Math.floor(Math.random() * 20) + 5
              : severity === "medium"
              ? Math.floor(Math.random() * 20) + 20
              : Math.floor(Math.random() * 20) + 40,
          lastUpdated: `${Math.floor(Math.random() * 60)} menit lalu`,
          osmType: "node",
          osmId: element.id,
        });
      }
    }
  });

  // Gabungkan dengan sample data
  appState.locations = [
    ...trafficData.sampleLocations,
    ...osmLocations.slice(0, 10),
  ];
  updateLocationsList();
}

/**
 * Load traffic data for specific location
 */
async function loadTrafficDataForLocation(lat, lng) {
  try {
    const bbox = `${lat - 0.05},${lng - 0.05},${lat + 0.05},${lng + 0.05}`;

    const query = `
            [out:json][timeout:25];
            (
                way["highway"~"motorway|trunk|primary|secondary|tertiary"](${bbox});
                node["highway"="traffic_signals"](${bbox});
                node["highway"="accident"](${bbox});
            );
            out body;
            >;
            out skel qt;
        `;

    const response = await fetch(CONFIG.overpassApi, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (response.ok) {
      const data = await response.json();
      showNotification(
        `Data traffic ditemukan: ${data.elements?.length || 0} elemen`,
        "success"
      );
    }
  } catch (error) {
    debugError("Error loading location traffic:", error);
  }
}

/**
 * Use sample traffic data sebagai fallback
 */
function useSampleTrafficData() {
  debugLog("Using sample traffic data");

  // Update traffic info dengan data sample
  updateTrafficInfo();

  // Add sample markers
  trafficData.sampleLocations.forEach((location) => {
    addTrafficMarker(location);
  });
}

/**
 * Use sample incidents
 */
function useSampleIncidents() {
  appState.incidents = [...trafficData.sampleIncidents];

  if (appState.incidentsLayer) {
    appState.map.removeLayer(appState.incidentsLayer);
  }

  appState.incidentsLayer = L.featureGroup().addTo(appState.map);

  trafficData.sampleIncidents.forEach((incident) => {
    addIncidentMarker(incident);
  });

  updateIncidentsList();
}

// ========== MAP FUNCTIONS ==========

/**
 * Handle map click
 */
function onMapClick(e) {
  const lat = e.latlng.lat.toFixed(6);
  const lng = e.latlng.lng.toFixed(6);

  showNotification(`Koordinat: ${lat}, ${lng}`, "info");

  // Update route inputs jika focused
  if (document.activeElement === elements.routeOrigin) {
    elements.routeOrigin.value = `${lat}, ${lng}`;
  } else if (document.activeElement === elements.routeDestination) {
    elements.routeDestination.value = `${lat}, ${lng}`;
  }
}

/**
 * Zoom map
 */
function zoomMap(delta) {
  if (appState.map) {
    const currentZoom = appState.map.getZoom();
    const newZoom = currentZoom + delta;

    if (newZoom >= 1 && newZoom <= CONFIG.maxZoom) {
      appState.map.setZoom(newZoom);
    }
  }
}

/**
 * Center map to current location
 */
function centerToCurrentLocation() {
  if (appState.currentLocation && appState.map) {
    const latLng = L.latLng(
      appState.currentLocation.lat,
      appState.currentLocation.lng
    );
    appState.map.setView(latLng, 15);
    updateUserMarker();
  } else {
    getCurrentLocation();
  }
}

/**
 * Update user marker
 */
function updateUserMarker() {
  if (!appState.currentLocation || !appState.map) return;

  const latLng = L.latLng(
    appState.currentLocation.lat,
    appState.currentLocation.lng
  );

  if (appState.userMarker) {
    appState.map.removeLayer(appState.userMarker);
  }

  appState.userMarker = L.marker(latLng, {
    icon: L.divIcon({
      className: "user-marker",
      html: '<div style="background: #4361ee; width: 40px; height: 40px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 10px rgba(67, 97, 238, 0.5); display: flex; align-items: center; justify-content: center; color: white; font-size: 18px;"><i class="fas fa-user"></i></div>',
      iconSize: [40, 40],
    }),
    zIndexOffset: 1000,
  }).addTo(appState.map).bindPopup(`
        <div style="min-width: 200px;">
            <strong style="color: #333; font-size: 16px;">📍 Lokasi Anda</strong><br>
            <div style="margin-top: 5px; font-size: 12px; color: #666;">
                <i class="fas fa-map-marker-alt"></i> 
                Lat: ${appState.currentLocation.lat.toFixed(
                  6
                )}, Lng: ${appState.currentLocation.lng.toFixed(6)}
            </div>
        </div>
    `);
}

/**
 * Update map info display
 */
function updateMapInfo() {
  if (!appState.map || !elements.mapCoordinates || !elements.mapZoom) return;

  const center = appState.map.getCenter();
  const zoom = appState.map.getZoom();

  elements.mapCoordinates.textContent = `Lat: ${center.lat.toFixed(
    4
  )}, Lng: ${center.lng.toFixed(4)}`;
  elements.mapZoom.textContent = `Zoom: ${zoom}`;
}

/**
 * Clear search marker
 */
function clearSearchMarker() {
  if (appState.searchMarker) {
    appState.map.removeLayer(appState.searchMarker);
    appState.searchMarker = null;
  }
}

/**
 * Toggle traffic overlay
 */
function toggleTrafficOverlay() {
  if (!appState.map) return;

  appState.trafficLayerActive = !appState.trafficLayerActive;

  if (appState.trafficLayer) {
    if (appState.trafficLayerActive) {
      appState.map.addLayer(appState.trafficLayer);
      showNotification("Layer traffic diaktifkan", "success");
    } else {
      appState.map.removeLayer(appState.trafficLayer);
      showNotification("Layer traffic dimatikan", "info");
    }
  }

  updateTrafficButtonState(appState.trafficLayerActive);
}

/**
 * Add traffic marker
 */
function addTrafficMarker(location) {
  if (!appState.map) return;

  const marker = L.marker([location.lat, location.lng], {
    icon: L.divIcon({
      className: "traffic-marker",
      html: `
                <div style="
                    background: ${getSeverityColor(location.severity)};
                    width: 28px;
                    height: 28px;
                    border-radius: 50%;
                    border: 3px solid white;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-size: 12px;
                ">
                    <i class="fas ${
                      location.severity === "high" ? "fa-exclamation" : "fa-car"
                    }"></i>
                </div>
            `,
      iconSize: [28, 28],
    }),
  }).addTo(appState.map).bindPopup(`
        <div style="min-width: 250px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <strong style="color: #333; font-size: 16px;">${
                  location.name
                }</strong>
                <span style="background: ${getSeverityColor(
                  location.severity
                )}; color: white; padding: 2px 8px; border-radius: 12px; font-size: 12px;">
                    ${getSeverityText(location.severity)}
                </span>
            </div>
            <div style="color: #666; font-size: 14px; margin-top: 5px;">${
              location.address
            }</div>
            <div style="margin-top: 10px; font-size: 12px; color: #888;">
                <div><i class="fas fa-tachometer-alt"></i> Kecepatan: ${
                  location.averageSpeed || "--"
                } km/h</div>
                <div><i class="fas fa-exclamation-circle"></i> Laporan: ${
                  location.reports || 0
                }</div>
                <div><i class="far fa-clock"></i> Update: ${
                  location.lastUpdated || "--"
                }</div>
            </div>
        </div>
    `);

  appState.markers.push(marker);
}

// ========== SEARCH FUNCTIONS ==========

/**
 * Handle search input
 */
function handleSearchInput() {
  const query = elements.searchInput.value.trim();

  if (query.length < 2) {
    return;
  }

  clearTimeout(appState.searchTimeout);
  appState.searchTimeout = setTimeout(() => {
    searchOSMLocations(query);
  }, 300);
}

/**
 * Handle search button click
 */
function handleSearch() {
  if (!elements.searchInput) return;

  const query = elements.searchInput.value.trim();
  if (!query) {
    showNotification("Masukkan lokasi yang ingin dicari", "info");
    return;
  }

  debugLog("🔍 Searching OSM for:", query);
  showNotification(`Mencari: "${query}"`, "info");

  performOSMSearch(query);
}

/**
 * Perform OSM search
 */
async function performOSMSearch(query) {
  try {
    setLoading(true);

    const response = await fetch(
      `${CONFIG.nominatimApi}?format=json&q=${encodeURIComponent(
        query
      )}&limit=5&countrycodes=id&addressdetails=1&bounded=1&viewbox=106.6899,-6.4185,107.0000,-6.0990`
    );

    if (response.ok) {
      const results = await response.json();
      if (results && results.length > 0) {
        handleOSMSearchResult(results[0]);
      } else {
        showNotification("Lokasi tidak ditemukan di OSM", "warning");
      }
    }
  } catch (error) {
    debugError("OSM search error:", error);
    showNotification("Error saat mencari lokasi", "error");
  } finally {
    setLoading(false);
  }
}

/**
 * Search OSM locations
 */
async function searchOSMLocations(query) {
  try {
    const response = await fetch(
      `${CONFIG.nominatimApi}?format=json&q=${encodeURIComponent(
        query
      )}&limit=3&countrycodes=id`
    );

    if (response.ok) {
      const results = await response.json();
      updateSearchSuggestions(results);
    }
  } catch (error) {
    debugError("Search suggestions error:", error);
  }
}

/**
 * Update search suggestions
 */
function updateSearchSuggestions(results) {
  // Implementasi dropdown suggestions jika diperlukan
  debugLog("Search suggestions:", results);
}

/**
 * Handle OSM search result
 */
function handleOSMSearchResult(result) {
  if (!appState.map) return;

  const latLng = L.latLng(parseFloat(result.lat), parseFloat(result.lon));

  appState.map.setView(latLng, 15);

  clearSearchMarker();

  appState.searchMarker = L.marker(latLng, {
    icon: L.divIcon({
      className: "search-marker",
      html: '<div style="background: #4361ee; width: 36px; height: 36px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-size: 16px;"><i class="fas fa-search"></i></div>',
      iconSize: [36, 36],
    }),
  })
    .addTo(appState.map)
    .bindPopup(
      `
        <div style="min-width: 250px;">
            <strong style="color: #333; font-size: 16px;">📍 ${
              result.display_name.split(",")[0]
            }</strong><br>
            <small style="color: #666;">${result.display_name}</small><br>
            <div style="margin-top: 8px; font-size: 12px; color: #888;">
                <i class="fas fa-database"></i> Sumber: OpenStreetMap
            </div>
        </div>
    `
    )
    .openPopup();

  showNotification(`✅ Ditemukan di OSM: ${result.display_name}`, "success");

  if (elements.searchInput) {
    elements.searchInput.value = result.display_name;
  }
}

// ========== LOCATION FUNCTIONS ==========

/**
 * Get current location
 */
function getCurrentLocation() {
  if (!navigator.geolocation) {
    showNotification("Browser tidak mendukung geolokasi", "error");
    return;
  }

  showNotification("Mengambil lokasi Anda...", "info");

  navigator.geolocation.getCurrentPosition(
    (position) => {
      appState.currentLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
      };

      centerToCurrentLocation();
      showNotification("Lokasi Anda berhasil ditemukan", "success");

      if (elements.routeOrigin) {
        elements.routeOrigin.value = "Lokasi Saya";
      }
    },
    (error) => {
      let errorMessage = "Tidak dapat mengakses lokasi. ";

      switch (error.code) {
        case error.PERMISSION_DENIED:
          errorMessage += "Izinkan akses lokasi di pengaturan browser.";
          break;
        case error.POSITION_UNAVAILABLE:
          errorMessage += "Informasi lokasi tidak tersedia.";
          break;
        case error.TIMEOUT:
          errorMessage += "Waktu permintaan habis.";
          break;
        default:
          errorMessage += "Pastikan GPS aktif.";
      }

      showNotification(errorMessage, "error");
      debugError("Geolocation error:", error);
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    }
  );
}

// ========== ROUTE FUNCTIONS ==========

/**
 * Show route panel
 */
function showRoutePanel() {
  showNotification("Fitur rute menggunakan OSM Routing", "info");
}

/**
 * Calculate route using OSM
 */
async function calculateRoute() {
  const origin = elements.routeOrigin?.value.trim();
  const destination = elements.routeDestination?.value.trim();
  const optimizationType = elements.optimizationType?.value;

  if (!origin || !destination) {
    showNotification("Harap masukkan asal dan tujuan", "error");
    return;
  }

  showNotification(`Menghitung rute ${optimizationType}...`, "info");

  try {
    setLoading(true);
    appState.routeCalculating = true;

    // Geocode origin and destination
    const [originCoords, destCoords] = await Promise.all([
      geocodeAddress(origin),
      geocodeAddress(destination),
    ]);

    if (!originCoords || !destCoords) {
      throw new Error("Gagal menemukan lokasi");
    }

    // Clear previous route
    clearRoute();

    // Calculate route using OSM
    await calculateOSMRoute(originCoords, destCoords, optimizationType);

    showNotification("Rute berhasil dihitung!", "success");
  } catch (error) {
    debugError("Route calculation error:", error);
    showNotification(`Gagal menghitung rute: ${error.message}`, "error");
  } finally {
    setLoading(false);
    appState.routeCalculating = false;
  }
}

/**
 * Geocode address using OSM Nominatim
 */
async function geocodeAddress(address) {
  if (address.toLowerCase() === "lokasi saya" && appState.currentLocation) {
    return [appState.currentLocation.lat, appState.currentLocation.lng];
  }

  // Check if address is already in coordinate format (lat,lng or lat, lng)
  const coordMatch = address.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
  if (coordMatch) {
    return [parseFloat(coordMatch[1]), parseFloat(coordMatch[2])];
  }

  try {
    const response = await fetch(
      `${CONFIG.nominatimApi}?format=json&q=${encodeURIComponent(
        address
      )}&limit=1&countrycodes=id`
    );

    if (response.ok) {
      const results = await response.json();
      if (results && results.length > 0) {
        return [parseFloat(results[0].lat), parseFloat(results[0].lon)];
      }
    }
  } catch (error) {
    debugError("OSM geocoding failed:", error);
  }

  // Fallback: use sample locations if geocoding fails
  const sampleLocs = trafficData.sampleLocations;
  if (sampleLocs && sampleLocs.length > 0) {
    const random = sampleLocs[Math.floor(Math.random() * sampleLocs.length)];
    debugLog("⚠️ Using sample location as fallback:", random.name);
    showNotification(`📍 Menggunakan lokasi fallback: ${random.name}`, "warning");
    return [random.lat, random.lng];
  }

  return null;
}

/**
 * Calculate route using OSM
 */
async function calculateOSMRoute(origin, destination, optimizationType) {
  if (!L.Routing) {
    showNotification("Routing engine tidak tersedia", "error");
    return;
  }

  try {
    // Clear existing routing control
    if (appState.routingControl) {
      appState.map.removeControl(appState.routingControl);
    }

    // Create routing control
    appState.routingControl = L.Routing.control({
      waypoints: [
        L.latLng(origin[0], origin[1]),
        L.latLng(destination[0], destination[1]),
      ],
      routeWhileDragging: false,
      showAlternatives: true,
      lineOptions: {
        styles: [{ color: "#4361ee", weight: 5, opacity: 0.8 }],
      },
      createMarker: function (i, waypoint, n) {
        const iconColor = i === 0 ? "#06d6a0" : "#ef476f";
        const label = i === 0 ? "A" : "B";

        return L.marker(waypoint.latLng, {
          icon: L.divIcon({
            className: "route-marker",
            html: `
                            <div style="
                                background: ${iconColor};
                                width: 36px;
                                height: 36px;
                                border-radius: 50%;
                                border: 3px solid white;
                                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                color: white;
                                font-weight: bold;
                                font-size: 16px;
                            ">
                                ${label}
                            </div>
                        `,
            iconSize: [36, 36],
          }),
        }).bindPopup(i === 0 ? "Titik Asal" : "Titik Tujuan");
      },
    }).addTo(appState.map);

    // Listen to route found event
    appState.routingControl.on("routesfound", function (e) {
      const routes = e.routes;
      if (routes && routes.length > 0) {
        displayRouteResults(routes);
        // Send route summary to backend optimizer (if available)
        try {
          const best = routes[0];
          const distance_m = best.summary.totalDistance;
          const duration_s = best.summary.totalTime;
          const originText = elements.routeOrigin ? elements.routeOrigin.value : '';
          const destText = elements.routeDestination ? elements.routeDestination.value : '';
          const payload = {
            origin: originText,
            destination: destText,
            distance_m,
            duration_s,
            hour: new Date().getHours()
          };

          console.log('📤 Sending to backend:', BACKEND_URL + '/optimize', payload);
          fetch(`${BACKEND_URL}/optimize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }).then(res => {
            console.log('📥 Backend response status:', res.status);
            return res.json();
          })
          .then(data => {
            console.log('📥 Backend response data:', data);
            if (data && data.predicted_travel_time_min) {
              const predictionMsg = `Prediksi waktu tempuh: ${data.predicted_travel_time_min.toFixed(1)} menit (sumber: ${data.prediction_source})`;
              console.log('✅ ' + predictionMsg);
              showNotification(predictionMsg, 'success');
              // Insert predicted info at top of route results
              if (elements.routeResults) {
                const p = document.createElement('div');
                p.className = 'route-prediction';
                p.innerHTML = `<strong>Prediksi LSTM:</strong> ${data.predicted_travel_time_min.toFixed(1)} menit <small>(${data.prediction_source})</small>`;
                elements.routeResults.prepend(p);
              }
            } else {
              console.warn('⚠️ No prediction in response:', data);
            }
          }).catch(err => {
            console.error('❌ Backend optimize error:', err);
            debugError('Backend optimize error:', err);
          });
        } catch (err) {
          console.error('❌ Error sending optimize request:', err);
          debugError('Error sending optimize request:', err);
        }
      }
    });
  } catch (error) {
    debugError("OSM routing error:", error);
    throw error;
  }
}

/**
 * Display route results
 */
function displayRouteResults(routes) {
  if (!elements.routeResults) return;

  elements.routeResults.innerHTML = "";

  routes.forEach((route, index) => {
    const routeEl = document.createElement("div");
    routeEl.className = `route-result-item ${
      index === 0 ? "recommendation" : "alternative"
    }`;

    const distanceKm = (route.summary.totalDistance / 1000).toFixed(1);
    const durationMin = Math.round(route.summary.totalTime / 60);

    routeEl.innerHTML = `
            <div class="route-title">
                ${index === 0 ? "🏆 " : ""}Rute ${index + 1}
                ${
                  index === 0
                    ? '<span class="ai-badge">Direkomendasai</span>'
                    : ""
                }
            </div>
            <div class="route-details">
                <div class="route-detail">
                    <i class="fas fa-clock"></i>
                    <span>${durationMin} menit</span>
                </div>
                <div class="route-detail">
                    <i class="fas fa-road"></i>
                    <span>${distanceKm} km</span>
                </div>
            </div>
            ${
              route.instructions
                ? `
                <div class="route-instructions">
                    ${route.instructions
                      .slice(0, 3)
                      .map(
                        (instruction) => `
                        <div class="route-instruction">
                            <div>${instruction.text}</div>
                            <div class="instruction-distance">${(
                              instruction.distance / 1000
                            ).toFixed(1)} km</div>
                        </div>
                    `
                      )
                      .join("")}
                </div>
            `
                : ""
            }
        `;

    elements.routeResults.appendChild(routeEl);
  });
}

/**
 * Clear route
 */
function clearRoute() {
  if (appState.routingControl) {
    appState.map.removeControl(appState.routingControl);
    appState.routingControl = null;
  }

  if (elements.routeResults) {
    elements.routeResults.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-directions"></i>
                <p>Masukkan asal dan tujuan untuk optimasi rute</p>
            </div>
        `;
  }
}

// ========== UI FUNCTIONS ==========

/**
 * Update UI
 */
function updateUI() {
  updateTrafficInfo();
  updateLocationsList();
  updateIncidentsList();
  updateThemeIcon();
  updateMapInfo();
}

/**
 * Update traffic information
 */
function updateTrafficInfo() {
  if (
    !elements.travelTime ||
    !elements.trafficCondition ||
    !elements.distanceText
  )
    return;

  const travelTime = getRandomItem(trafficData.travelTimes);
  const condition = getRandomItem(trafficData.conditions);
  const distance = getRandomItem(trafficData.distances);

  elements.travelTime.textContent = travelTime;
  elements.trafficCondition.textContent = condition.text;
  elements.trafficCondition.style.color = condition.color;
  elements.distanceText.textContent = `Jarak: ${distance}`;

  if (elements.trafficDataSource) {
    elements.trafficDataSource.innerHTML = `
            <i class="fas fa-database"></i> Data: Overpass API
            ${appState.lastUpdate ? ` | Update: ${appState.lastUpdate}` : ""}
        `;
  }
}

/**
 * Update locations list
 */
function updateLocationsList() {
  if (!elements.locationsList) return;

  if (appState.locations.length === 0) {
    elements.locationsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-map-marked-alt"></i>
                <p>Belum ada lokasi tersimpan</p>
            </div>
        `;
    return;
  }

  elements.locationsList.innerHTML = "";

  appState.locations.slice(0, 10).forEach((location) => {
    const locationItem = document.createElement("div");
    locationItem.className = `location-item ${location.severity}`;

    let icon = "fa-car";
    if (location.severity === "high") icon = "fa-traffic-light";
    if (location.severity === "medium") icon = "fa-car-side";

    locationItem.innerHTML = `
            <div class="location-header">
                <div class="location-name">
                    <i class="fas ${icon}"></i>
                    ${location.name}
                    ${
                      location.osmId
                        ? '<span style="font-size: 10px; color: #888;">(OSM)</span>'
                        : ""
                    }
                </div>
                <div class="location-reports">
                    <i class="fas fa-exclamation-circle"></i>
                    ${location.reports || 0}
                </div>
            </div>
            <div class="location-address">${location.address}</div>
            <div class="location-info">
                <div class="info-item">
                    <i class="fas fa-tachometer-alt"></i>
                    <span>${location.averageSpeed || "--"} km/h</span>
                </div>
                <div class="info-item">
                    <i class="fas fa-traffic-light"></i>
                    <span>${getSeverityText(location.severity)}</span>
                </div>
                <div class="info-item">
                    <i class="far fa-clock"></i>
                    <span>${location.lastUpdated || "--"}</span>
                </div>
            </div>
        `;

    locationItem.addEventListener("click", () => {
      centerMapToLocation(location.lat, location.lng);
      showNotification(`Memusatkan peta ke ${location.name}`);
      highlightLocationMarker(location);
    });

    elements.locationsList.appendChild(locationItem);
  });
}

/**
 * Update incidents list
 */
function updateIncidentsList() {
  if (!elements.incidentsList) return;

  if (appState.incidents.length === 0) {
    elements.incidentsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-circle"></i>
                <p>Tidak ada insiden dilaporkan</p>
            </div>
        `;
    return;
  }

  elements.incidentsList.innerHTML = "";

  appState.incidents.slice(0, 10).forEach((incident) => {
    const incidentItem = document.createElement("div");
    incidentItem.className = `incident-item ${incident.type.toUpperCase()}`;

    incidentItem.innerHTML = `
            <div class="incident-type">
                <i class="fas ${getIncidentIcon(incident.type)}"></i>
                <span>${incident.title}</span>
            </div>
            <div class="incident-description">${incident.description}</div>
            <div class="incident-info">
                <span class="traffic-level level-${
                  incident.severity === "high"
                    ? "4"
                    : incident.severity === "medium"
                    ? "3"
                    : "2"
                }">
                    ${getSeverityText(incident.severity)}
                </span>
                <span class="incident-time">
                    <i class="far fa-clock"></i> ${incident.time}
                </span>
            </div>
        `;

    incidentItem.addEventListener("click", () => {
      centerMapToLocation(incident.lat, incident.lng);
      showNotification(`Memusatkan peta ke insiden: ${incident.title}`);

      // Highlight incident marker
      appState.incidentsLayer.getLayers().forEach((layer) => {
        if (
          layer.getLatLng &&
          layer.getLatLng().lat === incident.lat &&
          layer.getLatLng().lng === incident.lng
        ) {
          layer.openPopup();
        }
      });
    });

    elements.incidentsList.appendChild(incidentItem);
  });
}

/**
 * Center map to location
 */
function centerMapToLocation(lat, lng) {
  if (appState.map) {
    appState.map.setView([lat, lng], 15);
  }
}

/**
 * Highlight location marker
 */
function highlightLocationMarker(location) {
  appState.markers.forEach((marker) => {
    const markerLatLng = marker.getLatLng();
    if (
      markerLatLng.lat === location.lat &&
      markerLatLng.lng === location.lng
    ) {
      marker.openPopup();

      const severityColor = getSeverityColor(location.severity);
      marker.setIcon(
        L.divIcon({
          className: "traffic-marker-highlighted",
          html: `
                    <div style="
                        background: ${severityColor};
                        width: 36px;
                        height: 36px;
                        border-radius: 50%;
                        border: 3px solid white;
                        box-shadow: 0 0 20px ${severityColor};
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: white;
                        font-size: 14px;
                        animation: pulse 1s infinite;
                    ">
                        <i class="fas ${
                          location.severity === "high"
                            ? "fa-exclamation"
                            : "fa-car"
                        }"></i>
                    </div>
                `,
          iconSize: [36, 36],
        })
      );

      setTimeout(() => {
        marker.setIcon(
          L.divIcon({
            className: "traffic-marker",
            html: `
                        <div style="
                            background: ${severityColor};
                            width: 28px;
                            height: 28px;
                            border-radius: 50%;
                            border: 3px solid white;
                            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            color: white;
                            font-size: 12px;
                        ">
                            <i class="fas ${
                              location.severity === "high"
                                ? "fa-exclamation"
                                : "fa-car"
                            }"></i>
                        </div>
                    `,
            iconSize: [28, 28],
          })
        );
      }, 3000);
    }
  });
}

/**
 * Filter locations by severity
 */
function filterLocations(filter) {
  const filteredLocations = appState.locations.filter(
    (loc) => loc.severity === filter
  );
  const filterText = getSeverityText(filter);

  if (filteredLocations.length === 0) {
    showNotification(`Tidak ada lokasi dengan kondisi: ${filterText}`, "info");
    return;
  }

  const originalLocations = [...appState.locations];
  appState.locations = filteredLocations;
  updateLocationsList();

  showNotification(
    `Menampilkan ${filteredLocations.length} lokasi dengan kondisi: ${filterText}`,
    "success"
  );

  setTimeout(() => {
    appState.locations = originalLocations;
    updateLocationsList();
    showNotification("Semua lokasi ditampilkan kembali", "info");
  }, 10000);
}

/**
 * Toggle theme
 */
function toggleTheme() {
  appState.theme = appState.theme === "light" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", appState.theme);
  localStorage.setItem("trafficAppTheme", appState.theme);

  updateThemeIcon();

  const themeName = appState.theme === "light" ? "terang" : "gelap";
  showNotification(`Tema diubah ke ${themeName}`, "success");
}

/**
 * Initialize theme
 */
function initTheme() {
  const savedTheme = localStorage.getItem("trafficAppTheme") || "light";
  appState.theme = savedTheme;
  document.documentElement.setAttribute("data-theme", savedTheme);
  updateThemeIcon();
}

/**
 * Update theme icon
 */
function updateThemeIcon() {
  if (!elements.themeToggle) return;

  const icon = elements.themeToggle.querySelector("i");
  if (!icon) return; // guard against missing icon element

  if (appState.theme === "light") {
    icon.className = "fas fa-moon";
    icon.title = "Mode Gelap";
  } else {
    icon.className = "fas fa-sun";
    icon.title = "Mode Terang";
  }
}

/**
 * Show filter options
 */
function showFilterOptions() {
  const optionsHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3><i class="fas fa-filter"></i> Filter Lokasi</h3>
                <button class="close-modal">&times;</button>
            </div>
            <div class="modal-body">
                <div class="filter-options">
                    <label class="checkbox-label">
                        <input type="checkbox" id="filterHigh" checked>
                        <span class="checkmark"></span>
                        <span>Macet (Parah)</span>
                    </label>
                    <label class="checkbox-label">
                        <input type="checkbox" id="filterMedium" checked>
                        <span class="checkmark"></span>
                        <span>Sedang</span>
                    </label>
                    <label class="checkbox-label">
                        <input type="checkbox" id="filterLow" checked>
                        <span class="checkmark"></span>
                        <span>Lancar</span>
                    </label>
                    <div style="margin-top: 1rem;">
                        <label>Radius (km):</label>
                        <input type="range" id="filterRadius" min="1" max="50" value="10">
                        <div style="display: flex; justify-content: space-between; font-size: 12px; color: #666;">
                            <span>1 km</span>
                            <span id="radiusValue">10 km</span>
                            <span>50 km</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn-secondary" id="cancelFilterBtn">
                    <i class="fas fa-times"></i> Batal
                </button>
                <button class="btn-primary" id="applyFilterBtn">
                    <i class="fas fa-check"></i> Terapkan
                </button>
            </div>
        </div>
    `;

  const modal = document.createElement("div");
  modal.className = "modal";
  modal.style.display = "flex";
  modal.innerHTML = optionsHTML;

  modal.querySelector(".close-modal").addEventListener("click", () => {
    document.body.removeChild(modal);
  });

  modal.querySelector("#cancelFilterBtn").addEventListener("click", () => {
    document.body.removeChild(modal);
  });

  modal.querySelector("#applyFilterBtn").addEventListener("click", () => {
    applyFilters(modal);
  });

  modal.querySelector("#filterRadius").addEventListener("input", (e) => {
    modal.querySelector("#radiusValue").textContent = `${e.target.value} km`;
  });

  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });

  document.body.appendChild(modal);
}

/**
 * Apply filters
 */
function applyFilters(modal) {
  const filterHigh = modal.querySelector("#filterHigh").checked;
  const filterMedium = modal.querySelector("#filterMedium").checked;
  const filterLow = modal.querySelector("#filterLow").checked;
  const radius = parseInt(modal.querySelector("#filterRadius").value) * 1000; // Convert to meters

  const allowedSeverities = [];
  if (filterHigh) allowedSeverities.push("high");
  if (filterMedium) allowedSeverities.push("medium");
  if (filterLow) allowedSeverities.push("low");

  // Filter locations
  let filteredLocations = appState.locations.filter((location) =>
    allowedSeverities.includes(location.severity)
  );

  // Filter by radius if current location exists
  if (appState.currentLocation) {
    filteredLocations = filteredLocations.filter((location) => {
      const distance = calculateDistance(
        appState.currentLocation.lat,
        appState.currentLocation.lng,
        location.lat,
        location.lng
      );
      return distance <= radius;
    });
  }

  appState.locations = filteredLocations;
  updateLocationsList();

  showNotification(
    `Menampilkan ${filteredLocations.length} lokasi tersaring`,
    "success"
  );
  document.body.removeChild(modal);
}

// ========== API STATUS FUNCTIONS ==========

/**
 * Check API status
 */
async function checkAPIStatus() {
  try {
    // Use AbortController to implement a timeout since fetch doesn't support a timeout option
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    // Some servers reject HEAD requests or block them via CORS; try a lightweight GET
    const response = await fetch(CONFIG.overpassApi, {
      method: "GET",
      signal: controller.signal,
      // don't send large payloads; this is only a status check
    });

    clearTimeout(timeout);

    if (response && response.ok) {
      updateAPIStatus("online");
    } else {
      updateAPIStatus("offline");
    }
  } catch (error) {
    // Abort or network error -> treat as offline
    updateAPIStatus("offline");
    debugError("checkAPIStatus error:", error);
  }
}

/**
 * Update API status display
 */
function updateAPIStatus(status) {
  appState.apiStatus = status;

  if (!elements.apiStatus || !elements.apiStatusText) return;

  const statusDot = elements.apiStatus;
  const statusText = elements.apiStatusText;

  statusDot.className = "status-dot";

  if (status === "online") {
    statusDot.classList.add("online");
    statusText.textContent = "Online";
    statusText.style.color = "#06d6a0";
  } else if (status === "offline") {
    statusDot.classList.add("offline");
    statusText.textContent = "Offline";
    statusText.style.color = "#ef476f";
  } else {
    statusDot.classList.add("loading");
    statusText.textContent = "Loading...";
    statusText.style.color = "#ffd166";
  }
}

/**
 * Update last update time
 */
function updateLastUpdateTime() {
  const now = new Date();
  const timeString = now.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  appState.lastUpdate = timeString;

  if (elements.lastUpdate) {
    elements.lastUpdate.textContent = timeString;
  }
}

/**
 * Refresh traffic data
 */
function refreshTrafficData() {
  showNotification("Memperbarui data lalu lintas dari OSM...", "info");

  if (elements.refreshBtn) {
    const originalHTML = elements.refreshBtn.innerHTML;
    elements.refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    elements.refreshBtn.disabled = true;

    setTimeout(() => {
      loadOSMTrafficData();
      loadOSMIncidents();

      elements.refreshBtn.innerHTML = originalHTML;
      elements.refreshBtn.disabled = false;

      showNotification("Data lalu lintas berhasil diperbarui", "success");
    }, 1500);
  }
}

// ========== MODAL FUNCTIONS ==========

/**
 * Show modal
 */
function showModal(type) {
  if (type === "report") {
    if (elements.reportModal) {
      elements.reportModal.style.display = "flex";

      if (appState.map && elements.reportLocation) {
        const center = appState.map.getCenter();
        elements.reportLocation.value = `${center.lat.toFixed(
          4
        )}, ${center.lng.toFixed(4)}`;
      }

      if (elements.reportLocation) elements.reportLocation.focus();
    }
  } else if (type === "location") {
    if (elements.addLocationModal) {
      elements.addLocationModal.style.display = "flex";
      if (elements.locationName) elements.locationName.focus();
    }
  }
}

/**
 * Hide modal
 */
function hideModal(type) {
  if (type === "report") {
    if (elements.reportModal) {
      elements.reportModal.style.display = "none";
      if (elements.reportLocation) elements.reportLocation.value = "";
      if (elements.reportSeverity) elements.reportSeverity.value = "medium";
      if (elements.reportDescription) elements.reportDescription.value = "";
    }
  } else if (type === "location") {
    if (elements.addLocationModal) {
      elements.addLocationModal.style.display = "none";
      if (elements.locationName) elements.locationName.value = "";
      if (elements.locationAddress) elements.locationAddress.value = "";
      if (elements.locationSeverity) elements.locationSeverity.value = "medium";
    }
  }
}

/**
 * Submit report
 */
function submitReport() {
  if (!elements.reportLocation) return;

  const location = elements.reportLocation.value.trim();
  const severity = elements.reportSeverity
    ? elements.reportSeverity.value
    : "medium";
  const description = elements.reportDescription
    ? elements.reportDescription.value.trim()
    : "";

  if (!location) {
    showNotification("Harap masukkan lokasi", "error");
    return;
  }

  if (!description) {
    showNotification("Harap masukkan deskripsi", "error");
    return;
  }

  const newReport = {
    id: Date.now(),
    location,
    severity,
    description,
    time: "Baru saja",
    reporter: "Anda",
    verified: false,
    timestamp: new Date().toISOString(),
  };

  appState.reports.push(newReport);
  saveState();

  showNotification("Laporan berhasil dikirim! Terima kasih.", "success");
  hideModal("report");
}

/**
 * Submit location
 */
function submitLocation() {
  if (!elements.locationName || !elements.locationAddress) return;

  const name = elements.locationName.value.trim();
  const address = elements.locationAddress.value.trim();
  const severity = elements.locationSeverity
    ? elements.locationSeverity.value
    : "medium";

  if (!name || !address) {
    showNotification("Harap lengkapi semua field", "error");
    return;
  }

  const lat = -6.2088 + (Math.random() * 0.2 - 0.1);
  const lng = 106.8456 + (Math.random() * 0.2 - 0.1);

  const newLocation = {
    id: Date.now(),
    name,
    address,
    lat,
    lng,
    severity,
    reports: Math.floor(Math.random() * 20) + 1,
    averageSpeed:
      severity === "high"
        ? Math.floor(Math.random() * 20) + 5
        : severity === "medium"
        ? Math.floor(Math.random() * 20) + 20
        : Math.floor(Math.random() * 20) + 40,
    lastUpdated: "Baru saja",
    addedByUser: true,
  };

  appState.locations.push(newLocation);
  saveState();
  updateUI();

  addTrafficMarker(newLocation);

  showNotification("Lokasi berhasil ditambahkan", "success");
  hideModal("location");

  if (appState.map) {
    centerMapToLocation(lat, lng);
  }
}

/**
 * Show settings
 */
function showSettings() {
  const settingsHTML = `
        <div class="modal-content settings-modal">
            <div class="modal-header">
                <h3><i class="fas fa-cog"></i> Pengaturan Aplikasi</h3>
                <button class="close-modal">&times;</button>
            </div>
            <div class="modal-body">
                <div class="settings-group">
                    <h4><i class="fas fa-map"></i> Pengaturan Peta</h4>
                    <div class="setting-item">
                        <label>Update Interval:</label>
                        <select id="updateInterval">
                            <option value="30">30 detik</option>
                            <option value="60" selected>1 menit</option>
                            <option value="300">5 menit</option>
                            <option value="600">10 menit</option>
                        </select>
                    </div>
                    <div class="setting-item">
                        <label>Auto-refresh:</label>
                        <input type="checkbox" id="autoRefresh" checked>
                    </div>
                </div>
                
                <div class="settings-group">
                    <h4><i class="fas fa-route"></i> Pengaturan Rute</h4>
                    <div class="setting-item">
                        <label>Routing Service:</label>
                        <select id="routingService">
                            <option value="osm" selected>OSM Routing</option>
                            <option value="graphhopper">GraphHopper</option>
                        </select>
                    </div>
                </div>
                
                <div class="settings-group">
                    <h4><i class="fas fa-database"></i> Data Management</h4>
                    <div class="setting-buttons">
                        <button class="btn-danger" id="clearDataBtn">
                            <i class="fas fa-trash"></i> Hapus Semua Data
                        </button>
                        <button class="btn-secondary" id="exportDataBtn">
                            <i class="fas fa-download"></i> Export Data
                        </button>
                    </div>
                </div>
                
                <div class="app-info">
                    <h4><i class="fas fa-info-circle"></i> Informasi Aplikasi</h4>
                    <div class="info-grid">
                        <div class="info-item">
                            <span class="info-label">Versi:</span>
                            <span class="info-value">1.0.0 OSM</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Data Source:</span>
                            <span class="info-value">OpenStreetMap</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">API:</span>
                            <span class="info-value">Overpass API</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Update Terakhir:</span>
                            <span class="info-value">${new Date().toLocaleDateString(
                              "id-ID"
                            )}</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn-secondary" id="closeSettingsBtn">
                    <i class="fas fa-times"></i> Tutup
                </button>
                <button class="btn-primary" id="saveSettingsBtn">
                    <i class="fas fa-save"></i> Simpan
                </button>
            </div>
        </div>
    `;

  const modal = document.createElement("div");
  modal.className = "modal";
  modal.style.display = "flex";
  modal.innerHTML = settingsHTML;

  modal.querySelector(".close-modal").addEventListener("click", () => {
    document.body.removeChild(modal);
  });

  modal.querySelector("#closeSettingsBtn").addEventListener("click", () => {
    document.body.removeChild(modal);
  });

  modal.querySelector("#saveSettingsBtn").addEventListener("click", () => {
    const updateInterval = modal.querySelector("#updateInterval").value;
    const autoRefresh = modal.querySelector("#autoRefresh").checked;
    const routingService = modal.querySelector("#routingService").value;

    localStorage.setItem("updateInterval", updateInterval);
    localStorage.setItem("autoRefresh", autoRefresh);
    localStorage.setItem("routingService", routingService);

    CONFIG.trafficUpdateInterval = updateInterval * 1000;

    showNotification("Pengaturan berhasil disimpan", "success");
    document.body.removeChild(modal);
  });

  modal.querySelector("#clearDataBtn").addEventListener("click", clearAppData);
  modal.querySelector("#exportDataBtn").addEventListener("click", exportData);

  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });

  document.body.appendChild(modal);
}

// ========== UTILITY FUNCTIONS ==========

/**
 * Show notification
 */
function showNotification(message, type = "info") {
  if (!elements.notification) {
    const notification = document.createElement("div");
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 24px;
            border-radius: 8px;
            z-index: 10000;
            background: ${
              type === "success"
                ? "#06d6a0"
                : type === "error"
                ? "#ef476f"
                : "#4361ee"
            };
            color: white;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            animation: slideIn 0.3s ease;
        `;

    document.body.appendChild(notification);

    setTimeout(() => {
      if (notification.parentNode) {
        document.body.removeChild(notification);
      }
    }, 3000);

    return;
  }

  elements.notification.textContent = message;
  elements.notification.className = `notification ${type} show`;

  setTimeout(() => {
    if (elements.notification) {
      elements.notification.classList.remove("show");
    }
  }, 3000);
}

/**
 * Set loading state
 */
function setLoading(isLoading) {
  appState.isLoading = isLoading;

  if (isLoading) {
    document.body.classList.add("loading");
  } else {
    document.body.classList.remove("loading");
  }
}

/**
 * Get random item from array
 */
function getRandomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Get random severity
 */
function getRandomSeverity() {
  const severities = ["low", "medium", "high"];
  return severities[Math.floor(Math.random() * severities.length)];
}

/**
 * Get severity text
 */
function getSeverityText(severity) {
  return severity === "low"
    ? "Lancar"
    : severity === "medium"
    ? "Sedang"
    : "Macet";
}

/**
 * Get severity color
 */
function getSeverityColor(severity) {
  return severity === "high"
    ? "#ef476f"
    : severity === "medium"
    ? "#ffd166"
    : "#06d6a0";
}

/**
 * Update traffic button state
 */
function updateTrafficButtonState(isActive) {
  if (!elements.toggleTrafficLayer) return;

  const button = elements.toggleTrafficLayer;

  if (isActive) {
    button.classList.add("active");
    button.setAttribute("aria-pressed", "true");
    button.innerHTML =
      '<i class="fas fa-traffic-light"></i> <span class="sr-only">Traffic Layer aktif</span>';
    button.title = "Matikan Traffic Layer";
  } else {
    button.classList.remove("active");
    button.setAttribute("aria-pressed", "false");
    button.innerHTML =
      '<i class="fas fa-traffic-light"></i> <span class="sr-only">Traffic Layer tidak aktif</span>';
    button.title = "Nyalakan Traffic Layer";
  }
}

/**
 * Calculate distance between two coordinates
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Handle window resize
 */
function handleResize() {
  if (appState.map) {
    appState.map.invalidateSize();
  }
}

// ========== DATA MANAGEMENT ==========

/**
 * Load state from localStorage
 */
function loadState() {
  try {
    const savedTheme = localStorage.getItem("trafficAppTheme");
    if (savedTheme) {
      appState.theme = savedTheme;
    }

    const savedReports = localStorage.getItem("trafficAppReports");
    if (savedReports) {
      appState.reports = JSON.parse(savedReports);
    }

    const savedLocations = localStorage.getItem("trafficAppLocations");
    if (savedLocations) {
      appState.locations = JSON.parse(savedLocations);
    }

    debugLog("✅ State loaded from localStorage");
  } catch (error) {
    debugError("Error loading state:", error);
    appState.theme = "light";
    appState.reports = [];
    appState.locations = [];
  }
}

/**
 * Save state to localStorage
 */
function saveState() {
  try {
    localStorage.setItem("trafficAppTheme", appState.theme);
    localStorage.setItem("trafficAppReports", JSON.stringify(appState.reports));
    localStorage.setItem(
      "trafficAppLocations",
      JSON.stringify(appState.locations)
    );

    debugLog("✅ State saved to localStorage");
  } catch (error) {
    debugError("Error saving state:", error);
  }
}

/**
 * Load sample data
 */
function loadSampleData() {
  if (appState.locations.length === 0) {
    appState.locations = [...trafficData.sampleLocations];
  }

  if (appState.incidents.length === 0) {
    appState.incidents = [...trafficData.sampleIncidents];
  }

  saveState();
  debugLog("✅ Sample data loaded");
}

/**
 * Clear all app data
 */
function clearAppData() {
  if (
    confirm(
      "Apakah Anda yakin ingin menghapus semua data termasuk lokasi dan laporan?"
    )
  ) {
    localStorage.removeItem("trafficAppReports");
    localStorage.removeItem("trafficAppLocations");

    appState.reports = [];
    appState.locations = [];

    updateUI();
    showNotification("Semua data telah dihapus", "success");
  }
}

/**
 * Export data
 */
function exportData() {
  const data = {
    version: "1.0.0 OSM",
    exportedAt: new Date().toISOString(),
    locations: appState.locations,
    reports: appState.reports,
    incidents: appState.incidents,
    settings: {
      theme: appState.theme,
    },
  };

  const dataStr = JSON.stringify(data, null, 2);
  const dataUri =
    "data:application/json;charset=utf-8," + encodeURIComponent(dataStr);

  const linkElement = document.createElement("a");
  linkElement.setAttribute("href", dataUri);
  linkElement.setAttribute(
    "download",
    `traffic-osm-backup-${new Date().toISOString().slice(0, 10)}.json`
  );
  linkElement.click();

  showNotification("Data berhasil di-export", "success");
}

// ========== INITIALIZE APP ==========

// Export functions untuk debugging
window.debugLog = debugLog;
window.debugError = debugError;
window.showNotification = showNotification;
window.clearAppData = clearAppData;
window.exportData = exportData;
window.refreshTrafficData = refreshTrafficData;

// Initialize app
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}

// Add CSS animations
try {
  const style = document.createElement("style");
  style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes pulse {
        0% {
            box-shadow: 0 0 0 0 rgba(67, 97, 238, 0.7);
        }
        70% {
            box-shadow: 0 0 0 10px rgba(67, 97, 238, 0);
        }
        100% {
            box-shadow: 0 0 0 0 rgba(67, 97, 238, 0);
        }
    }
    
    .loading::after {
        content: '';
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 3px;
        background: linear-gradient(90deg, #4361ee, #7209b7);
        z-index: 10001;
        animation: loading 2s infinite;
    }
    
    @keyframes loading {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(100%); }
    }
    /* Screen-reader only helper */
    .sr-only {
      position: absolute !important;
      width: 1px !important;
      height: 1px !important;
      padding: 0 !important;
      margin: -1px !important;
      overflow: hidden !important;
      clip: rect(0, 0, 0, 0) !important;
      white-space: nowrap !important;
      border: 0 !important;
    }
`;
  document.head.appendChild(style);
} catch (e) {
  debugError("Could not inject dynamic styles:", e);
}
