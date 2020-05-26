// ========================================================================
// fitness-control-point-characteristic.js
//
// BLE Fitness Control Point Characteristics 0x2AD9
//
// Spec: https://www.bluetooth.com/specifications/gatt/characteristics/
//
// ========================================================================

var message = require('../lib/message')
var Bleno = require('bleno')

// Spec
// Control point op code
var ControlPointOpCode = {
  requestControl: 0x00,
  resetControl: 0x01,
  setTargetSpeed: 0x02,
  setTargetInclincation: 0x03,
  setTargetResistanceLevel: 0x04,
  setTargetPower: 0x05,
  setTargetHeartRate: 0x06,
  startOrResume: 0x07,
  stopOrPause: 0x08,
  setTargetedExpendedEnergy: 0x09,
  setTargetedNumberOfSteps: 0x0A,
  setTargetedNumberOfStrides: 0x0B,
  setTargetedDistance: 0x0C,
  setTargetedTrainingTime: 0x0D,
  setTargetedTimeInTwoHeartRateZones: 0x0E,
  setTargetedTimeInThreeHeartRateZones: 0x0F,
  setTargetedTimeInFiveHeartRateZones: 0x10,
  setIndoorBikeSimulationParameters: 0x11,
  setWheelCircumference: 0x12,
  spinDownControl: 0x13,
  setTargetedCadence: 0x14,
  responseCode: 0x80
}

var ResultCode = {
  reserved: 0x00,
  success: 0x01,
  opCodeNotSupported: 0x02,
  invalidParameter: 0x03,
  operationFailed: 0x04,
  controlNotPermitted: 0x05
}

class FitnessControlPoint extends Bleno.Characteristic {
  constructor (callback) {
    super({
      uuid: '2AD9',
      value: null,
      properties: ['write'],
      descriptors: [
        new Bleno.Descriptor({ // Client Characteristic Configuration
          uuid: '2902',
          value: Buffer.alloc(2)
        })
      ]
    })

    this.underControl = false

    if (!callback) {
      throw 'callback cant be null'
    }
    this.serverCallback = callback
  }

  // Follow Control Point instruction from the client
  //onWriteRequest (data, offset, withoutResponse, callback) {
  onWriteRequest (data, offset, withoutResponse, callback) {

    var state = data.readUInt8(0)
    message('data ' +  data.toString('hex') + ' control: ' + this.underControl, 'debug')
    switch (state) {
      case ControlPointOpCode.requestControl:
        message('ControlPointOpCode.requestControl.')
        if (!this.underControl) {
          if (this.serverCallback('control')) {
            message('control succeed.')
            this.underControl = true
            callback(this.buildResponse(state, ResultCode.success)) // ok
          } else {
            message('control aborted.', 'error')
            callback(this.buildResponse(state, ResultCode.operationFailed))
          }
        } else {
          message('allready controled.', 'warn')
          callback(this.buildResponse(state, ResultCode.controlNotPermitted))
        }
        break

      case ControlPointOpCode.resetControl:
        message('ControlPointOpCode.resetControl.')
        if (this.underControl) {
          // reset the bike
          if (this.serverCallback('reset')) {
            this.underControl = false
            message('control reset controled.')
            callback(this.buildResponse(state, ResultCode.success)) // ok
          } else {
            message('control reset failed.', 'error')
            callback(this.buildResponse(state, ResultCode.operationFailed))
          }
        } else {
          message('reset without control.', 'warn')
          callback(this.buildResponse(state, ResultCode.controlNotPermitted))
        }
        break

      case ControlPointOpCode.setTargetPower: // this is ERG MODE
        global.globalmode = 'ERG' // this is overriding the toggles from webserver
        global.globalswitch = 'Power' // this is overriding the toggles from webserver
        message('ControlPointOpCode.setTargetPower.', 'debug')
        if (this.underControl) {
          var watt = data.readUInt16LE(1)
          message(`Target Power set to: ${watt}`)
          if (this.serverCallback('power', watt)) {
            callback(this.buildResponse(state, ResultCode.success)) // ok
            // } else {
            // message('setTarget failed');
            // callback(this.buildResponse(state, ResultCode.operationFailed));
          }
        } else {
          message('setTargetPower without control.', 'warn')
          callback(this.buildResponse(state, ResultCode.controlNotPermitted))
        }
        break

      case ControlPointOpCode.startOrResume:
        message('ControlPointOpCode.startOrResume')
        callback(this.buildResponse(state, ResultCode.success))
        break

      case ControlPointOpCode.stopOrPause:
        message('ControlPointOpCode.stopOrPause')
        callback(this.buildResponse(state, ResultCode.success))
        break

      case ControlPointOpCode.setIndoorBikeSimulationParameters: // this is SIM MODE
        message('ControlPointOpCode.setIndoorBikeSimulationParameters', 'debug')
        var windspeed = data.readInt16LE(1) * 0.001
        var grade = data.readInt16LE(3) * 0.01
        var crr = data.readUInt8(5) * 0.0001
        var cw = data.readUInt8(6) * 0.01
        message(`setIndoorBikeSimulationParameters - windspeed: ${windspeed}, grade: ${grade}, crr: ${crr} and cw: ${cw}`)
        if (this.serverCallback('simulation', windspeed, grade, crr, cw)) {
          callback(this.buildResponse(state, ResultCode.success))
        } else {
          message('simulation failed', 'error')
          callback(this.buildResponse(state, ResultCode.operationFailed))
        }
        break
      case ControlPointOpCode.setTargetInclincation:
        var grade = data.readInt16LE(1)  * 0.1
        message(`ControlPointOpCode.setTargetInclincation - grade: ${grade}`)
        if (this.serverCallback('grade', grade)) {
          callback(this.buildResponse(state, ResultCode.success))
        } else {
          message('set inclination failed', 'error')
          callback(this.buildResponse(state, ResultCode.operationFailed))
        }
        //callback(this.buildResponse(state, ResultCode.opCodeNotSupported))
        break
      default: // anything else : not yet implemented
        message('State is not supported ' + state + '.', 'warn')
        callback(this.buildResponse(state, ResultCode.opCodeNotSupported))
        break
    }
  };

  // Return the result message
  buildResponse (opCode, resultCode) {
    var buffer = new Buffer.alloc(3)
    buffer.writeUInt8(0x08, 0)
    buffer.writeUInt8(opCode, 1)
    buffer.writeUInt8(resultCode, 2)
    return buffer
  }
}

module.exports = FitnessControlPoint
