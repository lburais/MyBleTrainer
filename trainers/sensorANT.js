
// ========================================================================
// trainerANT.js
//
// Manage USB ANT sensors (heart rate and speed cadence)
//
// ========================================================================

var message = require('../lib/message')
const Ant = require('ant-plus')
const stick = new Ant.GarminStick2()
var exitHandlerBound = false

const EventEmitter = require('events')
const config = require('config-yml')
var wheel = config.sensorANT.wheel
var sensorANT_interval = config.sensorANT.period

class trainerANT extends EventEmitter {
  constructor () {
    super();
    let self = this;
    let intervalANT = undefined
    let timeANT = Date.now()

    self.active = false
    self.reset = false

    // Heart Rate sensor

    const hrScanner = new Ant.HeartRateScanner(stick);

    hrScanner.on('hbData', data => {
      message(`hbData id: ${JSON.stringify(data)}`)
      self.emit('data', { last_ant: 'ON', hr: data.ComputedHeartRate.toFixed(0) })
    });

    // Speed and Cadence sensor

    const speedCadenceScanner = new Ant.SpeedCadenceScanner(stick);

    speedCadenceScanner.setWheelCircumference(wheel);

    speedCadenceScanner.on('speedData', data => {
      message(`speedcadenceData: ${JSON.stringify(data)}`)
      let speed = data.CalculatedSpeed;
      if (speed > 35) speed = 0
      self.emit('data', { last_ant: 'ON', speed: (speed*3.6).toFixed(1) })
      self.active= true
    });

    speedCadenceScanner.on('cadenceData', data => {
      message(`cadencespeedData: ${JSON.stringify(data)}`)
      let rpm = data.CalculatedCadence;
      if (rpm > 300) rpm=0 // cut fake
      self.emit('data', { last_ant: 'ON', rpm: rpm.toFixed(0) })
      self.active= true
    });

    // Speed sensor

    const speedScanner = new Ant.SpeedScanner(stick);

    speedScanner.setWheelCircumference(wheel);

    speedScanner.on('speedData', data => {
      message(`speedData: ${JSON.stringify(data)}`)
      let speed = data.CalculatedSpeed;
      if (speed > 35) speed = 0
      self.emit('data', { last_ant: 'ON', speed: (speed*3.6).toFixed(1) })
      self.active= true
    });

    // Cadence sensor

    const cadenceScanner = new Ant.CadenceScanner(stick);
    cadenceScanner.on('cadenceData', data => {
      message(`cadenceData: ${JSON.stringify(data)}`)
      self.emit('data', { last_ant: 'ON', rpm: rpm.toFixed(0) } );
      self.active= true
    });

    this.heartbeat = function() {
      var millis = Date.now() - self.timeANT
      self.timeANT = Date.now()
      message(`heartbeat: ${millis}ms`)
      if (self.active == false) {
        if (self.reset == false) {
          self.emit( 'data', { last_ant: '-', speed: 0, hr: 0, rpm: 0 } )
          self.reset = true
        }
      }
      else self.reset = false
      self.active = false
    }

    // ANT stick

    stick.on('startup', function() {
      message('startup');
      hrScanner.scan();
      speedCadenceScanner.scan();
      speedScanner.scan();
      cadenceScanner.scan();
    });

    if (!stick.open()) {
      message('Stick not found!', 'error');
    } else {
      message('Stick found!');
      self.emit('data', { last_ant: '-' });
      message(`starting timer`)
      var interval = setInterval( this.heartbeat, sensorANT_interval )
      self.intervalANT = interval
      self.active = true
    }

    process.on('SIGINT', () => {
      if (self.intervalANT) clearInterval(self.intervalANT)
      setTimeout(function(){ stick.close; }, 500);
    })
  }
}
module.exports = trainerANT;
