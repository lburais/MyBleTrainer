// ========================================================================
// tacxUSB.js
//
// Manage USB interface with Tacx T1932
//
// ========================================================================

var EventEmitter = require('events').EventEmitter
const config = require('config-yml')
const fs = require('fs')
var usb = require('usb')

var easyusb = require('../lib/easyUSB')
var message = require('../lib/message')

function tacxUSB() {

  var tacxUSB_vid = config.tacxUSB.vendorid
  var tacxUSB_pid = config.tacxUSB.productid
  var tacxUSB_datafile = config.tacxUSB.datafile
  var tacxUSB_interval = config.tacxUSB.period
  var tacxUSB_powercurve = config.tacxUSB.powercurve
  var tacxUSB_count = config.tacxUSB.count

  var self = this

  self.deviceUSB = undefined
  self.intervalUSB = undefined
  self.timeUSB = Date.now()
  self.emitter = new EventEmitter()
  self.powercurve = undefined
  self.counter = 1

  // last values used for T1932 frame processing
  self.store = {
    // T1932
    last_speed: 0,              // last speed in km/h received from T1932
    last_index: 0,              // index of last powercurve entry sent to T1932
    last_power: 0,              // last computed power based on last_speed and last_index
    // physics
    last_windspeed: 0,          // last winspeed in km/h received from client
    last_crr: 0,                // last
    last_cw: 0,                 // last
    last_grade: 0,
    last_mode: "-",             // last mode received from client
    last_mass: 0,
    // targets
    target_grade: undefined,    // latest grade instruction received from client
    target_power: undefined,    // latest power instruction received from client
    target_reslist: undefined,
    // status
    last_usb: "-"
  }

  // /////////////////////////////////////////////////////////////////////////
  // run
  // /////////////////////////////////////////////////////////////////////////

  this.run = function() {

    message(`run`)
    self.store.last_usb = '-'

    var device = usb.findByIds(tacxUSB_vid, tacxUSB_pid)
    if (device) {
      if (device.deviceDescriptor.idVendor == tacxUSB_vid && device.deviceDescriptor.idProduct == tacxUSB_pid) {
        message(`found Tacx T1932`)
        self.deviceUSB = easyusb([[tacxUSB_vid, tacxUSB_pid]])
        self.start()
        self.store.last_usb = 'ON'
        self.emitter.emit('param', self.store)
      }
    } else if (tacxUSB_simulation) {
      message(`simulate`)
      self.start()
      self.store.last_usb = 'SIM'
      self.emitter.emit('param', self.store)
    }

    // /////////////////////////////////////////////////////////////////////////
    // on attach
    // /////////////////////////////////////////////////////////////////////////

    usb.on('attach', function(device){
      if (device.deviceDescriptor.idVendor == tacxUSB_vid && device.deviceDescriptor.idProduct == tacxUSB_pid) {
        message(`attaching Tacx T1932`)
        self.deviceUSB = easyusb([[tacxUSB_vid, tacxUSB_pid]])
        self.start()
        self.store.last_usb = 'ON'
        self.emitter.emit('param', self.store)
      }
    })

    // /////////////////////////////////////////////////////////////////////////
    // on detach
    // /////////////////////////////////////////////////////////////////////////

    usb.on('detach', function(device) {
      if (device.deviceDescriptor.idVendor == tacxUSB_vid && device.deviceDescriptor.idProduct == tacxUSB_pid) {
        message(`detaching Tacx T1932`, 'warn')
        if (self.deviceUSB) self.deviceUSB.close( function() {self.deviceUSB = undefined})
        self.deviceUSB = undefined
        self.intervalUSB = undefined
        self.stop()
        self.store.last_usb = 'OFF'
        self.emitter.emit('param', self.store)
      }
    })

    return self.emitter
  }

  // /////////////////////////////////////////////////////////////////////////
  // setPowerCurve
  //
  // set power curve
  // /////////////////////////////////////////////////////////////////////////

  this.setPowerCurve = function() {
    message(`setPowerCurve`)

    if (self.deviceUSB || tacxUSB_simulation) {
      // load power curve
      self.powercurve = []
      // possible force values to be recv from device
      const possfov = [1039, 1299, 1559, 1819, 2078, 2338, 2598, 2858, 3118, 3378, 3767, 4027, 4287, 4677]
      // possible resistance value to be transmitted to device
      const reslist = [1900, 2030, 2150, 2300, 2400, 2550, 2700, 2900, 3070, 3200, 3350, 3460, 3600, 3750]

      // load powercurve
      try {
        const file = fs.readFileSync(tacxUSB_powercurve, 'UTF-8')
        const lines  = file.split(/\r?\n/)
        var i = 0
        lines.forEach((line) => {
          line = line.split('#')
          line = line[0].split(':')
          if (line.length == 2) {
            var vals = line[1].split(',')
            if (vals.length == 2) {
              self.powercurve.push( { possfov: 0, reslist: 0, grade: parseFloat(line[0]), multiplier: parseFloat(vals[0]), additional: parseFloat(vals[1])} )
            }
          }
        })
      } catch (err) {
        message(`error: , ${err}`, 'error')
        for( let i=0; i < possfov.length; i++){
          self.powercurve.push( { possfov: 0, reslist: 0, grade: 0, multiplier: 0, additional: 0} )
        }
      }
      self.powercurve = self.powercurve.sort( function(a, b) { return a.grade - b.grade })
      self.powercurve.forEach( function (pc) {
        pc.possfov = possfov[self.powercurve.indexOf(pc)]
        pc.reslist = reslist[self.powercurve.indexOf(pc)]
      })

      message(`self.powercurve: ${JSON.stringify(self.powercurve)}`)
    }
  }

  // /////////////////////////////////////////////////////////////////////////
  // start
  // /////////////////////////////////////////////////////////////////////////

  this.start = function() {
    message(`start`)

    if (self.deviceUSB || tacxUSB_simulation) {

      if (self.powercurve == undefined) self.setPowerCurve()

      // set parameters
      self.store.last_mass = config.physics.mass_rider  + config.physics.mass_bike
      // last_usb set by on function

      // set last value
      self.store.last_distance = 0
      self.store.last_speed = 0
      self.store.last_index = 0
      self.store.last_power = 0

      self.store.last_mode = "-"
      self.store.last_windspeed = config.physics.windspeed
      self.store.last_crr = config.physics.crr
      self.store.last_cw = config.physics.cw
      self.store.last_grade = 0

      self.store.target_grade = 0
      self.store.target_reslist = self.powercurve[0].reslist
      self.store.target_power = 0

      self.refreshWebPage()

      // will not read cadence until initialisation byte is sent
      self.write(Buffer.from([0x02, 0x00, 0x00, 0x00]))

      // set minimal power

      // reset counter
      self.counter = 1

      // start read timer
      message(`starting timer`)
      var interval = setInterval( this.read, tacxUSB_interval )
      self.intervalUSB = interval

      return
    }
  }

  // /////////////////////////////////////////////////////////////////////////
  // stop
  // /////////////////////////////////////////////////////////////////////////

  this.stop = function() {
    message(`stop`)

    if (self.intervalUSB) clearInterval(self.intervalUSB)

    self.refreshWebPage()

    return
  }

  // /////////////////////////////////////////////////////////////////////////
  // reset
  // /////////////////////////////////////////////////////////////////////////

  this.reset = function() {
    message(`reset`)

    self.stop()

    self.powercurve = undefined

    self.start()

    return
  }

  // /////////////////////////////////////////////////////////////////////////
  // restart
  // /////////////////////////////////////////////////////////////////////////

  this.restart = function() {
    message(`restart`)

    self.stop()

    self.start()

    return
  }

  // /////////////////////////////////////////////////////////////////////////
  // refreshWebPage
  // /////////////////////////////////////////////////////////////////////////

  this.refreshWebPage = function() {
    message(`refreshWebPage`)

    self.emitter.emit('param', self.store)

    // reset the application side .....
    self.emitter.emit('param', {
      control: '-',
      windspeed: "-",
      grade: "-",
      crr: "-",
      cw: "-",
      setpower: "-",
      estimatepower: "-",
      estimatespeed: "-"
    })

  }

  // /////////////////////////////////////////////////////////////////////////
  // write
  // /////////////////////////////////////////////////////////////////////////

  this.write = function(data) {
    message(`write data [${data.length}]: ${data.toString('hex')}`, 'debug')
    if (self.deviceUSB) self.deviceUSB.write(data, self.write_error_callback)
  }

  // /////////////////////////////////////////////////////////////////////////
  // write callback
  // /////////////////////////////////////////////////////////////////////////

  this.writeCallback = function(error) {
    if (error) {
      message(`write error callback : ${error}`, 'error')
    }
  }

  // /////////////////////////////////////////////////////////////////////////
  // read
  // /////////////////////////////////////////////////////////////////////////

  this.read = function() {
    var millis = Date.now() - self.timeUSB
    self.timeUSB = Date.now()
    message(`read: ${millis}ms`, 'debug')
    if (self.deviceUSB) self.deviceUSB.read(64, self.readCallback)
  }

  // /////////////////////////////////////////////////////////////////////////
  // readCallback
  // /////////////////////////////////////////////////////////////////////////

  this.readCallback = function(error, data) {
    if (error) {
      message(`read error : ${error}`, 'error')
      return
    }
    message(`read data [${data.length}]: ${data.toString('hex')}`, 'debug')
    self.receive(data)
  }

  // /////////////////////////////////////////////////////////////////////////
  // receive
  // /////////////////////////////////////////////////////////////////////////

  this.receive = function(buffer) {
    try {
      if (buffer.length > 40) {
        var data = {}
        var speed = 0
        var pc = undefined

        //data.serial = buffer.readUInt16LE(0)
        //data.fixed1 = buffer.readUInt16LE(2)
        //data.fixed2 = buffer.readUInt16LE(4)
        //data.fixed3 = buffer.readUInt16LE(6)
        //data.year = buffer.readUInt8(8)
        if (config.tacxUSB.hr) {
          data.hr = buffer.readUInt8(12)
          data.flags = buffer.readUInt8(14)
          if (!(data.flags & 0x02)) data.hr = 0
        }
        //data.buttons = buffer.readUInt8(13)
        data.distance = buffer.readUInt32LE(24)
        data.raw_speed = buffer.readUInt16LE(32)     // raw speed = kph * 289.75
        //data.acceleration = buffer.readUInt16LE(34)
        //data.average_load = buffer.readUInt16LE(36)
        data.current_load = buffer.readUInt16LE(38)
        //data.target_load = buffer.readUInt16LE(40)
        //data.events = buffer.readUInt8(41)
        data.pedecho = buffer.readUInt8(42)
        if (config.tacxUSB.rpm) data.rpm = buffer.readUInt8(44)

        speed = (data.raw_speed/2.8054/100).toFixed(1)    // speed kph

        if (self.powercurve[0].possfov != 0 && data.current_load == 0) data.current_load = self.powercurve[0].possfov

        // Find load in powercurve
        pc = self.powercurve.find( pc => pc.possfov == data.current_load )
        if (pc == undefined) {
          // not an imagic fixed value return- find closest value
          if (self.powercurve[0].possfov != 0)
          message(`Found variable resistance return value from trainer`, 'warn')

          // possible resistance value to be transmitted to device
          // reslist = Buffer.from([0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 11000, 12000, 13000])
          // possfov = Buffer.from([0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 11000, 12000, 13000])
          self.powercurve.forEach( function (pc) {
            pc.possfov = self.powercurve.indexOf(pc)*1000
            pc.reslist = self.powercurve.indexOf(pc)*1000
          })

          // find value with minimum distance to reported force
          var dist = []
          self.powercurve.forEach( function (pc) {
            dist.push( abs(pc.possfov - data.current_load) )
          })
          var min = Math.min.apply(null, dist)
          pc = self.powercurve[dist.indexOf(min)]
        }

        data.load = pc.possfov
        data.resistance = pc.reslist
        data.force_index = self.powercurve.indexOf(pc)

        // compute power
        data.power = speed * pc.multiplier + pc.additional
        if (data.power < 0) data.power = 0
        data.power = data.power.toFixed(1)

        // speed from Tacx
        if (config.tacxUSB.speed) data.speed = speed

        self.store.last_distance = data.distance
        self.store.last_speed = speed
        self.store.last_power = data.power
        self.store.last_index = data.force_index

        if (self.counter == tacxUSB_count) {
          // send one frame out of tacxUSB_count
          self.emitter.emit('param', self.store)
          self.emitter.emit('data', data)
          self.counter = 1
        } else self.counter ++
      } else {
        message(`not enough data received: ${buffer.length}`, 'warn')
      }
    } catch (error) {
      message(`exception: ${error}`, 'error')
    }
  }

  // /////////////////////////////////////////////////////////////////////////
  // send
  // /////////////////////////////////////////////////////////////////////////

  this.send = function (reslist, pedecho = 0) {
    message(`reslist: ${reslist}, pedecho: ${pedecho}`)

    var r5=Math.round(reslist) & 0xff    //byte5
    var r6=Math.round(reslist )>>8 & 0xff //byte6
    var byte_ints = Buffer.from([0x01, 0x08, 0x01, 0x00, r5, r6, pedecho, 0x00 ,0x02, 0x52, 0x10, 0x04])

    self.write(byte_ints)
    self.counter = 1 // reset counter to wait for consignee to be applied

    self.store.target_reslist = reslist
  }

  // /////////////////////////////////////////////////////////////////////////
  // setPower
  // /////////////////////////////////////////////////////////////////////////

  this.setPower = function (watt) {
    message(`setPower: ${watt}W`)

    self.store.last_mode ='ERG'
    self.store.target_grade = 0
    self.store.target_power = watt

    if (watt < config.tacxUSB.power_step) watt = config.tacxUSB.power_step
    if (watt > config.tacxUSB.power_max) watt = config.tacxUSB.power_max

    // find power curve entry immediately above to target power
    // force min speed
    var pc = self.powercurve.reduce( function (prev, curr) {
      var prev_power = Math.round(Math.max(self.store.last_speed,config.tacxUSB.speed_min) * prev.multiplier + prev.additional)
      var curr_power = Math.round(Math.max(self.store.last_speed,config.tacxUSB.speed_min) * curr.multiplier + curr.additional)
      return (Math.abs(curr_power - self.store.target_power) <
      Math.abs(prev_power - self.store.target_power) ? curr : prev)
    })
    if (pc == undefined) pc = self.powercurve[0]

    var power = Math.round(Math.max(self.store.last_speed,config.tacxUSB.speed_min) * pc.multiplier + pc.additional)

    message(`Power set at: ${power}W vs ${self.store.target_power}W with resistance at ${pc.reslist}/${self.powercurve.indexOf(pc)}`)

    self.send( pc.reslist, 0)

    self.store.last_power = power
    self.store.last_index = self.powercurve.indexOf(pc)

    return power.toFixed(0)

  }

  // /////////////////////////////////////////////////////////////////////////
  // setSimulation
  // /////////////////////////////////////////////////////////////////////////

  this.setSimulation = function (windspeed, grade, crr, cw) {
    message(`setSimulation: ${grade}%`)

    self.store.last_mode ='SIM'
    self.store.target_grade = grade
    self.store.target_power = 0

    if (grade > config.tacxUSB.max_grade) grade = config.tacxUSB.max_grade

    // find power curve entry immediately above to target grade
    var pc = self.powercurve.find( pc => pc.grade >= grade )

    if (pc == undefined) pc = self.powercurve[self.powercurve.length-1]

    self.send( pc.reslist, 0 )

    var estimate = self.estimatePower( windspeed, self.store.target_grade, crr, cw, self.store.last_speed )
    var power = Math.round(self.store.last_speed * pc.multiplier + pc.additional)
    var speed = Math.round((estimate - pc.additional ) / pc.multiplier)

    self.store.last_power = power.toFixed(1)
    self.store.last_index = self.powercurve.indexOf(pc)

    message(`Simulation set at: ${power}W vs ${estimate}W with resistance at ${pc.reslist}/${self.powercurve.indexOf(pc)} for ${self.store.last_speed}km/h vs ${speed}km/h at ${self.store.target_grade}%`)

    return power.toFixed(1)
  }
  // /////////////////////////////////////////////////////////////////////////
  // setParameters
  // /////////////////////////////////////////////////////////////////////////

  this.setParameters = function (data) {
    if( 'mass' in data) self.store.last_mass = data.mass
  }

  // /////////////////////////////////////////////////////////////////////////
  // estimatePower
  // /////////////////////////////////////////////////////////////////////////

  this.estimatePower = function(windspeed, grade, crr, cw, speed) {

    const g = 9.8067 // acceleration in m/s^2 due to gravity
    const p = 1.225  // air density in kg/m^3 at 15°C at sea level
    const e = 0.97   // drive chain efficiency

    if (windspeed != undefined) self.store.last_windspeed = windspeed
    if (self.store.last_windspeed == undefined)
    windspeed = config.physics.windspeed
    else
    windspeed = self.store.last_windspeed

    if (crr != undefined) self.store.last_crr = crr
    if (self.store.last_crr == undefined)
    crr = config.physics.crr
    else
    crr = self.store.last_crr

    if (cw != undefined) self.store.last_cw = cw
    if (self.store.last_cw == undefined)
    cw = config.physics.cw
    else
    cw = self.store.last_cw

    if (speed == undefined) speed = self.store.last_speed
    if (grade == undefined) cw = self.store.target_grade

    if (grade > config.physics.max_grade) grade = config.physics.max_grade        // set to maximum gradient; means, no changes in resistance if gradient is greater than maximum
    self.store.last_grade = grade

    var speedms = Number(speed * 1000 / 3600) + Number(windspeed) // speed in m/s
    if (speedms > config.physics.max_speedms) speedms = 0.0

    // Cycling Wattage Calculator
    // https://www.omnicalculator.com/sports/cycling-wattage
    // https://www.gribble.org/cycling/power_v_speed.html
    var forceofgravity = g * Math.sin(Math.atan(grade / 100)) * self.store.last_mass
    var forcerollingresistance = g * Math.cos(Math.atan(grade / 100)) * self.store.last_mass * crr
    var forceaerodynamic = 0.5 * cw * p * Math.pow(speedms, 2)

    var power = (forceofgravity + forcerollingresistance + forceaerodynamic) * speedms / e
    if (power < 0) power = 0

    self.store.last_power = power.toFixed(0)

    self.emitter.emit('param', self.store)

    return power.toFixed(0)
  }
}

module.exports = tacxUSB // export for use in other scripts, e.g.: server.js
