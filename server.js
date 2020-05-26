#!/usr/bin/env node
// ========================================================================
// server.js
//
// Main application to bridge Tacx T1932 with FTMS BLE
//
// ========================================================================

var express = require('express')
var app = require('express')()
var server = require('http').createServer(app)
var io = require('socket.io')(server)
const config = require('config-yml')
const path = require('path')

var message = require('./lib/message')


// ////////////////////////////////////////////////////////////////////////
// Configuration
// ////////////////////////////////////////////////////////////////////////

// /////////////////////////////////////////////////////////////////////////
// Smart Trainer instantiation
// /////////////////////////////////////////////////////////////////////////

var smarttrainer = require('./BLE/smart-trainer')
var smart_trainer; // wait for sensor befor start advertising

// /////////////////////////////////////////////////////////////////////////
// Web server
// /////////////////////////////////////////////////////////////////////////

app.use('/public/css', express.static(path.join(__dirname, 'public/css')))
app.use('/public', express.static(path.join(__dirname, 'public')))
app.use('/lib', express.static(path.join(__dirname, 'lib')))
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'html')
app.engine('html', require('ejs').renderFile)
app.get('/', function (req, res) {
  res.render('index.html')
})

server.listen(process.env.PORT || config.globals.server, function () {
  // for getting IP dynamicaly in index.ejs and not to enter it manually
  message(`listening on port ${process.env.PORT || config.globals.server}`)
})

// /////////////////////////////////////////////////////////////////////////
// Ant Trainer
// /////////////////////////////////////////////////////////////////////////

/*
var trainerANT = require('./trainers/trainerANT')
var trainer_ant = new trainerANT()

trainer_ant.on('notifications_true', () => {
smart_trainer_init ();
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
*/

// /////////////////////////////////////////////////////////////////////////
// Tacx USB
// /////////////////////////////////////////////////////////////////////////

var tacxUSB = require('./trainers/tacxUSB')
var tacx_usb = new tacxUSB()

tacx_obs = tacx_usb.run()

tacx_obs.on('log', data => {
  message(data.msg, data.level)
})

tacx_obs.on('error', string => {
  message(string, 'error')
})

tacx_obs.on('usb', string => {
  message(string)
  io.emit('usb', string)
})

tacx_obs.on('setup', data => {
  message('setup: ' + JSON.stringify(data))
  io.emit('data', string)
})

tacx_obs.on('data', data => {
  message(JSON.stringify(data))
  io.emit('data', data)
  smart_trainer.notifyFTMS(data)
})

// /////////////////////////////////////////////////////////////////////////
// Web server callback, listen for actions taken at the server GUI,
// not from Ant, Daum or BLE
// /////////////////////////////////////////////////////////////////////////

io.on('connection', socket => {

  message(`connected to socketio`)

  socket.on('reset', function (data) {
    message('VirtualTrainer Server started')
  })

  socket.on('restart', function (data) {
    message('restarted')
  })

  socket.on('reco', function (data) {
    message('reconnect')
    smart_trainer_init ()
  })

  socket.on('stop', function (data) {
    message('stopped')
  })

  socket.on('log', function (data) {
    // forward to client
    //console.info(JSON.stringify(data))
    io.emit('log', data.message)
  })

  socket.on('data', function (data) {
    tacx_usb.setParameters(data)
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
    message(`disconnected: ${string}`)
    io.emit('control', 'disconnected')
  })

  smart_trainer.on('error', string => {
    message(`error: ${string}`, 'error')
    io.emit('error', '[server.js] - ' + string)
  })

  smart_trainer.on('accept', string => {
    message(`accept: ${string}`)
    io.emit('accept', '[server.js] - ' + string)
  })
}

// /////////////////////////////////////////////////////////////////////////
// BLE callback section
// /////////////////////////////////////////////////////////////////////////

function serverCallback (control, ...args) {
  message(`ftms server callback: ${control}`)

  var success = false

  switch (control) {
    case 'reset': {
      message('USB Reset triggered via BLE')
      io.emit('data', {control: '-', windspeed: "-", grade: "-", crr: "-", cw: "-", setpower: "-", estimatepower: "-", estimatespeed: "-" })
      tacx_usb.restart()
      success = true
      break
    }

    case 'disconnect': {
      var power = tacx_usb.setPower(0)
      message('disconnected')
      io.emit('data', {control: '-', windspeed: "-", grade: "-", crr: "-", cw: "-", setpower: "-", estimatepower: "-", estimatespeed: "-" })
      success = true
      break
    }

    case 'control': {// do nothing special
      message('Bike under control via BLE')
      io.emit('data', {control: 'CONTROLLED', windspeed: "-", grade: "-", crr: "-", cw: "-", setpower: "-", estimatepower: "-", estimatespeed: "-" })
      success = true
      break
    }

    case 'power': {// ERG Mode - receive control point value via BLE from zwift or other app
      if (args.length > 0) {

        watt = Number(args[0]).toFixed(0)
        var power = tacx_usb.setPower(watt)

        message(`Bike in ERG Mode - set Power to: ${watt}W`)
        io.emit('data', {control: 'ERG MODE', windspeed: "-", grade: "-", crr: "-", cw: "-", setpower: watt })
        success = true
      }
      break
    }

    case 'simulation': {// SIM Mode - calculate power based on physics: https://www.gribble.org/cycling/power_v_speed.html
      if (args.length > 3) {

        // crr and windspeed values sent from ZWIFT / FULLGAZ are crazy, specially FULLGAZ, when starting to decent, this drives up the wattage to above 600W
        var windspeed = Number(args[0]).toFixed(1)
        var grade = Number(args[1]).toFixed(1)
        var crr = Number(args[2]).toFixed(4)       // coefficient of rolling resistance
        var cw = Number(args[3]).toFixed(2)        // coefficient of drag

        var power = tacx_usb.setSimulation( windspeed, grade, crr, cw)

        message(`SIM calculated power [wind: ${windspeed} - grade: ${grade} - crr: ${crr} - cw: ${cw}]:  ${power}W`)

        message(`Bike in SIM Mode - set Power to : ${power}W`)
        io.emit('data', {control: 'SIM MODE', windspeed: windspeed, grade: grade, crr: crr, cw: cw, setpower: "-" })
        success = true
      }
      break
    }

    case 'grade': {// SIM Mode - calculate power based on physics: https://www.gribble.org/cycling/power_v_speed.html
      if (args.length > 0) {

        var grade = Number(args[0]).toFixed(1)

        var power = tacx_usb.setSimulation( undefined, grade, undefined, undefined)

        message(`SIM calculated power [grade: ${grade}]:  ${power}W`)

        message(`Bike in SIM Mode - set Power to : ${power}W`)
        io.emit('data', {control: 'SIM MODE', windspeed: "-", grade: grade, crr: "-", cw: "-", setpower: "-" })
        success = true
      }
      break
    }
  }
  return success
}
