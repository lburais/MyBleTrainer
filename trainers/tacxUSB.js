var EventEmitter = require('events').EventEmitter
var com = require('serialport')
const config = require('config-yml') // Use config for yaml config files in Node.js projects
var usb = require('usb')
var usbDetect = require('usb-detection');


var DEBUG = config.tacxUSB.debug
var tacxUSB_vid = config.tacxUSB.vendorid 
var tacxUSB_pid = config.tacxUSB.productid 

// /////////////////////////////////////////////////////////////////////////
// instantiation
// /////////////////////////////////////////////////////////////////////////

class tacxUSB extends EventEmitter {
  constructor() {
    if (DEBUG) console.log('[tacxUSB.js] constructor')
    super()
    this.device = undefined
  }

  run() {
    var device = usb.findByIds(tacxUSB_vid, tacxUSB_pid)
    if (device.deviceDescriptor.idVendor == tacxUSB_vid && device.deviceDescriptor.idProduct == tacxUSB_pid) {
      if (DEBUG) console.log('[tacxUSB.js] - found Tacx T1932')
      this.device = device
    }    

    usb.on('attach', function(device){
      if (device.deviceDescriptor.idVendor == tacxUSB_vid && device.deviceDescriptor.idProduct == tacxUSB_pid) {
        if (DEBUG) console.log('[tacxUSB.js] - attaching Tacx T1932')
        this.device = device
      }    
    })

    usb.on('detach', function(device){
      if (device.deviceDescriptor.idVendor == tacxUSB_vid && device.deviceDescriptor.idProduct == tacxUSB_pid) {
        if (DEBUG) console.log('[tacxUSB.js] - detaching Tacx T1932')
        this.device = undefined
      }    
    })
  }

}

// /////////////////////////////////////////////////////////////////////////
	
function tacxUSBold () {
  var self = this
  self.port = null
  self.pending = [] // buffer for pushing pending commands to the port
  self.writer = null // used for flushing next pending data
  self.reader = null // used for 'runData' command
  self.readeradress = null // used for 'getAdress' command
  self.emitter = new EventEmitter()

  // //////////////////////////////////////////////////////////////////////////
  // open port as specified by daum
  // /////////////////////////////////////////////////////////////////////////
  this.open = function () {
    //com.list(function (err, ports) {
    com.list().then(ports => {
      //if (err) {
      //  self.emitter.emit('error', '[tacxUSB.js] - open: ' + err)
      //  throw err
      //}
      ports.forEach(function (p) {
        if (p.vendorId && p.productId) { // ??? don't know if this is the ID of ergobike, or the serial adapter, this has to be configured for every bike, so I might skip it
          if (DEBUG) console.log('[tacxUSB.js] - open:' + p.vendorId + '  ' + p.productId) // RS232 converter Ids
          if (DEBUG) console.log('[tacxUSB.js] - open - Ergobike found on port ' + p.comName)
          self.emitter.emit('key', '[tacxUSB.js] - Ergobike found on port ' + p.comName)
          var port = new com.SerialPort(p.comName, {
            baudrate: config.port.baudrate,
            dataBits: config.port.dataBits,
            parity: config.port.parity,
            stopBits: config.port.stopBits,
            flowControl: config.port.flowControl,
            parser: com.parsers.byteLength(config.port.parserLength) // custom parser set to byte length that is more than the actual response message of ergobike, but no other way possible right know
          }, false) // thats why the index loops in 'readAndDispatch' are used to get the prefix of each command
          port.open(function () {
            self.port = port
            port.on('data', self.readAndDispatch)
            self.writer = setInterval(self.flushNext, config.intervals.flushNext) // this is writing the data to the port; i've put here the timeout of DAUM interface spec; 50ms
            if (gotAdressSuccess === false) { // check, otherwise after a restart via webserver, this will run again
              if (DEBUG) console.log('[tacxUSB.js] - looking for cockpit adress')
              self.emitter.emit('key', '[tacxUSB.js] - looking for cockpit adress')
              self.readeradress = setInterval(self.getAdress, config.intervals.getAdress) // continiously get adress from ergobike, the interval is canceled if gotAdressSuccess is true
            }
            if (DEBUG) console.log('[tacxUSB.js] - runData')
            self.emitter.emit('key', '[tacxUSB.js] - runData')
            self.reader = setInterval(self.runData, config.intervals.runData) // continiously get 'run_Data' from ergobike; 500ms means, every 1000ms a buffer
          })
        }
      })
    })
    return self.emitter
  }
  
  // //////////////////////////////////////////////////////////////////////////
  // push data in queue before flushNext is writing it to port
  // //////////////////////////////////////////////////////////////////////////
  this.write = function (string) {
    self.pending.push(string)
    if (DEBUG) console.log('[tacxUSB.js] - this.write - [OUT]: ', string)
  }

  // //////////////////////////////////////////////////////////////////////////
  // send (flush) pending messages to port (sequencial)
  // //////////////////////////////////////////////////////////////////////////
  this.flushNext = function () {
    if (self.pending.length === 0) {
      if (DEBUG) console.log('[tacxUSB.js] - this.flushNext - nothing pending')
      return
    }
    var string = self.pending.shift()
    if (self.port) {
      var buffer = new Buffer.from(string)
      if (DEBUG) console.log('[tacxUSB.js] - flushNext - [OUT]: ', buffer)
      self.port.write(buffer)
    } else {
      if (DEBUG) console.log('[tacxUSB.js] - flushNext - Communication port is not open - not sending data: ' + string)
    }
  }

  // //////////////////////////////////////////////////////////////////////////
  // used when port open to get data stream from buffer and grab the values, e.g. speed, rpm,...
  // //////////////////////////////////////////////////////////////////////////
  this.readAndDispatch = function (numbers) {
    if (DEBUG) console.log('[tacxUSB.js] - readAndDispatch - [IN]: ', numbers)
    self.emitter.emit('raw', numbers)
    var states = numbers
    var statesLen = states.length
    if (gotAdressSuccess === false) { // this loop is for parsing the cockpit adress
      var i
      for (i = 0; i < statesLen; i++) {
        if (DEBUG) console.log('[tacxUSB.js] - getAdress - [Index]: ', i, ' ', states[i])
        if (states[i].toString(16) === config.daumCommands.get_Adress) { // search for getAdress prefix
          var index = i
          if (DEBUG) console.log('[tacxUSB.js] - getAdress - [Index]: ', index)
          daumCockpitAdress = (states[1 + index]).toString() // get the adress from the stream by using the index
          if (DEBUG) console.log('[tacxUSB.js] - getAdress - [Adress]: ', daumCockpitAdress)
          self.emitter.emit('key', '[tacxUSB.js] - getAdress - [Adress]: ' + daumCockpitAdress)
          clearInterval(self.readeradress) // stop looking for adress
          self.pending = [] // clear pending array
          gotAdressSuccess = true // adress is retrieved, lets set this to true to inform other functions that they can proceed now
          setTimeout(self.start, config.timeouts.start) // timeout is neccesarry to changes gears back to 1; there is an invalid value send, that sets gear 17 = 0x11, this should be filtered before data is read, but does not work
          if (DEBUG) console.log('[tacxUSB.js] - getAdress - [gotAdressSuccess]: ', gotAdressSuccess)
          break // stop if prefix found and break
        }
      }
    } else {
      for (i = 0; i < (statesLen - 2); i++) { // this loop is for parsing the datastream after gotAdressSuccess is true and we can use the adress for commands
        if (states[i].toString(16) === config.daumCommands.run_Data && states[i + 1].toString(16) === daumCockpitAdress && states[i + 2] === 0) { // and search for the runData and daumCockpitAdress and manuall watt program prefix
          index = i
          if (DEBUG) console.log('[tacxUSB.js] - runData - [Index]: ', index)
          break // stop if prefix found and break
        }
        if (i === statesLen - 3) {
          if (DEBUG) console.log('[tacxUSB.js] - runData - [Index]: WRONG PROGRAM SET - SET MANUAL WATTPROGRAM 00')
          self.emitter.emit('error', '[tacxUSB.js] - runData - [Index]: WRONG PROGRAM SET - SET MANUAL WATTPROGRAM 00')
        }
      }
    }
    var data = {}
    if (states.length >= 19 && gotAdressSuccess === true) { // gotAdressSuccess check to avoid invalid values 0x11 = 17 at startup; just check if stream is more than value, this is obsulete, because of custom parser that is parsing 40 bytes
      // var cadence = (states[6 + index])
      // if (!isNaN(cadence) && (cadence >= config.daumRanges.min_rpm && cadence <= config.daumRanges.max_rpm)) {
      //   data.cadence = cadence
      // }
      // var hr = 99 // !!! can be deleted - have to check BLE code on dependencies
      // if (!isNaN(hr)) { data.hr = hr } // !!! can be deleted - have to check BLE code on dependencies

      var rpm = (states[6 + index])
      if (!isNaN(rpm) && (rpm >= config.daumRanges.min_rpm && rpm <= config.daumRanges.max_rpm)) {
        data.rpm = rpm
        global.globalrpm_daum = data.rpm // global variables used, because I cannot code ;)
      }
      var gear = (states[16 + index])
      if (!isNaN(gear) && (gear >= config.daumRanges.min_gear && gear <= config.daumRanges.max_gear)) {
        if (gear > config.gpio.maxGear) { // beacause Daum has by default 28 gears, check and overwrite if gpio maxGear is lower
          gear = config.gpio.maxGear // ceiling the maxGear with parameter
          self.setGear(gear) // overwrite gear to Daum
        }
        data.gear = gear
        global.globalgear_daum = data.gear // global variables used, because I cannot code ;)
      }
      var program = (states[2 + index])
      if (!isNaN(program) && (program >= config.daumRanges.min_program && program <= config.daumRanges.max_program)) {
        data.program = program
      }
      if (rpm === 0) { // power -  25 watt will allways be transmitted by daum; set to 0 if rpm is 0 to avoid rolling if stand still in applications like zwift or fullgaz
        var power = 0
        data.power = power
      } else {
        power = (states[5 + index])
        if (!isNaN(power) && (power >= config.daumRanges.min_power && power <= config.daumRanges.max_power)) {
          data.power = power * config.daumRanges.power_factor // multiply with factor 5, see Daum spec
        }
      }

      // calculating the speed based on the RPM to gain some accuracy; speed signal is only integer
      // as long os the gearRatio is the same as in the spec of DAUM, the actual speed on the display and the calculated one will be the same
      // var gearRatio = config.gears.ratioLow + (data.gear - 1) * config.gears.ratioHigh // MICHAEL's: 34:25 & 50:11 20 speed; DAUM: the ratio starts from 42:24 and ends at 53:12; see TRS_8008 Manual page 57
      var gearRatio = config.gearbox['g' + data.gear] // MICHAEL's: 34:25 & 50:11 20 speed; DAUM: the ratio starts from 42:24 and ends at 53:12; see TRS_8008 Manual page 57
      var circumference = config.gears.circumference // cirvumference in cm
      var distance = gearRatio * circumference // distance in cm per rotation
      var speed = data.rpm * distance * config.gears.speedConversion // speed in km/h
      // var speed = (states[7 + index])
      if (!isNaN(speed) && (speed >= config.daumRanges.min_speed && speed <= config.daumRanges.max_speed)) {
        data.speed = Number(speed).toFixed(1) // reduce number of decimals after calculation to 1
        global.globalspeed_daum = data.speed // global variables used, because I cannot code ;)
        if (global.globalmode === 'SIM') { // run power simulation here in parallel to server.js to enhance resolution of resistance, e.g.: ble only triggers sim once per second, but if you pedal faster, this needs to be here.
          daumSIM.physics(global.globalwindspeed_ble, global.globalgrade_ble, global.globalcrr_ble, global.globalcw_ble, global.globalrpm_daum, global.globalspeed_daum, global.globalgear_daum)
          self.setPower(Number(global.globalsimpower_daum).toFixed(0))
        }
      }
      if (Object.keys(data).length > 0) self.emitter.emit('data', data) // emit data for further use
    } else {
      self.unknownHandler(numbers) // is obsolete, becasuse of custom parser that parses 40 bytes - but just in case to have some error handling
    }
  }

  // //////////////////////////////////////////////////////////////////////////
  // unknown handlers start
  // //////////////////////////////////////////////////////////////////////////
  this.unknownHandler = function (numbers) {
    if (DEBUG) console.log('[tacxUSB.js] - unknownHandler - Unrecognized packet: ', numbers)
    self.emitter.emit('error', '[tacxUSB.js] - unknownHandler: ' + numbers)
  }

  

  // //////////////////////////////////////////////////////////////////////////
  // restart port
  // //////////////////////////////////////////////////////////////////////////
  this.restart = function () {
    if (DEBUG) console.log('[tacxUSB.js] - Daum restart')
    if (self.port.isOpen) {
      self.stop()
      self.port.close()
    }
    setTimeout(self.open, config.timeouts.open)
    setTimeout(self.start, config.timeouts.start)
  }
  
  // //////////////////////////////////////////////////////////////////////////
  // start sequence - this is just a dummy, because getAdress is used during port initialization
  // //////////////////////////////////////////////////////////////////////////
  this.start = function () { 
    // start
  }

  // //////////////////////////////////////////////////////////////////////////
  // stop port - no start function, use restart after stop
  // //////////////////////////////////////////////////////////////////////////
  this.stop = function () {
    self.pending = [] // overwrite pending array - like flush
    if (self.writer) {
      clearInterval(self.writer) // stop writing to port
    }
    if (self.reader) {
      clearInterval(self.reader) // stop reading 'run_data' from port
    }
    if (self.readeradress) {
      clearInterval(self.readeradress) // stop reading adress from port - this is canceled as soon as gotAdressSuccess is true, but in case stop happens before this event.
    }
  }
}

module.exports = tacxUSB // export for use in other scripts, e.g.: server.js