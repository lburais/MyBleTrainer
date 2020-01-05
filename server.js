#!/usr/bin/env node
var express = require('express')
var app = require('express')()
var server = require('http').createServer(app) // for getting IP dynamicaly in index.ejs
var io = require('socket.io')(server) // for getting IP dynamicaly in index.ejs
var path = require('path')
var MyServo = require('./MyServo')
var MyBleTrainer = require('./MyBleTrainer')
var DaumBLE = require('./BLE/daumBLE')
const config = require('config-yml') // Use config for yaml config files in Node.js projects
var DEBUG = config.DEBUG.server // turn this on for debug information in consol
const { version } = require('./package.json') // get version number from package.json
// ////////////////////////////////////////////////////////////////////////
// used global variables, because I cannot code ;)
// ////////////////////////////////////////////////////////////////////////

// /////////////////////////////////////////////////////////////////////////
// server path specification
// /////////////////////////////////////////////////////////////////////////
app.use('/public/css', express.static(path.join(__dirname, 'public/css')))
app.use('/public', express.static(path.join(__dirname, 'public')))
app.use('/lib', express.static(path.join(__dirname, 'lib')))
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'ejs')
app.get('/', function (req, res) {
  res.render('index')
})
// /////////////////////////////////////////////////////////////////////////
// server start listening to port 3000
// /////////////////////////////////////////////////////////////////////////

server.listen(process.env.PORT || 3000, function () { // for getting IP dynamicaly in index.ejs and not to enter it manually
  if (DEBUG) console.log('[server.js] - listening on port 3000!')
});
 
// /////////////////////////////////////////////////////////////////////////
// instantiation
// /////////////////////////////////////////////////////////////////////////

var myServo = new MyServo();
myServo.setGear(1);
var brforce = 0;  // breacking force init
var watt=25;
var speedms = 0.0; //init with lowest resistance
var controlled = false;
var daumBLE; // wait for sensor befor start advertising
var myBleTrainer = new MyBleTrainer()

// /////////////////////////////////////////////////////////////////////////
// Web server callback, listen for actions taken at the server GUI, not from Daum or BLE
// /////////////////////////////////////////////////////////////////////////

io.on('connection', socket => {
  if (DEBUG) console.log('[server.js] - connected to socketio')
  socket.on('reset', function (data) {
    io.emit('key', '[server.js] - ergoFACE Server started')
  })
  socket.on('restart', function (data) {
    if (DEBUG) console.log('[server.js] - restart')
    gear = 1
    myServo.setGear(gear)
    io.emit('key', '[server.js] - restart')
  })
  socket.on('reco', function (data) {
    if (DEBUG) console.log('[server.js] - reconnect')
    gear = 1
    myBleTrainer.recon();
    daumBLEinit ();
    io.emit('key', '[server.js] - reconnect')
  })
  socket.on('stop', function (data) {
    if (DEBUG) console.log('[server.js] - stop')
    io.emit('key', '[server.js] - stop')
  })
  socket.on('setGear', function (data) {
    if (DEBUG) console.log('[server.js] - set Gear')
    gear = data
    myServo.setGear(gear)
    io.emit('raw', '[server.js] - set Gear: ' + gear)
  })
})

process.on('SIGINT', () => {
   setTimeout(function(){
    process.exit();
  }, 3000);
})
// /////////////////////////////////////////////////////////////////////////
// Bike information transfer to BLE & Webserver
// /////////////////////////////////////////////////////////////////////////
function daumBLEinit () {
    daumBLE = new DaumBLE(options = {
        name: 'Jo1'
    },serverCallback);

daumBLE.on('disconnect', string => {
    io.emit('control', 'disconnected')
    controlled = false;
});

daumBLE.on('key', string => {
  if (DEBUG) console.log('[server.js] - key: ' + string)
  io.emit('key', '[server.js] - ' + string)
})
daumBLE.on('error', string => {
  if (DEBUG) console.log('[server.js] - error: ' + string)
  io.emit('error', '[server.js] - ' + string)
})


}

myBleTrainer.on('notifications_true', () => {
    daumBLEinit ();
});

myBleTrainer.on('notified', data => {
    // recalculate power if BLE controlled? P = F * v
  //  if (controlled = true) data.power = watt;
    
    if ('rpm' in data) io.emit('rpm', data.rpm);
    if ('speed' in data) {
        speedms = Number(data.speed/3.6).toFixed(4);
        io.emit('speed', data.speed);
    }
    if ('power' in data && controlled == true) {
        var tp=brforce * data.speed/3.6
        data.power = Math.round(tp);
        io.emit('power', data.power);
        
    } else {
        io.emit('power', data.power);
    }
    if ('hr' in data) io.emit('hr', data.hr);
    daumBLE.notifyFTMS(data)
    daumBLE.notifyCSP(data)
    myServo.getSpeed(data.speed, watt)
});


// /////////////////////////////////////////////////////////////////////////
/* BLE callback section */
// /////////////////////////////////////////////////////////////////////////
function serverCallback (message, ...args) {
  console.log('[server.js] - ftms server callback', message)
    var success = false

  switch (message) {
    case 'reset':
      if (DEBUG) console.log('[server.js] - USB Reset triggered via BLE')
      io.emit('key', '[server.js] - Reset triggered via BLE')
      daumUSB.restart()
      success = true
      break
    case 'control': // do nothing special
      if (DEBUG) console.log('[server.js] - Bike under control via BLE')
      io.emit('key', '[server.js] - Bike under control via BLE')
      io.emit('control', 'BIKE CONTROLLED')
      controlled = true
      success = true
      break
    case 'power': // ERG Mode - receive control point value via BLE from zwift or other app
    if (DEBUG) console.log('[server.js] - Bike ERG Mode')
      if (args.length > 0) {
        watt = args[0]
        //daumUSB.setPower(watt)
        brforce=myServo.setWatt(watt);
        
       if (DEBUG) console.log('[server.js] - Bike in ERG Mode - set Power to: ', watt)
        io.emit('raw', '[server.js] - Bike in ERG Mode - set Power to: ' + watt)
        io.emit('control', 'ERG MODE')
        success = true
      }
      break
    case 'simulation': // SIM Mode - calculate power based on physics
      if (DEBUG) console.log('[server.js] - Bike in SIM Mode')
      var windspeed = Number(args[0]).toFixed(1)
      var grade = Number(args[1]).toFixed(1)
      var crr = Number(args[2]).toFixed(4)
      var cw = Number(args[3]).toFixed(2)
      io.emit('raw', '[server.js] - Bike SIM Mode - [wind]: ' + windspeed + ' [grade]: ' + grade + ' [crr]: ' + crr + ' [cw]: ' + cw)
      io.emit('windspeed', windspeed)
      io.emit('grade', grade)
      io.emit('crr', crr)
      io.emit('cw', cw)
        var g = config.simulation.g
        var mRider = config.simulation.mRider // mass in kg of the rider
        var mBike = config.simulation.mBike // mass in kg of the bike
        var mass = mBike + mRider
        var p = config.simulation.p
        var forceofgravity = g * Math.sin(Math.atan(grade / 100)) * mass
        var forcerollingresistance = g * Math.cos(Math.atan(grade / 100)) * mass * crr
                if (speedms > 55) speedms = 0
        var cspeed = parseFloat(speedms);
        var wind = parseFloat(windspeed);
        var forceaerodynamic = 0.5 * cw * p * Math.pow((cspeed + wind), 2)
        var force = forceofgravity + forcerollingresistance + forceaerodynamic
        if (DEBUG) console.log('[server.js] - force ' +  cspeed)
      io.emit('raw', '[server.js] - Bike in SIM Mode - set Power to : ' + power)
      io.emit('simpower', power)
      io.emit('control', 'SIM MODE')
      success = true
      break
  }
  return success
}
