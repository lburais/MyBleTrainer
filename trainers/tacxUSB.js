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
var physics = require('../lib/physics')

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
  var tacxUSB_simulation = config.tacxUSB.simulation 
  var tacxUSB_datafile = config.tacxUSB.datafile 
  var tacxUSB_interval = config.tacxUSB.period 
  var tacxUSB_powercurve = config.tacxUSB.powercurve

  self.powercurve = undefined
  self.log = false

  // /////////////////////////////////////////////////////////////////////////
  // run
  // /////////////////////////////////////////////////////////////////////////

  this.run = function() {
    if (tacxUSB_debug) logger.info('[tacxUSB.js] - run')
    self.emitter.emit('key', '[tacxUSB.js] - run')

    var device = usb.findByIds(tacxUSB_vid, tacxUSB_pid)
    if (device.deviceDescriptor.idVendor == tacxUSB_vid && device.deviceDescriptor.idProduct == tacxUSB_pid) {
      if (tacxUSB_debug) logger.info('[tacxUSB.js] - found Tacx T1932')
        self.emitter.emit('key', '[tacxUSB.js] - attaching Tacx T1932')
      self.deviceUSB = easyusb([[tacxUSB_vid, tacxUSB_pid]])
      this.init()
    }    

    // /////////////////////////////////////////////////////////////////////////
    // on attach
    // /////////////////////////////////////////////////////////////////////////

    usb.on('attach', function(device){
      if (device.deviceDescriptor.idVendor == tacxUSB_vid && device.deviceDescriptor.idProduct == tacxUSB_pid) {
        logger.warn('[tacxUSB.js] - attaching Tacx T1932')
        self.emitter.emit('key', '[tacxUSB.js] - attaching Tacx T1932')
        self.deviceUSB = easyusb([[tacxUSB_vid, tacxUSB_pid]])
        this.init()
     }    
    })

    // /////////////////////////////////////////////////////////////////////////
    // on detach
    // /////////////////////////////////////////////////////////////////////////

    usb.on('detach', function(device) {
      if (device.deviceDescriptor.idVendor == tacxUSB_vid && device.deviceDescriptor.idProduct == tacxUSB_pid) {
        logger.warn('[tacxUSB.js] - detaching Tacx T1932')
        self.emitter.emit('key', '[tacxUSB.js] - detaching Tacx T1932')
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
    if (tacxUSB_debug) logger.info('[tacxUSB.js] - init')
    self.emitter.emit('key', '[tacxUSB.js] - init')
    
    if (self.deviceUSB) {
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
        logger.error('[tacxUSB.js] - error: ', err)
        for( let i=0; i < possfov.length; i++){
          self.powercurve.push( { possfov: 0, reslist: 0, grade: 0, multiplier: 0, additional: 0} )
        }
      }
      self.powercurve = self.powercurve.sort( function(a, b) { return a.grade - b.grade })
      self.powercurve.forEach( function (pc) {
        pc.possfov = possfov[self.powercurve.indexOf(pc)]
        pc.reslist = reslist[self.powercurve.indexOf(pc)]
      })
  
      if (tacxUSB_debug) logger.info('self.powercurve: %o', self.powercurve)

      // open datalogger
      if (tacxUSB_datalog) {
        if (!fs.existsSync("logs")) fs.mkdirSync("logs")
        var date = new Date()
        var filename = "logs/logger_" + date.getFullYear() + date.getMonth() + date.getDate() + "_" + date.getHours() + date.getMinutes() + date.getSeconds() + ".txt"
        //self.datalogger = fs.openSync(filename, 'a')
        self.datalogger = fs.createWriteStream(filename, {flags: 'a'})
        self.log = false
      }

      // will not read cadence until initialisation byte is sent
      this.write(Buffer.from([0x02, 0x00, 0x00, 0x00]))

      // start read timer
      if (tacxUSB_debug) logger.info('[tacxUSB.js] - starting timer')
      self.emitter.emit('key', '[tacxUSB.js] - starting timer')
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
    if (tacxUSB_debug) logger.info(`[tacxUSB.js] - write data: ${data}`)
    if (tacxUSB_datalog && self.datalogger) self.datalog( 'TX ' + data.toString('hex') )
    if (self.deviceUSB) self.deviceUSB.write(data, self.write_error_callback)
  }

  // /////////////////////////////////////////////////////////////////////////
  // write callback
  // /////////////////////////////////////////////////////////////////////////

  this.write_callback = function(error) {
    if (error) logger.error(`[tacxUSB.js] - write error callback : ${error}`)
  }

  // /////////////////////////////////////////////////////////////////////////
  // read
  // /////////////////////////////////////////////////////////////////////////

  this.read = function() {
    var millis = Date.now() - self.timeUSB
    self.timeUSB = Date.now()
    if (tacxUSB_debug) logger.info(`[tacxUSB.js] - read time: ${millis}ms`)
    self.deviceUSB.read(64, self.read_callback)
  }

  // /////////////////////////////////////////////////////////////////////////
  // read callback
  // /////////////////////////////////////////////////////////////////////////

  this.read_callback = function(error, data) {
    if (error) {
      logger.error(`[tacxUSB.js] - read error: ${error}`)
      return
    }

    if (tacxUSB_debug) logger.info(`[tacxUSB.js] - read data [${data.length}]: ${data.toString('hex')}`);

    if (tacxUSB_datalog && self.datalogger) self.datalog( 'RX '+data.toString('hex') )

    self.receive(data)
  }

  // /////////////////////////////////////////////////////////////////////////
  // setPower
  // /////////////////////////////////////////////////////////////////////////

  this.setPower = function (power, speed) { 
    if (tacxUSB_debug) logger.info(`[tacxUSB.js] - set power ${power}W at speed ${speed}km/h`)
    
    // power validation is done here to dont loose quality in other functions
    if (power < config.tacxUSB.min_power) power = config.tacxUSB.min_power // cut negative or too low power values from simulation
    if (power > config.tacxUSB.max_power) power = config.tacxUSB.max_power // cut too high power calculations
    if (speed < 10) speed = 10                                             // default to at least 10 kph

    // set resistance level
    var closest = 1000
    var pc = self.powercurve.find( function (pc) {
      var power_at_level = Math.round(speed * pc.multiplier + pc.additional)
      if (( power - power_at_level )**2 < closest**2 ) {
        closest = ((power - power_at_level)**2)**0.5
        return true
      } else return false
    }) // find resistance value immediately above grade set by zwift

    if (tacxUSB_debug) logger.info(`[tacxUSB.js] - set power with ${pc.reslist}`)
    self.send(pc.reslist)
  }
  
  // /////////////////////////////////////////////////////////////////////////
  // send
  // /////////////////////////////////////////////////////////////////////////

  this.send = function(resistance_level, pedecho = 0) {
    if (tacxUSB_debug) logger.info(`[tacxUSB.js] - send with ${resistance_level} and ${pedecho}`)

    var r5=Math.round(resistance_level) & 0xff    //byte5
    var r6=Math.round(resistance_level )>>8 & 0xff //byte6
    var byte_ints = Buffer.from([0x01, 0x08, 0x01, 0x00, r5, r6, pedecho, 0x00 ,0x02, 0x52, 0x10, 0x04])
    self.write(byte_ints)
  }

  // /////////////////////////////////////////////////////////////////////////
  // receive
  // /////////////////////////////////////////////////////////////////////////

  this.receive = function(buffer) {
    if (tacxUSB_debug) logger.info(`[tacxUSB.js] - receive`)
    if (buffer.length > 40) {
      var data = {}

      //data.serial = buffer.readUInt16LE(0)
      //data.fixed1 = buffer.readUInt16LE(2)
      //data.fixed2 = buffer.readUInt16LE(4)
      //data.fixed3 = buffer.readUInt16LE(6)
      //data.year = buffer.readUInt8(8)
      data.hr = buffer.readUInt8(12)
      //data.buttons = buffer.readUInt8(13)
      data.flags = buffer.readUInt8(14)
      data.distance = buffer.readUInt32LE(24)                
      data.raw_speed = buffer.readUInt16LE(32)               // raw speed = kph * 289.75
      data.acceleration = buffer.readUInt16LE(34)
      data.average_load = buffer.readUInt16LE(36)
      data.current_load = buffer.readUInt16LE(38)
      data.target_load = buffer.readUInt16LE(40)
      //data.events = buffer.readUInt8(41)
      data.pedecho = buffer.readUInt8(42)
      data.rpm = buffer.readUInt8(44)

      data.speed = (data.raw_speed/2.8054/100).toFixed(1)    // speed kph

      if (!(data.flags & 0x02)) data.hr = 0

      if (self.powercurve[0].possfov != 0 && data.current_load == 0) data.current_load = self.powercurve[0].possfov

      var pc = self.powercurve.find( pc => pc.possfov == data.current_load )
      if (pc == undefined) {
        // not an imagic fixed value return- find closest value
        if (self.powercurve[0].possfov != 0) if (tacxUSB_debug) 
          if (tacxUSB_debug) logger.info(`[tacxUSB.js] - Found variable resistance return value from trainer`)

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
        data.load = self.powercurve[dist.indexOf(min)].possfov
      } else {
        data.load = data.current_load
      }
      
      data.force_index = self.powercurve.indexOf(self.powercurve.find( pc => pc.possfov == data.load ))

      // compute power
      data.power = self.calculate_power(data.speed, data.load)

      self.emitter.emit('data', data)
    } else {
      if (tacxUSB_debug) logger.info(`[tacxUSB.js] - not enough data received: ${buffer.length}`)
    }
  }

  // /////////////////////////////////////////////////////////////////////////
  // datalog
  // /////////////////////////////////////////////////////////////////////////

  this.datalog = function(data) {
    self.datalogger.write( data + "\n\r")
  }

  // /////////////////////////////////////////////////////////////////////////
  // calculate_power
  // /////////////////////////////////////////////////////////////////////////

  this.calculate_power = function(speed, load) {
    var power = 0
    var pc = self.powercurve.find( pc => pc.possfov == load )
    power = speed * pc.multiplier + pc.additional
    if (power < 0) power = 0
    return power.toFixed(1)
  }

  // /////////////////////////////////////////////////////////////////////////
  // simulate
  // /////////////////////////////////////////////////////////////////////////

  this.simulate = function(windspeed, grade, crr, cw, power) {
    var internal = Buffer.alloc(64)
/*
    var power = config.physics.avg_power
    var mass = config.physics.mass_rider + config.physics.mass_bike 

    // estimate speed in m/s
    var forceofgravity = g * Math.sin(Math.atan(grade / 100)) * mass        
    var forcerollingresistance = g * Math.cos(Math.atan(grade / 100)) * mass * crr
    //var forceaerodynamic = 0.5 * cw * p * Math.pow(speedms + windspeed, 2)
    
    var power = (forceofgravity + forcerollingresistance + forceaerodynamic) * speedms / e

    var simpower = (forceofgravity + forcerollingresistance + forceaerodynamic) * speedms / e

    var speedms = (power - g * mass * (Math.cos(Math.atan(grade/100)) * crr + Math.sin(Math.atan(grade/100))) / Math.pow(0.5 * CX * p,0.5) - windspeed

*/
    internal.writeUInt8(60, 12)                                   // hr
    internal.writeUInt8(0, 14)                                    // flags
    internal.writeUInt32LE(0, 24)                                 // distance
    internal.writeUInt16LE(Math.round( 20 * 2.8054 * 100 ), 32)   // raw speed = kph * 289.75
    internal.writeUInt32LE(0, 34)                                 // accelration
    internal.writeUInt32LE(0, 36)                                 // average_load
    internal.writeUInt16LE(self.powercurve[2].possfov, 38)        // current_load
    internal.writeUInt32LE(0, 40)                                 // target_load
    internal.writeUInt8(90, 42)                                   // pedecho
    internal.writeUInt8(90, 44)                                   // rpm

    return internal
  }

}

module.exports = tacxUSB // export for use in other scripts, e.g.: server.js