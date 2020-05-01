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
var servoRUN = config.equipments.Servo
var simulatorRUN = config.equipments.Simulator
var antRUN = config.equipments.ANT
var bleRUN = config.equipments.BLE
var tacxRUN = config.equipments.tacxUSB

// ////////////////////////////////////////////////////////////////////////
// VirtualTrainer specific
// ////////////////////////////////////////////////////////////////////////

var TrainerBLE = require('./BLE/trainerBLE')

// ////////////////////////////////////////////////////////////////////////
// Bridge specific
// ////////////////////////////////////////////////////////////////////////

var MyBleTrainer = require('./BLE/MyBleTrainer')
var MyAntTrainer = require('./MyAntTrainer')

// ////////////////////////////////////////////////////////////////////////
// Servo specific
// ////////////////////////////////////////////////////////////////////////

var MyServo = require('./BLE/MyServo')

var nearest = config.Servo.nearest
var widest = config.Servo.widest

// ////////////////////////////////////////////////////////////////////////
// Kettler specific
// ////////////////////////////////////////////////////////////////////////

var kettlerUSB = require('./kettlerUSB')
var KettlerBLE = require('./BLE/kettlerBLE')
var BikeState = require('./BikeState')
var Oled = require('./OledInfo')
var Button = require('./lib/rpi_gpio_buttons')

// ////////////////////////////////////////////////////////////////////////
// Daum specific
// ////////////////////////////////////////////////////////////////////////

var DaumUSB = require('./daumUSB')
var DaumSIM = require('./daumSIM')
var DaumBLE = require('./BLE/daumBLE')

var Gpio = require('onoff').Gpio

var shiftUp = null
var shiftDown = null
if (daumRUN) {
  shiftUp = new Gpio(4, 'in', 'rising', { debounceTimeout: 10 }) // hardware switch for shifting up gears
  shiftDown = new Gpio(17, 'in', 'rising', { debounceTimeout: 10 }) // hardware switch for shifting down gears
}

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
  if (serverDEBUG) console.log('[server.js] - listening on port 3000!')
})
 
// /////////////////////////////////////////////////////////////////////////
// VirtualTrainer instantiation
// /////////////////////////////////////////////////////////////////////////

var trainerBLE; // wait for sensor befor start advertising

// /////////////////////////////////////////////////////////////////////////
// Bridge instantiation
// /////////////////////////////////////////////////////////////////////////

var myBleTrainer = null
if (bleRUN) {
  myBleTrainer = new MyBleTrainer()
}

var myAntTrainer = null
if (antRUN) {
  myAntTrainer = new MyAntTrainer()
}

// /////////////////////////////////////////////////////////////////////////
// Servo instantiation
// /////////////////////////////////////////////////////////////////////////

var myServo = null
if (servoRUN) {
  myServo = new MyServo();
  myServo.setGear(1);
}

var gearvalue = widest
var brforce = 0;  // breacking force init
var watt=25;
var speedms = 0.0; //init with lowest resistance
var controlled, settingservo, measuring = false;

// /////////////////////////////////////////////////////////////////////////
// Simulator instantiation
// /////////////////////////////////////////////////////////////////////////

var daumSIM = null
if (simulatorRUN) {
  daumSIM = new DaumSIM()
}

// /////////////////////////////////////////////////////////////////////////
// Daum instantiation
// /////////////////////////////////////////////////////////////////////////

var daumUSB = null
var daumObs = null
if (daumRUN) {
  daumUSB = new DaumUSB()
  daumObs = daumUSB.open()
}
//var daumBLE = new DaumBLE(serverCallback)

// /////////////////////////////////////////////////////////////////////////
// Kettler instantiation
// /////////////////////////////////////////////////////////////////////////

var kettlerUSB = null
if (kettlerRUN) {
  kettlerUSB = new kettlerUSB()
}
//var kettlerBLE = new KettlerBLE(serverCallback);

// /////////////////////////////////////////////////////////////////////////
// Tacx instantiation
// /////////////////////////////////////////////////////////////////////////

var tacxUSB = null
if (tacxRUN) {
  // tacxUSB = new tacxUSB()
  // var tacxBLE = new tacxBLE(serverCallback)
}

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
      daumUSB.setGear(geargpio)
      setTimeout(daumUSB.restart, 1000)
    }
    if (servoRUN){
      gear = 1
      myServo.setGear(gear)
    }
    io.emit('key', '[server.js] - restart')
  })

  socket.on('reco', function (data) {
    if (serverDEBUG) console.log('[server.js] - reconnect')
    if (servoRUN) gear = 1
    if (bleRUN) myBleTrainer.recon()
    trainerBLEinit ()
    io.emit('key', '[server.js] - reconnect')
  })

  socket.on('stop', function (data) {
    if (serverDEBUG) console.log('[server.js] - stop')
    if (daumRUN) daumUSB.stop()
    io.emit('key', '[server.js] - stop')
  })

  socket.on('setGear', function (data) {
    if (serverDEBUG) console.log('[server.js] - set Gear')
    gear = data
    if (daumRUN) daumUSB.setGear(gear)
    if (servoRUN) myServo.setGear(gear)
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
        myServo.setLimit(data);
    })

    socket.on('new_gear_val', function (data) {
        if (serverDEBUG) console.log('[server.js] - new_gearval ' + data[0])
        myServo.setDirect(data);
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
      daumUSB.setProgram(programID)
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
        daumUSB.setWattProfile(0) // increment power
        if (serverDEBUG) console.log('[server.js] - increment Power')
        io.emit('raw', '[server.js] - increment Power')
      } else { // if mode is set to 'gear', we increment gears
        if (geargpio < maxGear) {
          geargpio = geargpio + ratio // shift n gears at a time, to avoid too much shifting
          daumUSB.setGear(geargpio)
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
        daumUSB.setWattProfile(1) // decrement power
        if (serverDEBUG) console.log('[server.js] - decrement Power')
        io.emit('raw', '[server.js] - decrement Power')
      } else { // if mode is set to 'gear', we degrement gears
        if (geargpio > minGear) {
          geargpio = geargpio - ratio // sift n gears at a time, to avoid too much shifting
          daumUSB.setGear(geargpio)
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
  //--- Buttons
  var button = new Button(7);
  button.on('clicked', function () {
    bikeState.GearUp();
  });

  var button = new Button(11);
  button.on('clicked', function () {
    bikeState.GearDown();
  });
  
  //--- Oled Screen
  var oled = new Oled();

  //--- Machine State
  var bikeState = new BikeState();
  // un peu de retour serveur
  bikeState.on('mode', (mode) => {
    io.emit('mode', mode);
  });

  bikeState.on('gear', (gear) => {
    io.emit('gear', gear);
    oled.displayGear(gear);
  });

  bikeState.on('grade', (grade) => {
    io.emit('grade', grade + '%');
    oled.displayGrade(grade);
  });

  bikeState.on('windspeed', (windspeed) => {
    io.emit('windspeed', windspeed);
  });

  bikeState.on('simpower', (simpower) => {
    kettlerUSB.setPower(simpower);
  });

  // first state
  bikeState.setGear(4);
}

// /////////////////////////////////////////////////////////////////////////
// BLE trainer
// /////////////////////////////////////////////////////////////////////////

if (bleRUN) {
  myBleTrainer.on('notifications_true', () => {
    trainerBLEinit ()
  });

  myBleTrainer.on('notified', data => {
    // recalculate power if BLE controlled? P = F * v
    
    if ('rpm' in data) io.emit('rpm', data.rpm)
    if ('speed' in data) {
      speedms = Number(data.speed/3.6).toFixed(4)
      //  myServo.getSpeed(data.speed, watt)

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

    trainerBLE.notifyFTMS(data)
    trainerBLE.notifyCSP(data)
  })
}

// /////////////////////////////////////////////////////////////////////////
// Ant Trainer
// /////////////////////////////////////////////////////////////////////////

if (antRUN) {
  myAntTrainer.on('notifications_true', () => {
    trainerBLEinit ();
    myBleTrainer.discon(); //prefer Ant over BLE Sensors
  });

  myAntTrainer.on('notified', data => {
    // recalculate power if BLE controlled? P = F * v
    
    if ('rpm' in data) io.emit('rpm', data.rpm.toFixed(0))
    if ('speed' in data) {
        speedms = Number(data.speed/3.6).toFixed(4)
        //myServo.getSpeed(data.speed, watt)

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
      trainerBLE.notifyFTMS(data)
      trainerBLE.notifyCSP(data)
    } 
    else {
      measuring = trainerBLE.measure(data)
      io.emit('key', '[server.js] - measured?')
      if (!measuring) {
        io.emit('measured')
        io.emit('key', '[server.js] - yes!')
      }
    } 
  })
}

// /////////////////////////////////////////////////////////////////////////
// Daum USB Obs
// /////////////////////////////////////////////////////////////////////////

if (daumRUN) {
  daumObs.on('error', string => {
    if (serverDEBUG) console.log('[server.js] - error: ' + string)
    io.emit('error', '[server.js] - ' + string)
  })

  daumObs.on('key', string => {
    if (serverDEBUG) console.log('[server.js] - key: ' + string)
    io.emit('key', '[server.js] - ' + string)
  })

  daumObs.on('raw', string => {
    if (serverDEBUG) console.log('[server.js] - raw: ', string)
    io.emit('raw', string.toString('hex'))
    io.emit('version', version) // emit version number to webserver
  })

  daumObs.on('data', data => { // get runData from daumUSB
    if (serverDEBUG) console.log('[server.js] - data:' + JSON.stringify(data))
    if ('speed' in data) io.emit('speed', data.speed)
    if ('power' in data) io.emit('power', data.power)
    if ('rpm' in data) io.emit('rpm', data.rpm)
    if ('gear' in data) io.emit('gear', data.gear)
    if ('program' in data) io.emit('program', data.program)
    trainerBLE.notifyFTMS(data)
    trainerBLE.notifyCSP(data)
  })
}

// /////////////////////////////////////////////////////////////////////////
// Kettler USB
// /////////////////////////////////////////////////////////////////////////

if (kettlerRUN) {
  kettlerUSB.on('error', (string) => {
    console.log('error : ' + string)
    io.emit('error', string)
  });

  kettlerUSB.on('connecting', () => {
    oled.displayUSB('connecting')
  });

  kettlerUSB.on('start', () => {
    oled.displayUSB('connected')
  });

  kettlerUSB.on('data', (data) => {
    // keep
    bikeState.setData(data)

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
    trainerBLE.notifyFTMS(data);
    trainerBLE.notifyCSP(data);
  })

  kettlerUSB.open()
}

// /////////////////////////////////////////////////////////////////////////
// Tacx USB
// /////////////////////////////////////////////////////////////////////////

if (tacxRUN) {
  tacxUSB.on('error', (string) => {
    if (serverDEBUG) console.log('[server.js] - error: ' + string)
    io.emit('error', string)
  });

  tacxUSB.on('connecting', () => {
    if (serverDEBUG) console.log('[server.js] - connecting ')
  });

  tacxUSB.on('start', () => {
    if (serverDEBUG) console.log('[server.js] - start ')
  });

  tacxUSB.on('key', string => {
    if (serverDEBUG) console.log('[server.js] - key: ' + string)
    io.emit('key', '[server.js] - ' + string)
  })

  tacxUSB.on('raw', string => {
    if (serverDEBUG) console.log('[server.js] - raw: ', string)
    io.emit('raw', string.toString('hex'))
    io.emit('version', version) // emit version number to webserver
  })

  tacxUSB.on('data', (data) => {
    // send to html server
    if ('speed' in data) io.emit('speed', data.speed.toFixed(1))
    if ('power' in data) io.emit('power', data.power)
    if ('hr' in data) io.emit('hr', data.hr)
    if ('rpm' in data) io.emit('rpm', data.rpm)
    if ('gear' in data) io.emit('gear', data.gear)
    if ('program' in data) io.emit('program', data.program)
    // send to BLE adapter
    trainerBLE.notifyFTMS(data);
    trainerBLE.notifyCSP(data);
  })

  tacxUSB.open()
}

// /////////////////////////////////////////////////////////////////////////
// VirtualTrainer BLE : Bike information transfer to BLE & Webserver
// /////////////////////////////////////////////////////////////////////////

trainerBLEinit()

function trainerBLEinit () {
  trainerBLE = new TrainerBLE(options = {
    name: 'Smart Trainer Bridge'
  },serverCallback)

  trainerBLE.on('disconnect', string => {
    io.emit('control', 'disconnected')
    if (servoRUN) controlled = false
    if (kettlerRUN) oled.displayBLE('Disconnected');
  })

  trainerBLE.on('key', string => {
    if (serverDEBUG) console.log('[server.js] - key: ' + string)
    io.emit('key', '[server.js] - ' + string)
  })

  trainerBLE.on('error', string => {
    if (serverDEBUG) console.log('[server.js] - error: ' + string)
    io.emit('error', '[server.js] - ' + string)
  })

  trainerBLE.on('accept', string => {
    if (kettlerRUN) oled.displayBLE('Connected');
    io.emit('accept', '[server.js] - ' + string)
  })
    
  trainerBLE.on('accept', string => {
  	if (kettlerRUN) oled.displayBLE('Started');
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
      if (daumRUN) daumUSB.restart()
      if (kettlerRUN) {
        kettlerUSB.restart()
		    bikeState.restart()
      }
      success = true
      break

    case 'control': // do nothing special
      if (serverDEBUG) console.log('[server.js] - Bike under control via BLE')
      io.emit('key', '[server.js] - Bike under control via BLE')
      io.emit('control', 'BIKE CONTROLLED')
      if (kettlerRUN) {
        oled.setStatus(1)
        bikeState.setControl()
      }
      if (servoRUN) controlled = true
      success = true
      break

    case 'power': // ERG Mode - receive control point value via BLE from zwift or other app
      if (serverDEBUG) console.log('[server.js] - Bike ERG Mode')
      if (args.length > 0) {
        watt = args[0]
        if (daumRUN) daumUSB.setPower(watt)
        if (kettlerRUN) bikeState.setTargetPower(watt);
        if (servoRUN) if (!settingservo || !measuring) brforce=myServo.setWatt(watt);
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
      if (kettlerRUN) bikeState.setExternalCondition(windspeed, grade, crr, cw);
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
        daumSIM.physics(  global.globalwindspeed_ble, 
                          global.globalgrade_ble, 
                          global.globalcrr_ble, 
                          global.globalcw_ble, 
                          global.globalrpm_daum, 
                          global.globalspeed_daum, 
                          global.globalgear_daum
                        )
        var power = Number(global.globalsimpower_daum).toFixed(0)
        // daumUSB.setPower(power) // if this is used here, then some random power is transmitted to zwift, e.g.: 111 watts / 20sec
        io.emit('raw', '[server.js] - Bike in SIM Mode - set Power to : ' + power)
        io.emit('simpower', power)
        io.emit('control', 'SIM MODE')
      }
      success = true
      break
  }
  return success
}
