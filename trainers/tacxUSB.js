// ////////////////////////////////////////////////////////////////////////
//
// Configuration
//
// ////////////////////////////////////////////////////////////////////////
var EventEmitter = require('events').EventEmitter
const config = require('config-yml')
var usb = require('usb')
var easyusb = require('./easyUSB')

function tacxUSB() {

  var self = this
  self.deviceUSB = undefined
  self.intervalUSB = undefined
  self.timeUSB = Date.now()
  self.emitter = new EventEmitter()

  var tacxUSB_debug = config.tacxUSB.debug
  var tacxUSB_vid = config.tacxUSB.vendorid 
  var tacxUSB_pid = config.tacxUSB.productid 
  var tacxUSB_datalog = config.tacxUSB.datalog 
  var tacxUSB_simulation = config.tacxUSB.simulation 
  var tacxUSB_datafile = config.tacxUSB.datafile 
  var tacxUSB_interval = config.tacxUSB.period 

  if (tacxUSB_debug) console.log( "Assuming fixed resistance return value from trainer")
  self.possfov = Buffer.from([1039, 1299, 1559, 1819, 2078, 2338, 2598, 2858, 3118, 3378, 3767, 4027, 4287, 4677])  
  // possible force values to be recv from device
  self.reslist = Buffer.from([1900, 2030, 2150, 2300, 2400, 2550, 2700, 2900, 3070, 3200, 3350, 3460, 3600, 3750])  
  // possible resistance value to be transmitted to device

  this.run = function() {
    if (tacxUSB_debug) console.log('[tacxUSB.js] - run')
    self.emitter.emit('key', '[tacxUSB.js] - run')

    var device = usb.findByIds(tacxUSB_vid, tacxUSB_pid)
    if (device.deviceDescriptor.idVendor == tacxUSB_vid && device.deviceDescriptor.idProduct == tacxUSB_pid) {
      if (tacxUSB_debug) console.log('[tacxUSB.js] - found Tacx T1932')
        self.emitter.emit('key', '[tacxUSB.js] - attaching Tacx T1932')
      self.deviceUSB = easyusb([[tacxUSB_vid, tacxUSB_pid]])
      this.init()
    }    

    usb.on('attach', function(device){
      if (device.deviceDescriptor.idVendor == tacxUSB_vid && device.deviceDescriptor.idProduct == tacxUSB_pid) {
        console.warn('[tacxUSB.js] - attaching Tacx T1932')
        self.emitter.emit('key', '[tacxUSB.js] - attaching Tacx T1932')
        self.deviceUSB = easyusb([[tacxUSB_vid, tacxUSB_pid]])
        this.init()
     }    
    })

    usb.on('detach', function(device) {
      if (device.deviceDescriptor.idVendor == tacxUSB_vid && device.deviceDescriptor.idProduct == tacxUSB_pid) {
        console.warn('[tacxUSB.js] - detaching Tacx T1932')
        self.emitter.emit('key', '[tacxUSB.js] - detaching Tacx T1932')
        if (self.deviceUSB) self.deviceUSB.close( function() {self.deviceUSB = undefined})
        if (self.intervalUSB) clearInterval(self.intervalUSB)
        self.deviceUSB = undefined
        self.intervalUSB = undefined
      }    
    })
    return self.emitter
  }

  this.init = function() {
    if (tacxUSB_debug) console.log('[tacxUSB.js] - init')
    self.emitter.emit('key', '[tacxUSB.js] - init')
    
    if (self.deviceUSB) {
      
      // will not read cadence until initialisation byte is sent
      this.write(Buffer.from([0x02, 0x00, 0x00, 0x00]))

      // start read timer
      if (tacxUSB_debug) console.log('[tacxUSB.js] - starting timer')
      self.emitter.emit('key', '[tacxUSB.js] - starting timer')
      var interval = setInterval( this.read, tacxUSB_interval )
      self.intervalUSB = interval
    }
  }

  this.write = function(data) {
    if (tacxUSB_debug) console.log(`[tacxUSB.js] - write data: ${data}`)
    self.emitter.emit('raw', 'TX '+data.toString('hex'))
    if (self.deviceUSB) self.deviceUSB.write(data, self.write_error_callback)
  }

  this.write_callback = function(error) {
    if (error) console.error(`[tacxUSB.js] - write error callback : ${error}`)
  }

  this.read = function() {
    var millis = Date.now() - self.timeUSB
    self.timeUSB = Date.now()
    if (tacxUSB_debug) console.log(`[tacxUSB.js] - read time: ${millis}ms`)
    self.deviceUSB.read(64, self.read_callback)
  }

  this.read_callback = function(error, data) {
    if (error) {
      console.error(`[tacxUSB.js] - read error: ${error}`)
      return
    }

    if (tacxUSB_debug) console.log(`[tacxUSB.js] - read data [${data.length}]: ${data.toString('hex')}`);

    self.emitter.emit('raw', 'TX '+data.toString('hex'))

    self.receive(data)
  }

  this.send = function(resistance_level, pedecho = 0) {
    var r5=int(self.reslist[resistance_level]) & 0xff    //byte 5
    var r6=int(self.reslist[resistance_level])>>8 & 0xff //byte6
    var byte_ints = Buffer.from([0x01, 0x08, 0x01, 0x00, r5, r6, pedecho, 0x00 ,0x02, 0x52, 0x10, 0x04])
    self.write(byte_ints)
  }

  this.receive = function(buffer) {
    if (buffer.length > 40) {
      var data = {}
      data.serial = buffer.readUInt16LE(0)
      data.fixed1 = buffer.readUInt16LE(2)
      data.fixed2 = buffer.readUInt16LE(4)
      data.fixed3 = buffer.readUInt16LE(6)
      data.year = buffer.readUInt8(8)
      data.hr = buffer.readUInt8(12)
      data.buttons = buffer.readUInt8(13)
      data.flags = buffer.readUInt8(14)
      data.distance = buffer.readUInt32LE(24)                
      data.raw_speed = buffer.readUInt16LE(32)               // raw speed = kph * 289.75
      data.acceleration = buffer.readUInt16LE(34)
      data.average_load = buffer.readUInt16LE(36)
      data.current_load = buffer.readUInt16LE(38)
      data.target_load = buffer.readUInt16LE(40)
      data.events = buffer.readUInt8(41)
      data.pedecho = buffer.readUInt8(42)
      data.rpm = buffer.readUInt8(44)

      data.speed = (data.raw_speed/2.8054/100).toFixed(1)    // speed kph

      if (!(data.flags & 0x02)) data.hr = 0
      if (self.possfov[0] != 0 && data.current_load == 0) data.current_load = 1039

      if (!self.possfov.includes(data.current_load)) {
        if (possfov[0] != 0) if (tacxUSB_debug) console.log(`Found variable resistance return value from trainer`)
        // possible resistance value to be transmitted to device
        self.reslist = Buffer.from([0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 11000, 12000, 13000])
        self.possfov = Buffer.from([0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 11000, 12000, 13000])
        // find value with minimum distance to reported force
        var minval = 999999
        var minidx = -1
        for ( let i=0; i < possfov.length; i++) {
          if ( abs(self.possfov[i] - data.power) < minval ) {
            minidx = i
            minval = abs(self.possfov[i] - data.power)
          }
        }
        data.load = self.possfov[minidx]
      } else data.load = data.current_load
      
      data.force_index = self.possfov.indexOf(data.load)

      // compute power
      data.power = data.load

      self.emitter.emit('data', data)
    } else {
      if (tacxUSB_debug) console.log(`[tacxUSB.js] - not enough data received: ${buffer.length}`)
    }
  }

  this.datalog = function(data) {
    return
  }

  this.simulate = function() {
    var buffer = Buffer.alloc(10)
    return buffer
  }

}

module.exports = tacxUSB // export for use in other scripts, e.g.: server.js