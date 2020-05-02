#!/usr/bin/env node
var express = require('express')
var app = require('express')()
var server = require('http').createServer(app) // for getting IP dynamicaly in index.ejs
var io = require('socket.io')(server) // for getting IP dynamicaly in index.ejs
var path = require('path')
const { version } = require('./package.json') // get version number from package.json
const config = require('config-yml') // Use config for yaml config files in Node.js projects

// ////////////////////////////////////////////////////////////////////////
// Configuration
// ////////////////////////////////////////////////////////////////////////

var DEBUG = config.DEBUG.all 
var serverDEBUG = (config.DEBUG.server || DEBUG)
var usbDEBUG = (config.DEBUG.USB || DEBUG)
var antDEBUG = (config.DEBUG.ANT || DEBUG)
var bleDEBUG = (config.DEBUG.BLE || DEBUG)

var daumRUN = config.equipments.daumUSB
var kettlerRUN = config.equipments.kettlerUSB
var servoRUN = config.equipments.servoGPIO
var simulatorRUN = config.equipments.Simulator
var antRUN = config.equipments.trainerANT
var bleRUN = config.equipments.trainerBLE
var tacxRUN = config.equipments.tacxUSB

// ////////////////////////////////////////////////////////////////////////
// VirtualTrainer specific
// ////////////////////////////////////////////////////////////////////////


// /////////////////////////////////////////////////////////////////////////
// Smart Trainer instantiation
// /////////////////////////////////////////////////////////////////////////

var smarttrainer = require('./BLE/smart-trainer')
var smart_trainer; // wait for sensor befor start advertising

// /////////////////////////////////////////////////////////////////////////
// Bridge instantiation
// /////////////////////////////////////////////////////////////////////////

if (bleRUN) { 
  var trainerBLE = require('./trainers/trainerBLE')
  var trainer_ble = new trainerBLE()
}

if (antRUN)  {
  var trainerANT = require('./trainers/trainerANT')
  var trainer_ant = new trainerANT()
}

// /////////////////////////////////////////////////////////////////////////
// Servo instantiation
// /////////////////////////////////////////////////////////////////////////

if (servoRUN) {
  var servoGPIO = require('./trainers/servoGPIO')

  var nearest = config.Servo.nearest
  var widest = config.Servo.widest

  var servo_gpio = new servoGPIO();
  servo_gpio.setGear(1);

  var gearvalue = widest
  var brforce = 0;  // breacking force init
  var watt=25;
  var speedms = 0.0; //init with lowest resistance
  var controlled, settingservo, measuring = false;
}

// /////////////////////////////////////////////////////////////////////////
// Kettler instantiation
// /////////////////////////////////////////////////////////////////////////

if (kettlerRUN) {
  var kettlerUSB = require('./trainers/kettlerUSB')
  var kettlerBIKE = require('./trainers/kettlerBIKE')
  var kettlerOLED = require('./trainers/kettlerOLED')
  var rpi_gpio_buttons = require('./lib/rpi_gpio_buttons')

  var kettler_usb = new kettlerUSB()
}

// /////////////////////////////////////////////////////////////////////////
// Daum instantiation
// /////////////////////////////////////////////////////////////////////////

if (daumRUN){
  var daumUSB = require('./trainers/daumUSB')
  var daumSIM = require('./trainers/daumSIM')

  var Gpio = require('onoff').Gpio

  var shiftUp = null
  var shiftDown = null

  shiftUp = new Gpio(4, 'in', 'rising', { debounceTimeout: 10 }) // hardware switch for shifting up gears
  shiftDown = new Gpio(17, 'in', 'rising', { debounceTimeout: 10 }) // hardware switch for shifting down gears

  global.globalspeed_daum = 0
  global.globalrpm_daum = 0
  global.globalgear_daum = 1
  global.globalsimpower_daum = 0
  global.globalwindspeed_ble = 0
  global.globalgrade_ble = 0
  global.globalcrr_ble = 0.0040 // set once to have simulation available without BLE connected to apps
  global.globalcw_ble = 0.51 // set once to have simulation available without BLE connected to apps
  global.globalmode = 'SIM' // set this as default start mode here; in this mode ,ergoFACE is going to startup
  global.globalswitch = 'Gear' // set this as default start mode here; in this mode ,ergoFACE is going to startup

  var daum_sim = new daumSIM()
  var daum_usb = new daumUSB()
  var daum_obs = daum_usb.open()
}

// /////////////////////////////////////////////////////////////////////////
// Tacx instantiation
// /////////////////////////////////////////////////////////////////////////

if (tacxRUN) {
  var tacxUSB = require('./trainers/tacxUSB')
  var tacx_usb = new tacxUSB()
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

server.listen(process.env.PORT || 3000, function () { 
  // for getting IP dynamicaly in index.ejs and not to enter it manually
  if (serverDEBUG) console.log('[server.js] - listening on port 3000!')
})
 
// /////////////////////////////////////////////////////////////////////////
// Web server callback, listen for actions taken at the server GUI, 
// not from Ant, Daum or BLE
// /////////////////////////////////////////////////////////////////////////

io.on('connection', socket => {
    io.emit('preset_servo', [nearest,widest,gearvalue])

  if (serverDEBUG) console.log('[server.js] - connected to socketio')
  socket.on('reset', function (data) {
    io.emit('key', '[server.js] - VirtualTrainer Server started')
  })

  socket.on('restart', function (data) {
    if (serverDEBUG) console.log('[server.js] - restart')
    if (daumRUN) {
      geargpio = 1
      daum_usb.setGear(geargpio)
      setTimeout(daum_usb.restart, 1000)
    }
    if (servoRUN){
      gear = 1
      servo_gpio.setGear(gear)
    }
    io.emit('key', '[server.js] - restart')
  })

  socket.on('reco', function (data) {
    if (serverDEBUG) console.log('[server.js] - reconnect')
    if (servoRUN) gear = 1
    if (bleRUN) trainer_ble.recon()
    smart_trainer_init ()
    io.emit('key', '[server.js] - reconnect')
  })

  socket.on('stop', function (data) {
    if (serverDEBUG) console.log('[server.js] - stop')
    if (daumRUN) daum_usb.stop()
    io.emit('key', '[server.js] - stop')
  })

  socket.on('setGear', function (data) {
    if (serverDEBUG) console.log('[server.js] - set Gear')
    gear = data
    if (daumRUN) daum_usb.setGear(gear)
    if (servoRUN) servo_gpio.setGear(gear)
    io.emit('raw', '[server.js] - set Gear: ' + gear)
  })

  // Servo specific
  if (servoRUN) {
    socket.on('servosetting', function (data) {
      settingservo = (data==='on') ? true:false;
      if (serverDEBUG) console.log('[server.js] - servosetting ' + data)
      if (settingservo) { 
          io.emit('key', '[server.js] - servosetting on')
          var servo_values = [nearest,widest]
          io.emit('preset_servo', servo_values)
          } 
      else { 
          io.emit('key', '[server.js] - servosetting off')
      }
    })

    socket.on('new_servo_val', function (data) {
        if (serverDEBUG) console.log('[server.js] - new_servoval ' + data[0])
        if (data[1] === 'change_min') {
            nearest = data[0];
        }
        else {
            widest = data[0];
        }
        servo_gpio.setLimit(data);
    })

    socket.on('new_gear_val', function (data) {
        if (serverDEBUG) console.log('[server.js] - new_gearval ' + data[0])
        servo_gpio.setDirect(data);
    })

    socket.on('measuring_start', function (data) {
      measuring = true;
      if (serverDEBUG) console.log('[server.js] - measuring started ')
      // measuring = trainer
    })
  }

  // Daum specific
  if (daumRUN) {
    socket.on('setProgram', function (data) {
      if (serverDEBUG) console.log('[server.js] - set Program')
      var programID = data
      daum_usb.setProgram(programID)
      io.emit('key', '[server.js] - set Program ID: ' + programID)
    })

    socket.on('mode', function (data) { // via webserver - switch mode ERG / SIM
      if (serverDEBUG) console.log('[server.js] - switch mode')
      global.globalmode = data
      var mode = data
      io.emit('key', '[server.js] - switch mode: ' + mode)
    })

    socket.on('switch', function (data) { // via webserver - switch Power / Gear shifting
      if (serverDEBUG) console.log('[server.js] - switch')
      global.globalswitch = data
      // var switchpg = data
      io.emit('key', '[server.js] - switch: ' + global.globalswitch)
    })
  }
})

process.on('SIGINT', () => {
   setTimeout(function(){
    process.exit();
  }, 3000);
})

// /////////////////////////////////////////////////////////////////////////
// Daum specific - shifting gears or power via gpio + hardware switches
// /////////////////////////////////////////////////////////////////////////

if (daumRUN) {
  var geargpio = 1 // initialize to start from first gear
  var ratio = 1 // set ratio, to shift multiple gears with the press of a button.
  var minGear = 1 // lowest gear
  var maxGear = 28 // highest gear

  shiftUp.watch((err, value) => {
    if (err) {
      io.emit('error', '[server.js] - gpio shift up: ' + err)
      throw err
    }
    if (value) {
      if (global.globalswitch === 'Power') { // if mode is set to 'power', we increment watt
        daum_usb.setWattProfile(0) // increment power
        if (serverDEBUG) console.log('[server.js] - increment Power')
        io.emit('raw', '[server.js] - increment Power')
      } else { // if mode is set to 'gear', we increment gears
        if (geargpio < maxGear) {
          geargpio = geargpio + ratio // shift n gears at a time, to avoid too much shifting
          daum_usb.setGear(geargpio)
          if (serverDEBUG) console.log('[server.js] - Shift to Gear: ' + geargpio)
          io.emit('raw', '[server.js] - Shift to Gear: ' + geargpio)
        }
      }
    }
  })
  process.on('SIGINT', () => {
    shiftUp.unexport()
  })

  shiftDown.watch((err, value) => {
    if (err) {
      io.emit('error', '[server.js] - gpio shift down: ' + err)
      throw err
    }
    if (value) {
      if (global.globalswitch === 'Power') { // if mode is set to 'power', we decrement watt
        daum_usb.setWattProfile(1) // decrement power
        if (serverDEBUG) console.log('[server.js] - decrement Power')
        io.emit('raw', '[server.js] - decrement Power')
      } else { // if mode is set to 'gear', we degrement gears
        if (geargpio > minGear) {
          geargpio = geargpio - ratio // sift n gears at a time, to avoid too much shifting
          daum_usb.setGear(geargpio)
          if (serverDEBUG) console.log('[server.js] - Shift to Gear: ' + geargpio)
          io.emit('raw', '[server.js] - Shift to Gear: ' + geargpio)
        }
      }
    }
  })
  process.on('SIGINT', () => {
    shiftDown.unexport()
  })
}

// /////////////////////////////////////////////////////////////////////////
// Kettler specific 
// /////////////////////////////////////////////////////////////////////////

if (kettlerRUN) {
  //--- buttons
  var kettlerBUTTON = new rpi_gpio_buttons(7);
  kettlerBUTTON.on('clicked', function () {
    kettlerBIKE.GearUp();
  });

  var kettlerBUTTON = new rpi_gpio_buttons(11);
  kettlerBUTTON.on('clicked', function () {
    kettlerBIKE.GearDown();
  });
  
  //--- kettlerOLED Screen
  var kettlerOLED = new kettlerOLED();

  //--- Machine State
  var kettlerBIKE = new kettlerBIKE();
  // un peu de retour serveur
  kettlerBIKE.on('mode', (mode) => {
    io.emit('mode', mode);
  });

  kettlerBIKE.on('gear', (gear) => {
    io.emit('gear', gear);
    kettlerOLED.displayGear(gear);
  });

  kettlerBIKE.on('grade', (grade) => {
    io.emit('grade', grade + '%');
    kettlerOLED.displayGrade(grade);
  });

  kettlerBIKE.on('windspeed', (windspeed) => {
    io.emit('windspeed', windspeed);
  });

  kettlerBIKE.on('simpower', (simpower) => {
    kettler_usb.setPower(simpower);
  });

  // first state
  kettlerBIKE.setGear(4);
}

// /////////////////////////////////////////////////////////////////////////
// BLE trainer
// /////////////////////////////////////////////////////////////////////////

if (bleRUN) {
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
// Kettler USB
// /////////////////////////////////////////////////////////////////////////

if (kettlerRUN) {
  kettler_usb.on('error', (string) => {
    console.log('error : ' + string)
    io.emit('error', string)
  });

  kettler_usb.on('connecting', () => {
    kettlerOLED.displayUSB('connecting')
  });

  kettler_usb.on('start', () => {
    kettlerOLED.displayUSB('connected')
  });

  kettler_usb.on('data', (data) => {
    // keep
    kettlerBIKE.setData(data)

    // send to html server
    if ('speed' in data)
      io.emit('speed', data.speed.toFixed(1))
    if ('power' in data)
      io.emit('power', data.power)
    if ('hr' in data)
      io.emit('hr', data.hr)
    if ('rpm' in data)
      io.emit('rpm', data.rpm)

    // send to BLE adapter
    smart_trainer.notifyFTMS(data);
    //smart_trainer.notifyCSP(data);
  })

  kettler_usb.open()
}

// /////////////////////////////////////////////////////////////////////////
// Daum USB Obs
// /////////////////////////////////////////////////////////////////////////

if (daumRUN) {
  daum_obs.on('error', string => {
    if (serverDEBUG) console.log('[server.js] - error: ' + string)
    io.emit('error', '[server.js] - ' + string)
  })

  daum_obs.on('key', string => {
    if (serverDEBUG) console.log('[server.js] - key: ' + string)
    io.emit('key', '[server.js] - ' + string)
  })

  daum_obs.on('raw', string => {
    if (serverDEBUG) console.log('[server.js] - raw: ', string)
    io.emit('raw', string.toString('hex'))
    io.emit('version', version) // emit version number to webserver
  })

  daum_obs.on('data', data => { // get runData from daum_usb
    if (serverDEBUG) console.log('[server.js] - data:' + JSON.stringify(data))
    if ('speed' in data) io.emit('speed', data.speed)
    if ('power' in data) io.emit('power', data.power)
    if ('rpm' in data) io.emit('rpm', data.rpm)
    if ('gear' in data) io.emit('gear', data.gear)
    if ('program' in data) io.emit('program', data.program)
    smart_trainer.notifyFTMS(data)
    //smart_trainer.notifyCSP(data)
  })
}

// /////////////////////////////////////////////////////////////////////////
// Tacx USB
// /////////////////////////////////////////////////////////////////////////

if (tacxRUN) {
  tacx_usb.run()
}

// /////////////////////////////////////////////////////////////////////////
// VirtualTrainer BLE : Bike information transfer to BLE & Webserver
// /////////////////////////////////////////////////////////////////////////

smart_trainer_init()

function smart_trainer_init () {
  smart_trainer = new smarttrainer(options = {
    name: 'Smart Trainer Bridge'
  },serverCallback)

  smart_trainer.on('disconnect', string => {
    io.emit('control', 'disconnected')
    if (servoRUN) controlled = false
    if (kettlerRUN) kettlerOLED.displayBLE('Disconnected');
  })

  smart_trainer.on('key', string => {
    if (serverDEBUG) console.log('[server.js] - key: ' + string)
    io.emit('key', '[server.js] - ' + string)
  })

  smart_trainer.on('error', string => {
    if (serverDEBUG) console.log('[server.js] - error: ' + string)
    io.emit('error', '[server.js] - ' + string)
  })

  smart_trainer.on('accept', string => {
    if (kettlerRUN) kettlerOLED.displayBLE('Connected');
    io.emit('accept', '[server.js] - ' + string)
  })
    
  smart_trainer.on('accept', string => {
  	if (kettlerRUN) kettlerOLED.displayBLE('Started');
    io.emit('accept', '[server.js] - ' + string)
  })
}

// /////////////////////////////////////////////////////////////////////////
// BLE callback section 
// /////////////////////////////////////////////////////////////////////////

function serverCallback (message, ...args) {
  console.log('[server.js] - ftms server callback', message)
  var success = false

  switch (message) {
    case 'reset':
      if (serverDEBUG) console.log('[server.js] - USB Reset triggered via BLE')
      io.emit('key', '[server.js] - Reset triggered via BLE')
      if (daumRUN) daum_usb.restart()
      if (kettlerRUN) {
        kettler_usb.restart()
		    kettlerBIKE.restart()
      }
      success = true
      break

    case 'control': // do nothing special
      if (serverDEBUG) console.log('[server.js] - Bike under control via BLE')
      io.emit('key', '[server.js] - Bike under control via BLE')
      io.emit('control', 'BIKE CONTROLLED')
      if (kettlerRUN) {
        kettlerOLED.setStatus(1)
        kettlerBIKE.setControl()
      }
      if (servoRUN) controlled = true
      success = true
      break

    case 'power': // ERG Mode - receive control point value via BLE from zwift or other app
      if (serverDEBUG) console.log('[server.js] - Bike ERG Mode')
      if (args.length > 0) {
        watt = args[0]
        if (daumRUN) daum_usb.setPower(watt)
        if (kettlerRUN) kettlerBIKE.setTargetPower(watt);
        if (servoRUN) if (!settingservo || !measuring) brforce=servo_gpio.setWatt(watt);
        if (serverDEBUG) console.log('[server.js] - Bike in ERG Mode - set Power to: ', watt)
        io.emit('raw', '[server.js] - Bike in ERG Mode - set Power to: ' + watt)
        io.emit('control', 'ERG MODE')
        success = true
      }
      break

    case 'simulation': // SIM Mode - calculate power based on physics
      if (serverDEBUG) console.log('[server.js] - Bike in SIM Mode')
      var windspeed = Number(args[0]).toFixed(1)
      var grade = Number(args[1]).toFixed(1)
      var crr = Number(args[2]).toFixed(4)
      var cw = Number(args[3]).toFixed(2)
      // Daum
      global.globalwindspeed_ble = windspeed
      global.globalgrade_ble = grade
      global.globalcrr_ble = crr
      global.globalcw_ble = cw
      if (kettlerRUN) kettlerBIKE.setExternalCondition(windspeed, grade, crr, cw);
      io.emit('raw', '[server.js] - Bike SIM Mode - [wind]: ' + windspeed + ' [grade]: ' + grade + ' [crr]: ' + crr + ' [cw]: ' + cw)
      io.emit('windspeed', windspeed)
      io.emit('grade', grade)
      io.emit('crr', crr)
      io.emit('cw', cw)
      if (servoRUN) {
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
        if (serverDEBUG) console.log('[server.js] - force ' +  cspeed)
        if (!settingservo || !measuring) {
            io.emit('raw', '[server.js] - Bike in SIM Mode - set Power to : ' + force) //power
            io.emit('simpower', force) //power
            io.emit('control', 'SIM MODE')
                
        }
      }
      // Daum
      if (simulatorRUN) {
        daum_sim.physics(  global.globalwindspeed_ble, 
                          global.globalgrade_ble, 
                          global.globalcrr_ble, 
                          global.globalcw_ble, 
                          global.globalrpm_daum, 
                          global.globalspeed_daum, 
                          global.globalgear_daum
                        )
        var power = Number(global.globalsimpower_daum).toFixed(0)
        // daum_usb.setPower(power) // if this is used here, then some random power is transmitted to zwift, e.g.: 111 watts / 20sec
        io.emit('raw', '[server.js] - Bike in SIM Mode - set Power to : ' + power)
        io.emit('simpower', power)
        io.emit('control', 'SIM MODE')
      }
      success = true
      break
  }
  return success
}
