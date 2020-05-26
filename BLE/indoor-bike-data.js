// ========================================================================
// indoor-bike-data-characteristic.js
//
// BLE Indoor Bike Data Characteristics 0x2AD2
//
// Spec: https://www.bluetooth.com/specifications/gatt/characteristics/
//
// ========================================================================

var message = require('../lib/message')
var Bleno = require('bleno')

class IndoorBikeDataCharacteristic extends Bleno.Characteristic {
  constructor () {
    super({
      uuid: '2AD2',
      value: null,
      properties: ['notify'],
      descriptors: [
        new Bleno.Descriptor({ //   Client Characteristic Configuration
          uuid: '2902',
          value: Buffer.alloc(2)
        })
      ]
    })
    this._updateValueCallback = null
  }

  onSubscribe (maxValueSize, updateValueCallback) {
    message('client subscribed')
    this._updateValueCallback = updateValueCallback
    return this.RESULT_SUCCESS
  }

  onUnsubscribe () {
    message('client unsubscribed')
    this._updateValueCallback = null
    return this.RESULT_UNLIKELY_ERROR
  }

  notify (event) {
    var line = "notify"
    if (!('power' in event) && !('hr' in event)) {
      // ignore events with no power and no hr data
      return this.RESULT_SUCCESS
    }
    var buffer = new Buffer.alloc(10) // changed buffer size from 10 to 8 because of deleting hr
    buffer.writeUInt8(0x44, 0) // 0100 0100 - rpm + power (speed is always on)
    buffer.writeUInt8(0x02, 1) // deleted hr, so all bits are 0

    var index = 2

    var speed = 0
    if ('speed' in event) {
      var speed = event.speed
      line = line + ` speed: ${speed}km/h`
    }
    buffer.writeUInt16LE(speed, index) // index starts with 2
    index += 2

    var rpm = 0
    if ('rpm' in event) {
      rpm = event.rpm
      line = line + ` rpm: ${rpm}`
    }
    buffer.writeUInt16LE(rpm * 2, index) // index is now 4
    index += 2

    var power = 0
    if ('power' in event) {
      power = event.power
      line = line + ` power: ${power}W`
    }
    buffer.writeInt16LE(power, index) // index is now 6
    index += 2 // this might have caused the mixup with hr value in power, if one value is missing, then its shifted to the next 2 bytes

    var hr = 0
    if ('hr' in event) {
      hr = event.hr
      line = line + ` hr: ${hr}bpm`
    }
    buffer.writeUInt16LE(hr, index)
    index += 2

    if (this._updateValueCallback) {
      message(line)
      this._updateValueCallback(buffer)
    } else {
    message('nobody is listening', 'warn')
    }
    return this.RESULT_SUCCESS
  }
}

module.exports = IndoorBikeDataCharacteristic
