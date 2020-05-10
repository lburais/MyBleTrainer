// ========================================================================
// battery-level-characteristic.js
//
// BLE Battery Level Chracteristics 0x2A19
//
// Spec: https://www.bluetooth.com/specifications/gatt/characteristics/
//
// ========================================================================

var logger = require('../lib/logger')
var Bleno = require('bleno');
const config = require('config-yml'); // Use config for yaml config files in Node.js projects
var DEBUG = config.globals.debugBLE;

class BatteryLevelCharacteristic extends Bleno.Characteristic {
    
  constructor () {
    super({
      uuid: '2A19',
      value: null,
      properties: ['read'],
      descriptors: [
        new Bleno.Descriptor({ // Characteristic User Description
          uuid: '2901',
          value: 'Battery level between 0 and 100 percent'
        }),
        new Bleno.Descriptor({ // Characteristic Presentation Format
          uuid: '2904',
          value: Buffer.from([0x04, 0x01, 0x27, 0xAD, 0x01, 0x00, 0x00])
        })
      ]
    });
    this._Callback = null
  }

  onReadRequest (offset, Callback) {
    if (DEBUG) logger.info('[battery-level-characteristic.js] - read')
    this._Callback = Callback;
    var data = new Buffer.from([100])
    this._Callback(this.RESULT_SUCCESS, data)    
  }
}

module.exports = BatteryLevelCharacteristic;
