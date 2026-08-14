/**
 * Synx Portal — Equipment Master Data & Form Presets Service
 * Manages standard dropdown options for EV Chargers, Breaker Brands, Conduits, and Scope Presets.
 */

export const DEFAULT_MASTER_DATA = {
  chargers: [
    { id: 'chg-01', name: 'EcoCharge 7kW AC Single Phase Wallbox', type: 'AC', capacity: '7kW', outputCurrent: '32A', voltage: '230V Single Phase' },
    { id: 'chg-02', name: 'EcoCharge Pro 11kW AC Three Phase Hub', type: 'AC', capacity: '11kW', outputCurrent: '16A Three Phase', voltage: '400V 3-Phase' },
    { id: 'chg-03', name: 'EcoCharge Ultra 22kW AC Fast Commercial', type: 'AC', capacity: '22kW', outputCurrent: '32A Three Phase', voltage: '400V 3-Phase' },
    { id: 'chg-04', name: 'EcoWorks Fleet 50kW DC Fast Charger', type: 'DC', capacity: '50kW', outputCurrent: '125A DC', voltage: '500V DC CCS2' },
    { id: 'chg-05', name: 'EcoWorks Fleet Ultra 120kW DC Supercharger', type: 'DC', capacity: '120kW', outputCurrent: '300A DC Dual CCS2', voltage: '800V DC' }
  ],
  breakers: [
    { id: 'brk-01', brand: 'Schneider Electric', rating: '32A', pole: '2-Pole', mounting: 'Bolt-on' },
    { id: 'brk-02', brand: 'ABB', rating: '40A', pole: '2-Pole', mounting: 'DIN Rail' },
    { id: 'brk-03', brand: 'General Electric (GE)', rating: '63A', pole: '3-Pole', mounting: 'Bolt-on' },
    { id: 'brk-04', brand: 'Mitsubishi Electric', rating: '100A', pole: '3-Pole', mounting: 'Plug-in' },
    { id: 'brk-05', brand: 'Siemens', rating: '225A', pole: '3-Pole', mounting: 'Bolt-on Main MCCB' }
  ],
  conduits: [
    { id: 'cnd-01', name: 'uPVC Heavy Duty Conduit Pipe (20mm / 25mm)', material: 'PVC', rating: 'Schedule 40' },
    { id: 'cnd-02', name: 'Electrical Metallic Tubing (EMT Galvanized)', material: 'Steel', rating: 'UL Listed ANSI C80.3' },
    { id: 'cnd-03', name: 'Intermediate Metal Conduit (IMC Threaded)', material: 'Heavy Steel', rating: 'UL 1242' },
    { id: 'cnd-04', name: 'Liquid-Tight Flexible Metal Conduit (LFMC)', material: 'Flex PVC Coated Steel', rating: 'IP67 Waterproof' }
  ],
  scopes: [
    'Residential EV Charger Ocular Audit',
    'Commercial Fleet Parking Substation Site Inspection',
    'EV Infrastructure Electrical Feeder Audit',
    'Full Installation & Commissioning Handover',
    'Annual Preventive Maintenance & Thermal Scan Audit'
  ]
};

class MasterDataService {
  constructor() {
    this.storageKey = 'synx_master_equipment_catalog';
    this.initCatalog();
  }

  initCatalog() {
    if (!localStorage.getItem(this.storageKey)) {
      localStorage.setItem(this.storageKey, JSON.stringify(DEFAULT_MASTER_DATA));
    }
  }

  getCatalog() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      return raw ? JSON.parse(raw) : DEFAULT_MASTER_DATA;
    } catch (e) {
      return DEFAULT_MASTER_DATA;
    }
  }

  saveCatalog(catalog) {
    localStorage.setItem(this.storageKey, JSON.stringify(catalog));
  }

  addCharger(chargerData) {
    const catalog = this.getCatalog();
    const newCharger = {
      id: 'chg-' + Date.now(),
      ...chargerData
    };
    catalog.chargers.unshift(newCharger);
    this.saveCatalog(catalog);
    return newCharger;
  }

  addBreaker(breakerData) {
    const catalog = this.getCatalog();
    const newBreaker = {
      id: 'brk-' + Date.now(),
      ...breakerData
    };
    catalog.breakers.unshift(newBreaker);
    this.saveCatalog(catalog);
    return newBreaker;
  }
}

export const masterDataService = new MasterDataService();
