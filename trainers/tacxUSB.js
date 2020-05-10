// ========================================================================
// tacxUSB.js
//
// Manage USB interface with Tacx T1932
//
// ========================================================================

var logger = require('../lib/logger')
var EventEmitter = require('events').EventEmitter
const config = require('config-yml')
const fs = require('fs')
var usb = require('usb')
var easyusb = require('../lib/easyUSB')
const path = require('path')
const moduleName = path.win32.basename(module.filename)

function tacxUSB() {

  var self = this
  self.deviceUSB = undefined
  self.intervalUSB = undefined
  self.timeUSB = Date.now()
  self.emitter = new EventEmitter()
  self.powercurve = undefined
  self.datalogger = undefined

  var tacxUSB_debug = config.tacxUSB.debug || config.globals.debugUSB
  var tacxUSB_vid = config.tacxUSB.vendorid
  var tacxUSB_pid = config.tacxUSB.productid
  var tacxUSB_datalog = config.tacxUSB.datalog
  var tacxUSB_datafile = config.tacxUSB.datafile
  var tacxUSB_interval = config.tacxUSB.period
  var tacxUSB_powercurve = config.tacxUSB.powercurve
  var tacxUSB_simulation = config.tacxUSB.simulation
  var tacxUSB_rpm = config.tacxUSB.rpm
  var tacxUSB_hr = config.tacxUSB.hr

  self.powercurve = undefined
  self.mode = undefined
  self.target_grade = undefined
  self.target_reslist = undefined
  self.target_power = undefined
  self.last_speed = undefined

  // /////////////////////////////////////////////////////////////////////////
  // run
  // /////////////////////////////////////////////////////////////////////////

  this.run = function() {
    if (tacxUSB_debug) logger.info(`[${moduleName}] run`)
    self.emitter.emit('key', 'run')

    var device = usb.findByIds(tacxUSB_vid, tacxUSB_pid)
    if (device.deviceDescriptor.idVendor == tacxUSB_vid && device.deviceDescriptor.idProduct == tacxUSB_pid) {
      if (tacxUSB_debug) logger.info(`[${moduleName}] found Tacx T1932`)
        self.emitter.emit('key', 'attaching Tacx T1932')
      self.deviceUSB = easyusb([[tacxUSB_vid, tacxUSB_pid]])
      self.init()
    } else if (tacxUSB_simulation) {
      if (tacxUSB_debug) logger.info(`[${moduleName}] simulate`)
      self.init()
    }

    // /////////////////////////////////////////////////////////////////////////
    // on attach
    // /////////////////////////////////////////////////////////////////////////

    usb.on('attach', function(device){
      if (device.deviceDescriptor.idVendor == tacxUSB_vid && device.deviceDescriptor.idProduct == tacxUSB_pid) {
        logger.warn(`[${moduleName}] attaching Tacx T1932`)
        self.emitter.emit('key', 'attaching Tacx T1932')
        self.deviceUSB = easyusb([[tacxUSB_vid, tacxUSB_pid]])
        self.init()
      }
    })

    // /////////////////////////////////////////////////////////////////////////
    // on detach
    // /////////////////////////////////////////////////////////////////////////

    usb.on('detach', function(device) {
      if (device.deviceDescriptor.idVendor == tacxUSB_vid && device.deviceDescriptor.idProduct == tacxUSB_pid) {
        logger.warn(`[${moduleName}] detaching Tacx T1932`)
        self.emitter.emit('key', 'detaching Tacx T1932')
        if (self.deviceUSB) self.deviceUSB.close( function() {self.deviceUSB = undefined})
        if (self.intervalUSB) clearInterval(self.intervalUSB)
        self.deviceUSB = undefined
        self.intervalUSB = undefined
      }
    })
    return self.emitter
  }

  // /////////////////////////////////////////////////////////////////////////
  // init
  // /////////////////////////////////////////////////////////////////////////

  this.init = function() {
    if (tacxUSB_debug) logger.debug(`[${moduleName}] init`)
    self.emitter.emit('key', 'init')

    if (self.deviceUSB || tacxUSB_simulation) {
      // load power curve
      self.powercurve = []
      // possible force values to be recv from device
      const possfov = [1039, 1299, 1559, 1819, 2078, 2338, 2598, 2858, 3118, 3378, 3767, 4027, 4287, 4677]
      // possible resistance value to be transmitted to device
      const reslist = [1900, 2030, 2150, 2300, 2400, 2550, 2700, 2900, 3070, 3200, 3350, 3460, 3600, 3750]

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
        logger.error(`[${moduleName}] error: , ${err}`)
        for( let i=0; i < possfov.length; i++){
          self.powercurve.push( { possfov: 0, reslist: 0, grade: 0, multiplier: 0, additional: 0} )
        }
      }
      self.powercurve = self.powercurve.sort( function(a, b) { return a.grade - b.grade })
      self.powercurve.forEach( function (pc) {
        pc.possfov = possfov[self.powercurve.indexOf(pc)]
        pc.reslist = reslist[self.powercurve.indexOf(pc)]
      })

      if (tacxUSB_debug) logger.info(`[${moduleName}] self.powercurve: %o`, self.powercurve)

      // open datalogger
      if (tacxUSB_datalog && !tacxUSB_simulation) {
        try {
          if (!fs.existsSync("logs")) fs.mkdirSync("logs")
          var date = new Date()
          var filename = "logs/data_" +
                         date.getFullYear().toString().padStart(4, '0') + date.getMonth().toString().padStart(2, '0') + date.getDate().toString().padStart(2, '0') +
                         "_" +
                         date.getHours().toString().padStart(2, '0') + date.getMinutes().toString().padStart(2, '0') +  date.getSeconds().toString().padStart(2, '0') +
                         ".txt"
          self.datalogger = fs.createWriteStream(filename, {flags: 'a'})
        } catch (error) {
          if (tacxUSB_debug) logger.error(`[${moduleName}] datalogger: ${error}`)
        }
      }

      self.mode = undefined

      // will not read cadence until initialisation byte is sent
      self.write(Buffer.from([0x02, 0x00, 0x00, 0x00]))

      // start read timer
      if (tacxUSB_debug) logger.debug(`[${moduleName}] starting timer`)
      self.emitter.emit('key', 'starting timer')
      var interval = setInterval( this.read, tacxUSB_interval )
      self.intervalUSB = interval
    }
  }

  // /////////////////////////////////////////////////////////////////////////
  // restart
  // /////////////////////////////////////////////////////////////////////////

  this.restart = function() {
    return
  }

  // /////////////////////////////////////////////////////////////////////////
  // write
  // /////////////////////////////////////////////////////////////////////////

  this.write = function(data) {
    if (tacxUSB_debug) logger.debug(`[${moduleName}] write data [${data.length}]: ${data.toString('hex')}`)

    self.datalog( 'TX ' + data.toString('hex') )

    if (self.deviceUSB) self.deviceUSB.write(data, self.write_error_callback)
  }

  // /////////////////////////////////////////////////////////////////////////
  // write callback
  // /////////////////////////////////////////////////////////////////////////

  this.writeCallback = function(error) {
    if (error) logger.error(`[${moduleName}] write error callback : ${error}`)
  }

  // /////////////////////////////////////////////////////////////////////////
  // read
  // /////////////////////////////////////////////////////////////////////////

  this.read = function() {
    var millis = Date.now() - self.timeUSB
    self.timeUSB = Date.now()
    if (tacxUSB_debug) logger.debug(`[${moduleName}] read time: ${millis}ms`)
    if (tacxUSB_simulation) self.readCallback(0, self.readSimulate())
    else if (self.deviceUSB) self.deviceUSB.read(64, self.readCallback)
  }

  // /////////////////////////////////////////////////////////////////////////
  // readCallback
  // /////////////////////////////////////////////////////////////////////////

  this.readCallback = function(error, data) {
    if (error) {
      logger.error(`[${moduleName}] read error: ${error}`)
      return
    }

    if (tacxUSB_debug) logger.debug(`[${moduleName}] read data [${data.length}]: ${data.toString('hex')}`);

    self.datalog( 'RX '+ data.toString('hex') )

    self.receive(data)
  }

  // /////////////////////////////////////////////////////////////////////////
  // receive
  // /////////////////////////////////////////////////////////////////////////

  this.receive = function(buffer) {
    try {
      if (buffer.length > 40) {
        var data = {}
        var pc = undefined

        //data.serial = buffer.readUInt16LE(0)
        //data.fixed1 = buffer.readUInt16LE(2)
        //data.fixed2 = buffer.readUInt16LE(4)
        //data.fixed3 = buffer.readUInt16LE(6)
        //data.year = buffer.readUInt8(8)
        if (tacxUSB.hr) data.hr = buffer.readUInt8(12)
        //data.buttons = buffer.readUInt8(13)
        //data.flags = buffer.readUInt8(14)
        //data.distance = buffer.readUInt32LE(24)
        data.raw_speed = buffer.readUInt16LE(32)     // raw speed = kph * 289.75
        //data.acceleration = buffer.readUInt16LE(34)
        //data.average_load = buffer.readUInt16LE(36)
        data.current_load = buffer.readUInt16LE(38)
        //data.target_load = buffer.readUInt16LE(40)
        //data.events = buffer.readUInt8(41)
        data.pedecho = buffer.readUInt8(42)
        if (tacxUSB.rpm) data.rpm = buffer.readUInt8(44)

        data.speed = (data.raw_speed/2.8054/100).toFixed(1)    // speed kph

        self.last_speed = data.speed

        //if (!(data.flags & 0x02)) data.hr = 0

        if (self.powercurve[0].possfov != 0 && data.current_load == 0) data.current_load = self.powercurve[0].possfov

        pc = self.powercurve.find( pc => pc.possfov == data.current_load )
        if (pc == undefined) {
          // not an imagic fixed value return- find closest value
          if (self.powercurve[0].possfov != 0) if (tacxUSB_debug)
            if (tacxUSB_debug) logger.warn(`[${moduleName}] Found variable resistance return value from trainer`)

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
        data.force_index = self.powercurve.indexOf(pc)

        // compute power
        data.power = data.speed * pc.multiplier + pc.additional
        if (data.power < 0) data.power = 0
        data.power = data.power.toFixed(1)

        self.emitter.emit('data', data)
      } else {
        if (tacxUSB_debug) logger.warn(`[${moduleName}] not enough data received: ${buffer.length}`)
      }
    } catch (error) {
        if (tacxUSB_debug) logger.error(`[${moduleName}] exception: ${error}`)
    }
  }

  // /////////////////////////////////////////////////////////////////////////
  // send
  // /////////////////////////////////////////////////////////////////////////

  this.send = function (reslist, pedecho = 0) {
    if (tacxUSB_debug) logger.debug(`[${moduleName}] reslist: ${reslist}, pedecho: ${pedecho}`)

    var r5=Math.round(reslist) & 0xff    //byte5
    var r6=Math.round(reslist )>>8 & 0xff //byte6
    var byte_ints = Buffer.from([0x01, 0x08, 0x01, 0x00, r5, r6, pedecho, 0x00 ,0x02, 0x52, 0x10, 0x04])

    self.write(byte_ints)

    self.target_reslist = reslist
  }

  // /////////////////////////////////////////////////////////////////////////
  // setPower
  // /////////////////////////////////////////////////////////////////////////

  this.setPower = function (watt) {
    if (tacxUSB_debug) logger.debug(`[${moduleName}] setPower: ${watt}`)
    self.mode ='ERG'
    self.target_grade = 0
    self.target_power = watt

    if (watt < config.tacxUSB.power_step) watt = config.tacxUSB.power_step
    if (watt > config.tacxUSB.power_max) watt = config.tacxUSB.power_max

    // find power curve entry immediately above to target power
    var pc = self.powercurve.reduce( function (prev, curr) {
      var prev_power = Math.round(self.last_speed * prev.multiplier + prev.additional)
      var curr_power = Math.round(self.last_speed * curr.multiplier + curr.additional)
      return (Math.abs(curr_power - self.target_power) <
              Math.abs(prev_power - self.target_power) ? curr : prev)
    })
    if (pc == undefined) pc = self.powercurve[0]

    if (tacxUSB_debug) {
      var power = Math.round(self.last_speed * pc.multiplier + pc.additional)
      logger.info(`[${moduleName}] Power set at: ${power}W vs ${self.target_power}W with resistance at ${pc.reslist}/${self.powercurve.indexOf(pc)}`)
    }

    self.send( pc.reslist, 0)
  }

  // /////////////////////////////////////////////////////////////////////////
  // setPower
  // /////////////////////////////////////////////////////////////////////////

  this.setSimulation = function (windspeed, grade, crr, cw) {
    if (tacxUSB_debug) logger.debug(`[${moduleName}] setSimulation: ${grade}%`)
    self.mode ='SIM'
    self.target_grade = grade
    self.target_power = 0

    if (grade > config.tacxUSB.max_grade) grade = config.tacxUSB.max_grade

    // find power curve entry immediately above to target grade
    var pc = self.powercurve.reduce( function (prev, curr) {
      return (Math.abs(curr.grade - self.target_grade) <
              Math.abs(prev.grade - self.target_grade) ? curr : prev)
    })

    if (pc == undefined) pc = self.powercurve[0]

    self.send( pc.reslist, 0 )

    var power = Math.round(self.last_speed * pc.multiplier + pc.additional)
    if (tacxUSB_debug) {
      var estimate = self.estimatePower( windspeed, self.target_grade, crr, cw, self.last_speed )
      var speed = Math.round((estimate - pc.additional ) / pc.multiplier)
      logger.info(`[${moduleName}] Simulation set at: ${power}W vs ${estimate}W with resistance at ${pc.reslist}/${self.powercurve.indexOf(pc)} for ${self.last_speed}km/h vs ${speed}km/h at ${self.target_grade}%`)
    }

    return power.toFixed(0)
  }

  // /////////////////////////////////////////////////////////////////////////
  // datalog
  // /////////////////////////////////////////////////////////////////////////

  this.datalog = function(data) {
    if (tacxUSB_datalog && self.datalogger)
      self.datalogger.write( data + "\n\r")
  }

  // /////////////////////////////////////////////////////////////////////////
  // estimatePower
  // /////////////////////////////////////////////////////////////////////////

  this.estimatePower = function(windspeed, grade, crr, cw, speed) {

    const g = 9.8067 // acceleration in m/s^2 due to gravity
    const p = 1.225  // air density in kg/m^3 at 15°C at sea level
    const e = 0.97   // drive chain efficiency

    if (windspeed != undefined) self.last_windspeed = windspeed
    if (self.last_windspeed == undefined)
      windspeed = config.physics.windspeed
    else
      windspeed = self.last_windspeed

    if (crr != undefined) self.last_crr = crr
    if (self.last_crr == undefined)
      crr = config.physics.crr
    else
      crr = self.last_crr

    if (cw != undefined) self.last_cw = cw
    if (self.last_cw == undefined)
      cw = config.physics.cw
    else
      cw = self.last_cw

    if (speed == undefined) speed = self.last_speed
    if (grade == undefined) cw = self.target_grade

    // h and area are already included in the cw value sent from ZWIFT or FULLGAZ
    var mass = config.physics.mass_rider  + config.physics.mass_bike              // mass in kg of the bike + rider
    //var h = 1.92                                                                // height in m of rider
    //var area = 0.0276 * Math.pow(h, 0.725) * Math.pow(mRider, 0.425) + 0.1647;  //  cross sectional area of the rider, bike and wheels

    if (grade > config.physics.max_grade) grade = config.physics.max_grade        // set to maximum gradient; means, no changes in resistance if gradient is greater than maximum

    var speedms = Number(speed * 1000 / 3600) + Number(windspeed) // speed in m/s
    if (speedms > config.physics.max_speedms) speedms = 0.0

    // Cycling Wattage Calculator
    // https://www.omnicalculator.com/sports/cycling-wattage
    // https://www.gribble.org/cycling/power_v_speed.html
    var forceofgravity = g * Math.sin(Math.atan(grade / 100)) * mass
    var forcerollingresistance = g * Math.cos(Math.atan(grade / 100)) * mass * crr
    var forceaerodynamic = 0.5 * cw * p * Math.pow(speedms, 2)

    var simpower = (forceofgravity + forcerollingresistance + forceaerodynamic) * speedms / e

    return simpower.toFixed(0)
  }
// /////////////////////////////////////////////////////////////////////////
  // readSimulate
  // /////////////////////////////////////////////////////////////////////////

  this.readSimulate = function() {
    var internal = Buffer.alloc(64)

    var hr = 120
    var rpm = 90
    var pedecho = 0

    //if (self.mode == 'ERG')
    var pc = self.powercurve.find( function (pc) { return (pc.reslist == self.target_reslist) })
    if (pc == undefined) pc = self.powercurve[0]
    if (self.mode == 'ERG') var power = self.target_power
    else power = config.physics.avg_power
    var speed = Math.round((power - pc.additional ) / pc.multiplier, 1)

    if (tacxUSB_debug) logger.info(`[${moduleName}] readSimulate for reslist: ${pc.reslist} and ${power}W says ${speed}km/h`)

    internal.writeUInt8(hr.toFixed(0), 12)                         // hr
    internal.writeUInt8(0, 14)                                     // flags
    internal.writeUInt32LE(0, 24)                                  // distance
    internal.writeUInt16LE(Math.round( speed * 2.8054 * 100 ), 32) // raw speed = kph * 289.75
    internal.writeUInt32LE(0, 34)                                  // accelration
    internal.writeUInt32LE(0, 36)                                  // average_load
    internal.writeUInt16LE(pc.possfov, 38)                         // current_load
    internal.writeUInt32LE(0, 40)                                  // target_load
    internal.writeUInt8(pedecho, 42)                               // pedecho
    internal.writeUInt8(rpm, 44)                                   // rpm

    return internal
  }
}

module.exports = tacxUSB // export for use in other scripts, e.g.: server.js
