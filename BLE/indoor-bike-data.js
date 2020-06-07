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
    message(`client subscribed ${maxValueSize}`)
    this._updateValueCallback = updateValueCallback
    return this.RESULT_SUCCESS
  }

  onUnsubscribe () {
    message('client unsubscribed')
    this._updateValueCallback = null
    return this.RESULT_UNLIKELY_ERROR
  }

  notify (event) {
    var line = 'notify'
    if (!('power' in event) && !('speed' in event) && !('rpm' in event) && !('hr' in event)) {
      // ignore events with no data
      return this.RESULT_SUCCESS
    }
    var buffer = new Buffer.alloc(10)
    var flags = 0x0005 // 0 = not present except b0 instantaneous speed and b2 instantaneous cadence when 0 = present
    var flags = 0x0000 // 0 = not present except b0 instantaneous speed and b2 instantaneous cadence when 0 = present

    var index = 2

    if ('speed' in event) var speed = event.speed
    else speed = 0
    line = line + ` speed: ${speed}km/h`
    buffer.writeUInt16LE(speed * 100, index) // C1: instantaneous speed - Kilometer per hour with a resolution of 0.01
    flags &= 0xFFFE // clear b0
    index += 2

    if ('rpm' in event) {
      var rpm = event.rpm
      line = line + ` rpm: ${rpm}`
      buffer.writeUInt16LE(rpm * 2, index) // C3: instantaneous cadence - 1/minute with a resolution of 0.5
      flags &= 0xFFFB // clear b2
      flags |= 0x0004 // set b2
      index += 2
    }

    if ('power' in event) var power = event.power
    else power = 0
    line = line + ` power: ${power}W`
    buffer.writeInt16LE(power, index) // C7: instantaneous power - Watts with a resolution of 1
    flags |= 0x0040 // set b6
    index += 2

    if ('hr' in event) {
      var hr = event.hr
      line = line + ` hr: ${hr}bpm`
      buffer.writeUInt16LE(hr, index) // C10: heart rate - Beats per minute with a resolution of 1
      flags |= 0x0200 // set b9
      index += 2
    }

    buffer.writeUInt16LE(flags, 0)

    line = line + ` [${buffer.toString('hex')}]`

    if (this._updateValueCallback) {
      message(line)
      this._updateValueCallback(buffer)
    } else {
      message(`nobody is listening [${buffer.toString('hex')}]`, 'warn')
    }
    return this.RESULT_SUCCESS
  }
}

module.exports = IndoorBikeDataCharacteristic
