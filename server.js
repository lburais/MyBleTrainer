#!/usr/bin/env node
// ========================================================================
// server.js
//
// Main application to bridge Tacx T1932 with FTMS BLE
//
// ========================================================================

var express = require('express')
var app = require('express')()
var server = require('http').createServer(app) // for getting IP dynamicaly in index.ejs
var io = require('socket.io')(server) // for getting IP dynamicaly in index.ejs
var path = require('path')
const { version } = require('./package.json') 
const config = require('config-yml') 
var logger = require('./lib/logger')
var physics = require('./lib/physics')

//physics.setPowerTable(windspeed = 0, crr = 1, cw = 1)
physics.setPowerTable(0,1,1)
console.log('table : ' + JSON.stringify(physics.power_for_speed_and_grade))
process.exit(1)

// ////////////////////////////////////////////////////////////////////////
// Configuration
// ////////////////////////////////////////////////////////////////////////

var DEBUG = config.globals.debug 
var webDEBUG = (config.globals.debugWWW || DEBUG)
var usbDEBUG = (config.globals.debugUSB || DEBUG)
var antDEBUG = (config.globals.debugANT || DEBUG)
var bleDEBUG = (config.globals.debugBLE || DEBUG)

var antRUN = config.equipments.trainerANT
var bleRUN = config.equipments.trainerBLE
var tacxRUN = config.equipments.tacxUSB

// ////////////////////////////////////////////////////////////////////////
// VirtualTrainer specific
// ////////////////////////////////////////////////////////////////////////

var speed = 0.0
var power = 0.0
var controlled = false

// /////////////////////////////////////////////////////////////////////////
// Smart Trainer instantiation
// /////////////////////////////////////////////////////////////////////////

var smarttrainer = require('./BLE/smart-trainer')
var smart_trainer; // wait for sensor befor start advertising

// /////////////////////////////////////////////////////////////////////////
// BLE trainer
// /////////////////////////////////////////////////////////////////////////

if (bleRUN) {
  var trainerBLE = require('./trainers/trainerBLE')
  var trainer_ble = new trainerBLE()

  trainer_ble.on('notifications_true', () => {
    smart_trainer_init ()
  });

  trainer_ble.on('notified', data => {
    // recalculate power if BLE controlled? P = F * v
    
    if ('rpm' in data) io.emit('rpm', data.rpm)
    if ('speed' in data) {
      speedms = Number(data.speed/3.6).toFixed(4)
      //  servo_gpio.getSpeed(data.speed, watt)

      io.emit('speed', data.speed);
    }
    if ('power' in data && controlled == true && brforce > 0) {
      var tp=brforce * data.speed/3.6
      data.power = Math.round(tp)
      io.emit('power', data.power)
        
    } else {
      io.emit('power', data.power)
    }
    if ('hr' in data) io.emit('hr', data.hr)

    smart_trainer.notifyFTMS(data)
    //smart_trainer.notifyCSP(data)
  })
}

// /////////////////////////////////////////////////////////////////////////
// Ant Trainer
// /////////////////////////////////////////////////////////////////////////

if (antRUN) {
  var trainerANT = require('./trainers/trainerANT')
  var trainer_ant = new trainerANT()

  trainer_ant.on('notifications_true', () => {
    smart_trainer_init ();
    trainer_ble.discon(); //prefer Ant over BLE Sensors
  });

  trainer_ant.on('notified', data => {
    // recalculate power if BLE controlled? P = F * v
    
    if ('rpm' in data) io.emit('rpm', data.rpm.toFixed(0))
    if ('speed' in data) {
        speedms = Number(data.speed/3.6).toFixed(4)
        //servo_gpio.getSpeed(data.speed, watt)

        io.emit('speed', data.speed.toFixed(1))
    }
    if ('power' in data && controlled == true && brforce > 0) {
      var tp=brforce * data.speed/3.6
      data.power = Math.round(tp)
      io.emit('power', data.power)
    } else {
      io.emit('power', data.power)
    }
    
    if ('hr' in data) io.emit('hr', data.hr)
    
    if (!measuring) {
      smart_trainer.notifyFTMS(data)
      //smart_trainer.notifyCSP(data)
    } 
    else {
      measuring = smart_trainer.measure(data)
      io.emit('key', '[server.js] - measured?')
      if (!measuring) {
        io.emit('measured')
        io.emit('key', '[server.js] - yes!')
      }
    } 
  })
}

// /////////////////////////////////////////////////////////////////////////
// Tacx USB
// /////////////////////////////////////////////////////////////////////////

if (tacxRUN) {
  var tacxUSB = require('./trainers/tacxUSB')
  var tacx_usb = new tacxUSB()

  tacx_obs = tacx_usb.run()

  tacx_obs.on('error', string => {
    if (webDEBUG) logger.info('[server.js] - error: ' + string)
    io.emit('error', '[server.js] - ' + string)
  })

  tacx_obs.on('key', string => {
    if (webDEBUG) logger.info('[server.js] - key: ' + string)
    io.emit('key', '[server.js] - ' + string)
  })

  tacx_obs.on('raw', string => {
    if (webDEBUG) logger.info('[server.js] - raw: ', string)
    io.emit('raw', string)
    io.emit('version', version) // emit version number to webserver
  })

  tacx_obs.on('data', data => { 
    if (webDEBUG) logger.info('[server.js] - data: ' + JSON.stringify(data))
    if ('speed' in data) io.emit('speed', data.speed)
    if ('speed' in data) global.speed = data.speed
    if ('power' in data) io.emit('power', data.power)
    if ('hr' in data) io.emit('hr', data.hr)
    if ('rpm' in data) io.emit('rpm', data.rpm)
    if ('force_index' in data) io.emit('level', data.force_index)
    smart_trainer.notifyFTMS(data)
    //smart_trainer.notifyCSP(data)
  })
}

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

server.listen(process.env.PORT || config.globals.server, function () { 
  // for getting IP dynamicaly in index.ejs and not to enter it manually
  if (webDEBUG) logger.info('[server.js] - listening on port 3000!')
})
 
// /////////////////////////////////////////////////////////////////////////
// Web server callback, listen for actions taken at the server GUI, 
// not from Ant, Daum or BLE
// /////////////////////////////////////////////////////////////////////////

io.on('connection', socket => {

  if (webDEBUG) logger.info('[server.js] - connected to socketio')

  socket.on('reset', function (data) {
    io.emit('key', '[server.js] - VirtualTrainer Server started')
  })

  socket.on('restart', function (data) {
    if (webDEBUG) logger.info('[server.js] - restart')
    io.emit('key', '[server.js] - restart')
  })

  socket.on('reco', function (data) {
    if (webDEBUG) logger.info('[server.js] - reconnect')
    if (bleRUN) trainer_ble.recon()
    smart_trainer_init ()
    io.emit('key', '[server.js] - reconnect')
  })

  socket.on('stop', function (data) {
    if (webDEBUG) logger.info('[server.js] - stop')
    io.emit('key', '[server.js] - stop')
  })

  })

process.on('SIGINT', () => { setTimeout(function(){ process.exit() }, 3000) })

// /////////////////////////////////////////////////////////////////////////
// VirtualTrainer BLE : Bike information transfer to BLE & Webserver
// /////////////////////////////////////////////////////////////////////////

smart_trainer_init ()

function smart_trainer_init () {
  smart_trainer = new smarttrainer(options = {
    name: 'Smart Trainer Bridge'
  },serverCallback)

  smart_trainer.on('disconnect', string => {
    io.emit('control', 'disconnected')
  })

  smart_trainer.on('key', string => {
    io.emit('key', '[server.js] - ' + string)
  })

  smart_trainer.on('error', string => {
    if (webDEBUG) logger.error('[server.js] - error: ' + string)
    io.emit('error', '[server.js] - ' + string)
  })

  smart_trainer.on('accept', string => {
    io.emit('accept', '[server.js] - ' + string)
  })

  smart_trainer.on('accept', string => {
    io.emit('accept', '[server.js] - ' + string)
  })
}

// /////////////////////////////////////////////////////////////////////////
// BLE callback section 
// /////////////////////////////////////////////////////////////////////////

function serverCallback (message, ...args) {
  logger.info('[server.js] - ftms server callback', message)
  var success = false

  switch (message) {
    case 'reset':
      if (webDEBUG) logger.info('[server.js] - USB Reset triggered via BLE')
      io.emit('key', '[server.js] - Reset triggered via BLE')
      if (tacxRUN) tacx_usb.restart()
      success = true
      break

    case 'control': // do nothing special
      if (webDEBUG) logger.info('[server.js] - Bike under control via BLE')
      io.emit('key', '[server.js] - Bike under control via BLE')
      io.emit('control', 'BIKE CONTROLLED')
      //globals.controlled = true
      success = true
      break

    case 'power': // ERG Mode - receive control point value via BLE from zwift or other app
      if (webDEBUG) logger.info('[server.js] - Bike ERG Mode')
      if (args.length > 0) {
        watt = args[0]
        if (tacxRUN) tacx_usb.setPower(watt, global.speed)
        if (webDEBUG) logger.info('[server.js] - Bike in ERG Mode - set Power to: ', watt)
        io.emit('raw', '[server.js] - Bike in ERG Mode - set Power to: ' + watt)
        io.emit('control', 'ERG MODE')
        success = true
      }
      break

    case 'simulation': // SIM Mode - calculate power based on physics: https://www.gribble.org/cycling/power_v_speed.html
      if (webDEBUG) logger.info('[server.js] - Bike in SIM Mode')
      if (args.length > 3) {

        // crr and windspeed values sent from ZWIFT / FULLGAZ are crazy, specially FULLGAZ, when starting to decent, this drives up the wattage to above 600W
        var windspeed = Number(args[0]).toFixed(1)
        var grade = Number(args[1]).toFixed(1)
        var crr = Number(args[2]).toFixed(4)       // coefficient of rolling resistance 
        var cw = Number(args[3]).toFixed(2)        // coefficient of drag
        
        io.emit('raw', '[server.js] - Bike SIM Mode - [wind]: ' + windspeed + ' [grade]: ' + grade + ' [crr]: ' + crr + ' [cw]: ' + cw)
        io.emit('windspeed', windspeed)
        io.emit('grade', grade)
        io.emit('crr', crr)
        io.emit('cw', cw)

        var simpower = physics.estimatePower(windspeed, grade, crr, cw, global.speed)
        
        if (tacxRUN) tacx_usb.setPower(simpower, global.speed)

        if (webDEBUG) logger.info(`[trainerSIM.js] - SIM calculated power:  ${simpower}W`)
        io.emit('raw', '[server.js] - Bike in SIM Mode - set Power to : ' + power)
        io.emit('simpower', power)
        io.emit('control', 'SIM MODE')
        
        success = true
      }
      break
  }
  return success
}
