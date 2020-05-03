var EventEmitter = require('events').EventEmitter
const config = require('config-yml')
var usb = require('usb')
var easyusb = require('./easyUSB')


var tacxUSB_debug = config.tacxUSB.debug
var tacxUSB_vid = config.tacxUSB.vendorid 
var tacxUSB_pid = config.tacxUSB.productid 
var tacxUSB_datalog = config.tacxUSB.datalog 
var tacxUSB_simulation = config.tacxUSB.simulation 
var tacxUSB_datafile = config.tacxUSB.datafile 
var tacxUSB_interval = config.tacxUSB.period 

// /////////////////////////////////////////////////////////////////////////
// instantiation
// /////////////////////////////////////////////////////////////////////////

class tacxUSB extends EventEmitter {
  constructor() {
    if (tacxUSB_debug) console.log('[tacxUSB.js] constructor')
    super()
    this.deviceUSB = undefined
    this.intervalUSB = undefined
  }

  run() {
    if (tacxUSB_debug) console.log('[tacxUSB.js] - run')

    var device = usb.findByIds(tacxUSB_vid, tacxUSB_pid)
    if (device.deviceDescriptor.idVendor == tacxUSB_vid && device.deviceDescriptor.idProduct == tacxUSB_pid) {
      if (tacxUSB_debug) console.log('[tacxUSB.js] - found Tacx T1932')
      this.deviceUSB = easyusb([[tacxUSB_vid, tacxUSB_pid]])
      this.init()
    }    

    usb.on('attach', function(device){
      if (device.deviceDescriptor.idVendor == tacxUSB_vid && device.deviceDescriptor.idProduct == tacxUSB_pid) {
        if (tacxUSB_debug) console.log('[tacxUSB.js] - attaching Tacx T1932')
      this.deviceUSB = easyusb([[tacxUSB_vid, tacxUSB_pid]])
      this.init()
     }    
    })

    usb.on('detach', function(device) {
      if (device.deviceDescriptor.idVendor == tacxUSB_vid && device.deviceDescriptor.idProduct == tacxUSB_pid) {
        if (tacxUSB_debug) console.log('[tacxUSB.js] - detaching Tacx T1932')
        if (this.deviceUSB) this.deviceUSB.close( function() {this.deviceUSB = undefined})
        this.deviceUSB = undefined
      }    
    })
  }

  init() {
    if (tacxUSB_debug) console.log('[tacxUSB.js] - init')
    
    if (this.deviceUSB) {
      
      // will not read cadence until initialisation byte is sent
      this.write(Buffer.from([0x02, 0x00, 0x00, 0x00]))

      // start read timer
      var interval = setInterval( this.read, tacxUSB_interval, this.deviceUSB, this.read_callback )
      this.intervalUSB = interval
    }
  }

  write(data) {
    if (tacxUSB_debug) console.log('[tacxUSB.js] - write data: ', data)
    if (this.deviceUSB) this.deviceUSB.write(data, this.write_error_callback)
  }

  write_callback(error) {
    if (error) {
      if (tacxUSB_debug) console.log('[tacxUSB.js] - write error callback : ', error)
    } else {
        //
    }
  }

  read( device, callback ) {
    device.read(0x82, callback)
  }

  read_callback(error, data) {
    if (error) {
      if (tacxUSB_debug) console.log('[tacxUSB.js] - read error: ', error)
      return this.deviceUSB.close();
    }

    if (tacxUSB_debug) console.log('[tacxUSB.js] - read data: ', data);
  }

  datalog() {
    return
  }

  simulate() {
    return
  }

}

module.exports = tacxUSB // export for use in other scripts, e.g.: server.js