// ========================================================================
// running-speed-cadence-measurement-characteristic.js
//
// BLE Running Speed Cadence Measurement Characteristics 0x2A53
//
// Spec: https://www.bluetooth.com/specifications/gatt/characteristics/
//
// ========================================================================

var logger = require('../lib/logger')
var Bleno = require('bleno');
var Flags = require('../lib/flags');
const config = require('config-yml') // Use config for yaml config files in Node.js projects

var DEBUG = config.globals.debugBLE;


// Spec
//https://developer.bluetooth.org/gatt/characteristics/Pages/CharacteristicViewer.aspx?u=org.bluetooth.characteristic.cycling_power_measurement.xml

class RSCMeasurementCharacteristic extends  Bleno.Characteristic {
 
  constructor() {
    super({
      uuid: '2A53',
      value: null,
      properties: ['notify'],
      descriptors: [
        new Bleno.Descriptor({ // Characteristic User Description
					uuid: '2901',
					value: 'Running Speed And Cadence'
				}),
        new Bleno.Descriptor({ // Client Characteristic Configuration
          uuid: '2902',
          value: Buffer.alloc(2)
        })
      ]
    });

    this.rscFlags = new Flags([
      'stride_length',
			'total_distance',
			'walk_run'
    ]);
    
    this._updateValueCallback = null;  
  }

  onSubscribe(maxValueSize, updateValueCallback) {
    DEBUG('[RSCMeasurementCharacteristic] client subscribed to PM');
    this._updateValueCallback = updateValueCallback;
    return this.RESULT_SUCCESS;
  };

  onUnsubscribe() {
    DEBUG('[RSCMeasurementCharacteristic] client unsubscribed from PM');
    this._updateValueCallback = null;
    return this.RESULT_UNLIKELY_ERROR;
  };

  notify(event) {
    if (! (('speed' in event) && ('cadence' in event)) ) {
      // Speed and Cadence are mandatory so ignore events with no speed and no cadence data
      return this.RESULT_SUCCESS;;
    }

    let buffer = new Buffer(10);
    let offset = 0; 

    // flags
    buffer.writeUInt8(this.rscFlags.from(event), offset);
    offset += 1;

    // Unit is in m/s with a resolution of 1/256 s
    // We assume the units have already been converted
    // from MPH or KMH to mps
    DEBUG("Running Speed: " + event.speed);
    buffer.writeUInt16LE(Math.floor(event.speed * 256), offset);
    offset += 2;
    
    DEBUG("Running Cadence: " + event.cadence);
    buffer.writeUInt8(Math.floor(event.cadence), offset);
    offset += 1;

    if( this.rscFlags.isSet('stride_length') ) {
      buffer.writeUInt16LE(Math.floor(event.stride_length * 100), offset);
      offset += 2;
    }

    if( this.rscFlags.isSet('total_distance') ) {
      buffer.writeUInt32LE(Math.floor(event.total_distance * 10), offset);
      offset += 4;
    }

    if (this._updateValueCallback) {
      this._updateValueCallback(buffer.slice(0, offset));
    }

    return this.RESULT_SUCCESS;
  }
  
  
};

module.exports = RSCMeasurementCharacteristic;
