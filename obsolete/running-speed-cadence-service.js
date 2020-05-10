// ========================================================================
// running-speed-cadence-service.js
//
// BLE Running Speed and Cadence Service 0x1814
//
// The Running Speed and Cadence (RSC) Service exposes speed, cadence and 
// other data related to fitness applications such as the stride length and 
// the total distance the user has traveled while using the 
// Speed and Cadence Sensor (Server).
//
// Spec: https://www.bluetooth.com/specifications/gatt/services/
// https://www.bluetooth.org/docman/handlers/downloaddoc.ashx?doc_id=435661
//
// ========================================================================

const Bleno = require('bleno');

const RSCMeasurementCharacteristic = require('./running-speed-cadence-measurement-characteristic');
const StaticReadCharacteristic = require('./static-read-characteristic');

class RSCService extends Bleno.PrimaryService {

  constructor() {
    let rscMeasurement = new RSCMeasurementCharacteristic();
    super({
        uuid: '1814',
        characteristics: [
          rscMeasurement,


          // 16 Bit Mandatory Field
          // 0x01 - Instantaneous Stride Length Measurement Supported
          // 0x02 - Total Distance Measurement Supported
          // 0x04 - Walking or Running Status Supported
          // 0x08 - Calibration Procedure Supported
          // 0x10 - Multiple Sensor Locations Supported
          new StaticReadCharacteristic('2A54', 'RSC Feature', [0x00, 0, 0, 0]),

          // Sensor location
          // 0	Other
          // 1	Top of shoe
          // 2	In shoe
          // 3	Hip
          // 4	Front Wheel
          // 5	Left Crank
          // 6	Right Crank
          // 7	Left Pedal
          // 8	Right Pedal
          // 9	Front Hub
          // 10	Rear Dropout
          // 11	Chainstay
          // 12	Rear Wheel
          // 13	Rear Hub
          // 14	Chest
          // 15	Spider
          // 16	Chain Ring
          // 17 - 255	Reserved for future use
          new StaticReadCharacteristic('2A5D', 'Sensor Location', [0]) // Other
        ]
    });

    this.rscMeasurement = rscMeasurement;
  }

  notify(event) {
    this.rscMeasurement.notify(event);
    return this.RESULT_SUCCESS;
  };
}

module.exports = RSCService;
