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
