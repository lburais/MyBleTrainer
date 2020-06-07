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
// Web server callback, listen for actions taken at the Web page
// /////////////////////////////////////////////////////////////////////////

io.on('connection', socket => {

  message(`connected to socketio`)
  tacx_usb.refreshWebPage()

  socket.on('action', function (data) {
    switch(data) {
      case 'reset': {
        message('VirtualTrainer Server started')
        tacx_usb.reset()
        break
      }

      case 'refresh': {
        message('refresh')
        tacx_usb.refreshWebPage()
        break
      }

      case 'restart': {
        message('restarted')
        tacx_usb.restart()
        break
      }

      case 'start': {
        message('start')
        tacx_usb.start()
        break
      }

      case 'stop': {
        message('stopped')
        tacx_usb.stop()
        break
      }
    }
  })

  socket.on('log', function (data) {
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
  })

  smart_trainer.on('error', string => {
    message(`error: ${string}`, 'error')
  })

  smart_trainer.on('accept', string => {
    message(`accept: ${string}`)
  })
}

// /////////////////////////////////////////////////////////////////////////
// Ant Trainer
// /////////////////////////////////////////////////////////////////////////

var sensorANT = require('./trainers/sensorANT')
var sensor_ant = new sensorANT()
var sensor_ant_data = {}

sensor_ant.on('log', data => {
  message(data.msg, data.level)
})

sensor_ant.on('data', data => {
  message(`From ANT: ${JSON.stringify(data)}`)
  io.emit('ant', data)
  sensor_ant_data = data
})


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

tacx_obs.on('param', data => {
  // do not forward to FTMS
  message(`Parameters: ${JSON.stringify(data)}`)
  io.emit('tacx', data)
})

tacx_obs.on('data', data => {
  message(`From USB: ${JSON.stringify(data)}`)
  io.emit('tacx', data)
  
  var out_data = {}
  if ('power' in data) out_data.power = data.power

  if (('speed' in data) && config.tacxUSB.speed) out_data.speed = data.speed
  else if ('speed' in sensor_ant_data) out_data.speed = sensor_ant_data.speed

  if (('rpm' in data) && config.tacxUSB.rpm) out_data.rpm = data.rpm
  else if ('rpm' in sensor_ant_data) out_data.rpm = sensor_ant_data.rpm

  if (('hr' in data) && config.tacxUSB.hr) out_data.hr = data.hr
  else if ('hr' in sensor_ant_data) out_data.hr = sensor_ant_data.hr

  smart_trainer.notifyFTMS(out_data)
})

// /////////////////////////////////////////////////////////////////////////
// BLE callback section
// something happened with the application
// /////////////////////////////////////////////////////////////////////////

function serverCallback (control, ...args) {
  message(`ftms server callback: ${control}`)

  var success = false

  switch (control) {
    case 'reset': {
      message('USB Reset triggered via BLE')
      tacx_usb.reset()
      success = true
      break
    }

    case 'disconnect': {
      message('disconnected')
      tacx_usb.reset()
      io.emit('data', {control: '-', windspeed: "-", grade: "-", crr: "-", cw: "-", setpower: "-", estimatepower: "-", estimatespeed: "-" })
      success = true
      break
    }

    case 'control': {// do nothing special
      message('Bike under control via BLE')
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
