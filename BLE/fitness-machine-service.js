// ========================================================================
// fitness-machine-service.js
//
// BLE Fitness Machine Service 0x1826
//
// The Fitness Machine Service (FTMS) exposes training-related data in the
// sports and fitness environment, which allows a Client to collect
// training data while a user is exercising with a fitness machine (Server).
//
// Spec: https://www.bluetooth.com/specifications/gatt/services/
// https://www.bluetooth.org/DocMan/handlers/DownloadDoc.ashx?doc_id=423422
//
// ========================================================================

const Bleno = require('bleno')
const FitnessControlPoint = require('./fitness-control-point')
const IndoorBikeDataCharacteristic = require('./indoor-bike-data')
const StaticReadCharacteristic = require('./static-read-characteristic')
const FitnessMachineStatusCharacteristic = require('./fitness-machine-status')

class FitnessMachineService extends Bleno.PrimaryService {
  constructor (callback) {
    var controlPoint = new FitnessControlPoint(callback)
    var indoorBikeData = new IndoorBikeDataCharacteristic()
    var fitnessMachineStatus = new FitnessMachineStatusCharacteristic()

    super({
      uuid: '1826',
      characteristics: [
        new StaticReadCharacteristic('2ACC', 'Fitness Machine Feature', [
          // section 4.3 of FTMS protocol
          // 4 bytes Fitness Machine Features - 4 bytes Target Setting Features
          0x02, // b1: cadence - check -> b0: average speed, b3: inclination, b5: pace
          0x44, // b10: hr measurement, b14: power measurement
          0x00,
          0x00,
          0x0A, // b1, inclination target, b3: power target
          0x20, // b13: indoor bike simulation
          0x00,
          0x00
        ]),
        indoorBikeData,
        controlPoint,
        fitnessMachineStatus,
        new StaticReadCharacteristic('2AD8', 'SupportedPowerRange', [
          // section 4.3 of FTMS protocol
          // 25 - 800 with 5 watts step
          // 0x0019 0x0320 0x0005
          0x19,
          0x00,
          0x20,
          0x03,
          0x05,
          0x00
        ])
        ]
    })

    this.indoorBikeData = indoorBikeData
  }

  /*
   * Transfer event from USB to the given characteristics
   */
  notify (event) {
    this.indoorBikeData.notify(event)
  }
}

module.exports = FitnessMachineService
