// ========================================================================
// battery-service.js
//
// BLE Battery Service 0x180F
//
// The Battery Service exposes the Battery State and Battery Level of a 
// single battery or set of batteries in a device.
//
// Spec: https://www.bluetooth.com/specifications/gatt/services/
// https://www.bluetooth.org/docman/handlers/downloaddoc.ashx?doc_id=245138
//
// ========================================================================

const bleno = require('bleno');
const BatteryLevelCharacteristic = require('./battery-level-characteristic');

const StaticReadCharacteristic = require('./static-read-characteristic');

const BlenoPrimaryService = bleno.PrimaryService;

class BatteryService extends BlenoPrimaryService {
  constructor() {
    let batteryMeasurement = new BatteryLevelCharacteristic();
    
    super({
      uuid: '180F',
      characteristics: [
        batteryMeasurement
      ]
    });
    this.batteryMeasurement = batteryMeasurement
  }

  notify (event) {
    this.batteryMeasurement.notify(event);
    return this.RESULT_SUCCESS;
  };
}

module.exports = BatteryService;
