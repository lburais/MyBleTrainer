// ========================================================================
// cycling-power-service.js
//
// BLE Cycling Power Service 0x1818
//
// The Cycling Power (CP) Service exposes power- and force-related data 
// and optionally speed- and cadence-related data from a Cycling Power 
// sensor (Server) intended for sports and fitness applications.
//
// Spec: https://www.bluetooth.com/specifications/gatt/services/
// https://www.bluetooth.org/DocMan/handlers/DownloadDoc.ashx?doc_id=412770
//
// ========================================================================

const Bleno = require('bleno');
const CyclingPowerMeasurementCharacteristic = require('./cycling-power-measurement-characteristic');
const StaticReadCharacteristic = require('./static-read-characteristic');

class CyclingPowerService extends Bleno.PrimaryService {
  constructor () {
    let powerMeasurement = new CyclingPowerMeasurementCharacteristic();
    super({
      // uuid: '1818',
      uuid: '1515',
      characteristics: [
        powerMeasurement,
        new StaticReadCharacteristic('2A65', 'Cycling Power Feature', [0x08, 0, 0, 0]), // 0x08 - crank revolutions
        new StaticReadCharacteristic('2A5D', 'Sensor Location', [13]) // 13 = rear hub
      ]
    });

    this.powerMeasurement = powerMeasurement
  }

  notify (event) {
    this.powerMeasurement.notify(event);
    return this.RESULT_SUCCESS;
  };
}

module.exports = CyclingPowerService;
