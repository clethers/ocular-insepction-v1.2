/**
 * Sample dataset extracted from the provided Ocular Inspection Form (Esperanza Bacolod)
 * Used for 1-click field preset loading in Synx field app.
 */

export const SAMPLE_OCULAR_DATA = {
  clientName: "Esperanza Bacolod",
  dateTime: "2026-07-07T15:00",
  dateTimeDisplay: "July 7, 2026 3:00 PM",
  locationAddress: "Block 7 Lot 9 italia st Trevi Exec Village Brgy Concepcion 1 Marikina City",
  rnNo: "RN128091526",
  installationNo: "INSTCOM_1583581",
  timeStart: "03:00 PM",
  timeEnd: "04:30 PM",
  scopeOfWorks: "Revisit",
  contactNo: "0917-555-9821",

  // Incoming Feeder
  voltageSystem: "220_ll", // 220 VAC, 1 Ø, L-L
  voltageSpecify: "",

  // Panelboard
  mainBreaker: "60A 2P 230V Bolt-On Molded Case",
  noOfBranches: "8 Circuits",
  spareBreaker: "YES",
  spaceProvision: "YES",
  breakerBrandType: "Schneider Bolt-On",
  breakerMounting: "BOLT-ON",
  groundingSystem: "NO",
  groundingRodLocation: "Beside main distribution box, near perimeter wall (soft soil area)",

  // EV Charger Checklist
  chargerLocation: "Garage Left Wall (Near Main Gate)",
  estimateDistance: "14 Meters",
  conduitPvc: "12",
  conduitEmt: "0",
  conduitImc: "0",
  liquidTightFittings: "YES",
  liquidTightQty: "4",
  bodyLb: "2",
  bodyLr: "1",
  bodyLl: "0",
  bodyT: "0",

  // Boxes
  boxUtility: "2",
  boxSquare: "4",
  boxOctagon: "2",
  boxJunction: "1",
  boxOthers: "Weatherproof Enclosure IP65",

  // Other Works
  workRetrofitting: "Panelboard busbar extension for dedicated EV breaker",
  workReplacement: "Main grounding wire upgrade to 14mm² THHN",
  workNewInstallation: "7.4kW Wallbox Pulsar Plus EV Charger",

  // Ocular Site Photos
  photos: {
    proposed_layout: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200"><rect width="300" height="200" fill="%230b1220"/><rect x="20" y="20" width="260" height="160" fill="none" stroke="%2338bdf8" stroke-width="2" stroke-dasharray="6 4"/><line x1="20" y1="100" x2="280" y2="100" stroke="%2338bdf8" stroke-width="1.5"/><line x1="150" y1="20" x2="150" y2="180" stroke="%2338bdf8" stroke-width="1.5"/><rect x="40" y="40" width="80" height="40" fill="%231e293b" stroke="%2338bdf8" stroke-width="1"/><text x="80" y="65" fill="%2338bdf8" font-family="sans-serif" font-size="12" text-anchor="middle" font-weight="bold">PARKING SLOT</text><rect x="170" y="120" width="90" height="40" fill="%231e293b" stroke="%23eab308" stroke-width="1.5"/><text x="215" y="145" fill="%23eab308" font-family="sans-serif" font-size="11" text-anchor="middle" font-weight="bold">EV CHARGER</text><text x="150" y="193" fill="%2394a3b8" font-family="sans-serif" font-size="10" text-anchor="middle">PROPOSED SITE LAYOUT PLAN</text></svg>',
    tapping_point: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200"><rect width="300" height="200" fill="%230b1220"/><rect x="40" y="30" width="220" height="140" fill="%231e293b" stroke="%2322c55e" stroke-width="2"/><text x="150" y="55" fill="%234ade80" font-family="sans-serif" font-size="13" text-anchor="middle" font-weight="bold">MAIN PANEL TAPPING POINT</text><rect x="70" y="70" width="60" height="70" fill="%230f172a" stroke="%2338bdf8" stroke-width="1.5"/><text x="100" y="110" fill="%2338bdf8" font-family="sans-serif" font-size="11" text-anchor="middle">60A MCB</text><rect x="170" y="70" width="60" height="70" fill="%230f172a" stroke="%23eab308" stroke-width="1.5"/><text x="200" y="105" fill="%23eab308" font-family="sans-serif" font-size="10" text-anchor="middle">SPARE 40A</text><text x="200" y="120" fill="%23eab308" font-family="sans-serif" font-size="9" text-anchor="middle">2P 230V</text><text x="150" y="190" fill="%2394a3b8" font-family="sans-serif" font-size="10" text-anchor="middle">VERIFIED 220V FEEDER TAP</text></svg>',
    wiring_conduit: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200"><rect width="300" height="200" fill="%230b1220"/><path d="M 30 150 L 120 150 L 120 60 L 270 60" fill="none" stroke="%2338bdf8" stroke-width="6" stroke-linecap="round"/><circle cx="120" cy="150" r="8" fill="%23eab308"/><circle cx="120" cy="60" r="8" fill="%23eab308"/><text x="120" y="170" fill="%2394a3b8" font-family="sans-serif" font-size="10" text-anchor="middle">LB Fitting</text><text x="120" y="45" fill="%2394a3b8" font-family="sans-serif" font-size="10" text-anchor="middle">LL Fitting</text><text x="150" y="110" fill="%234ade80" font-family="sans-serif" font-size="12" text-anchor="middle" font-weight="bold">14m PVC CONDUIT ROUTE (20mm)</text><text x="150" y="190" fill="%2394a3b8" font-family="sans-serif" font-size="10" text-anchor="middle">WALL %26 CEILING RUN LAYOUT</text></svg>',
    ev_charging_location: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200"><rect width="300" height="200" fill="%230b1220"/><rect x="100" y="30" width="100" height="130" rx="15" fill="%231e293b" stroke="%2322c55e" stroke-width="2.5"/><circle cx="150" cy="75" r="22" fill="%230f172a" stroke="%234ade80" stroke-width="2"/><text x="150" y="80" fill="%234ade80" font-family="sans-serif" font-size="14" text-anchor="middle" font-weight="bold">EV</text><text x="150" y="125" fill="%23f8fafc" font-family="sans-serif" font-size="11" text-anchor="middle" font-weight="bold">7.4kW AC</text><text x="150" y="140" fill="%2394a3b8" font-family="sans-serif" font-size="9" text-anchor="middle">GARAGE WALL</text><text x="150" y="190" fill="%2394a3b8" font-family="sans-serif" font-size="10" text-anchor="middle">DESIGNATED CHARGER LOCATION</text></svg>'
  },

  // Inspector & Witness
  inspectedByName: "Engr. Marco Santos, REE",
  witnessedByName: "Esperanza Bacolod"
};

export const SAMPLE_INSTALLATION_DATA = {
  clientName: "Esperanza Bacolod",
  rnNo: "RN128091526",
  installationNo: "INSTCOM_1583581",
  dateInstalled: "2026-07-10",
  installerName: "Tech. Dave Ramirez",
  evChargerSerial: "WB-2026-9812401",
  evChargerModel: "Wallbox Pulsar Plus 7.4kW Type 2",
  breakerInstalled: "Schneider Electric 40A 2P 30mA RCD",
  cableGaugeUsed: "8.0 mm² THHN/THWN-2 In 20mm PVC Conduit",
  groundingResistance: "4.2 Ohms",
  insulationTest: "500V DC / > 100 MΩ",
  voltageNoLoad: "228.4 VAC",
  voltageFullLoad: "224.1 VAC",
  testChargingStatus: "PASS - Charging at 32A Constant",
  notes: "Installation complete and verified safe. Client oriented on LED status indicators and smartphone app syncing.",
  clientSignerName: "Esperanza Bacolod",
  engineerSignerName: "Engr. Marco Santos, REE"
};

export const READY_INSTALLATIONS_PRESETS = [
  {
    ...SAMPLE_OCULAR_DATA,
    id: "RN128091526",
    status: "READY_FOR_INSTALLATION",
    dateTimeDisplay: "July 7, 2026 3:00 PM"
  },
  {
    clientName: "Makati Tech Tower (Commercial Plaza)",
    dateTime: "2026-08-01T10:30",
    dateTimeDisplay: "August 1, 2026 10:30 AM",
    locationAddress: "6789 Ayala Avenue, Salcedo Village, Makati City",
    rnNo: "RN13904812",
    installationNo: "INSTCOM_2049182",
    timeStart: "10:30 AM",
    timeEnd: "12:00 PM",
    scopeOfWorks: "New Commercial Installation",
    contactNo: "02-8812-4091",
    voltageSystem: "220_ll",
    mainBreaker: "100A 3P 230V Bolt-On",
    noOfBranches: "16 Circuits",
    spareBreaker: "YES",
    spaceProvision: "YES",
    breakerBrandType: "GE Bolt-On Commercial",
    breakerMounting: "BOLT-ON",
    groundingSystem: "YES",
    groundingRodLocation: "Existing Building Earth Grid",
    chargerLocation: "Basement 2 Executive EV Parking Slot #14",
    estimateDistance: "22 Meters",
    conduitPvc: "0",
    conduitEmt: "18",
    conduitImc: "4",
    liquidTightFittings: "YES",
    liquidTightQty: "6",
    boxUtility: "4",
    boxSquare: "6",
    boxOctagon: "0",
    boxJunction: "2",
    boxOthers: "IP66 Junction Box with DIN Rail",
    workRetrofitting: "Sub-panel feeder tapped into B2 Riser",
    workReplacement: "None",
    workNewInstallation: "22kW Commercial Dual Type 2 EV Charger",
    inspectedByName: "Engr. Marco Santos, REE",
    witnessedByName: "Arch. Rafael Cruz (Building Admin)",
    status: "READY_FOR_INSTALLATION"
  },
  {
    clientName: "Ayala Alabang Residence (Dr. Aris Sison)",
    dateTime: "2026-08-05T14:00",
    dateTimeDisplay: "August 5, 2026 2:00 PM",
    locationAddress: "142 Champaca Street, Ayala Alabang Village, Muntinlupa City",
    rnNo: "RN14091823",
    installationNo: "INSTCOM_3091824",
    timeStart: "02:00 PM",
    timeEnd: "03:15 PM",
    scopeOfWorks: "Residential Single Charger",
    contactNo: "0918-991-0023",
    voltageSystem: "220_ll",
    mainBreaker: "75A 2P Bolt-On",
    noOfBranches: "12 Circuits",
    spareBreaker: "YES",
    spaceProvision: "YES",
    breakerBrandType: "Schneider Bolt-On",
    breakerMounting: "BOLT-ON",
    groundingSystem: "NO",
    groundingRodLocation: "Carport garden bed, 5/8 inch copper rod 3m",
    chargerLocation: "Carport Wall Beside Main Entrance",
    estimateDistance: "9 Meters",
    conduitPvc: "8",
    conduitEmt: "0",
    conduitImc: "0",
    liquidTightFittings: "YES",
    liquidTightQty: "2",
    boxUtility: "2",
    boxSquare: "2",
    boxOctagon: "1",
    boxJunction: "1",
    boxOthers: "Weatherproof Enclosure",
    workRetrofitting: "Dedicated EV circuit installation",
    workReplacement: "Upgrade grounding rod",
    workNewInstallation: "11kW Smart EV Wallbox",
    inspectedByName: "Engr. Marco Santos, REE",
    witnessedByName: "Dr. Aris Sison",
    status: "READY_FOR_INSTALLATION"
  }
];

