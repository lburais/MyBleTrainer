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

var DEBUG = config.DEBUG.server // turn this on for debug information in consol

// ////////////////////////////////////////////////////////////////////////
// VirtualTrainer specific
// ////////////////////////////////////////////////////////////////////////

var MyServo = require('./BLE/MyServo')
var MyBleTrainer = require('./BLE/MyBleTrainer')
var TrainerBLE = require('./BLE/trainerBLE')
var MyAntTrainer = require('./MyAntTrainer')

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
var shiftUp = new Gpio(4, 'in', 'rising', { debounceTimeout: 10 }) // hardware switch for shifting up gears
var shiftDown = new Gpio(17, 'in', 'rising', { debounceTimeout: 10 }) // hardware switch for shifting down gears

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
  if (DEBUG) console.log('[server.js] - listening on port 3000!')
})
 
// /////////////////////////////////////////////////////////////////////////
// VirtualTrainer instantiation
// /////////////////////////////////////////////////////////////////////////

var myServo = new MyServo();
myServo.setGear(1);

var gearvalue = widest
var brforce = 0;  // breacking force init
var watt=25;
var speedms = 0.0; //init with lowest resistance
var controlled, settingservo, measuring = false;

var trainerBLE; // wait for sensor befor start advertising
var myBleTrainer = new MyBleTrainer()
var myAntTrainer = new MyAntTrainer()

// /////////////////////////////////////////////////////////////////////////
// Daum instantiation
// /////////////////////////////////////////////////////////////////////////

var daumUSB = new DaumUSB()
var daumSIM = new DaumSIM()
var daumBLE = new DaumBLE(serverCallback)
var daumObs = daumUSB.open()

// /////////////////////////////////////////////////////////////////////////
// Kettler instantiation
// /////////////////////////////////////////////////////////////////////////

var kettlerUSB = new kettlerUSB();
var kettlerBLE = new KettlerBLE(serverCallback);


// /////////////////////////////////////////////////////////////////////////
// Web server callback, listen for actions taken at the server GUI, 
// not from Ant, Daum or BLE
// /////////////////////////////////////////////////////////////////////////

io.on('connection', socket => {
    io.emit('preset_servo', [nearest,widest,gearvalue])

  if (DEBUG) console.log('[server.js] - connected to socketio')
  socket.on('reset', function (data) {
    io.emit('key', '[server.js] - VirtualTrainer Server started')
  })

  socket.on('restart', function (data) {
    if (DEBUG) console.log('[server.js] - restart')
    // Daum
    geargpio = 1
    daumUSB.setGear(geargpio)
    setTimeout(daumUSB.restart, 1000)
    // VirtualTrainer
    gear = 1
    myServo.setGear(gear)
    // common
    io.emit('key', '[server.js] - restart')
  })

  socket.on('reco', function (data) {
    if (DEBUG) console.log('[server.js] - reconnect')
    // VirtualTrainer
    gear = 1
    myBleTrainer.recon();
    trainerBLEinit ();
    // common
    io.emit('key', '[server.js] - reconnect')
  })

  socket.on('stop', function (data) {
    if (DEBUG) console.log('[server.js] - stop')
    // Daum
    daumUSB.stop()
    // common
    io.emit('key', '[server.js] - stop')
  })

  socket.on('setGear', function (data) {
    if (DEBUG) console.log('[server.js] - set Gear')
    // Daum
    var gear = data
    daumUSB.setGear(gear)
    // VirtualTrainer
    gear = data
    myServo.setGear(gear)
    // common
    io.emit('raw', '[server.js] - set Gear: ' + gear)
  })

  // VirtualTrainer specific

  socket.on('servosetting', function (data) {
    settingservo = (data==='on') ? true:false;
    if (DEBUG) console.log('[server.js] - servosetting ' + data)
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
      if (DEBUG) console.log('[server.js] - new_servoval ' + data[0])
      if (data[1] === 'change_min') {
          nearest = data[0];
      }
      else {
          widest = data[0];
      }
      myServo.setLimit(data);
  })

  socket.on('new_gear_val', function (data) {
      if (DEBUG) console.log('[server.js] - new_gearval ' + data[0])
      myServo.setDirect(data);
  })

  socket.on('measuring_start', function (data) {
    measuring = true;
    if (DEBUG) console.log('[server.js] - measuring started ')
    // measuring = trainer
  })

  // Daum specific

  socket.on('setProgram', function (data) {
    if (DEBUG) console.log('[server.js] - set Program')
    // Daum
    var programID = data
    daumUSB.setProgram(programID)
    // common
    io.emit('key', '[server.js] - set Program ID: ' + programID)
  })

  socket.on('mode', function (data) { // via webserver - switch mode ERG / SIM
    if (DEBUG) console.log('[server.js] - switch mode')
    global.globalmode = data
    var mode = data
    io.emit('key', '[server.js] - switch mode: ' + mode)
  })

  socket.on('switch', function (data) { // via webserver - switch Power / Gear shifting
    if (DEBUG) console.log('[server.js] - switch')
    global.globalswitch = data
    // var switchpg = data
    io.emit('key', '[server.js] - switch: ' + global.globalswitch)
  })
})

process.on('SIGINT', () => {
   setTimeout(function(){
    process.exit();
  }, 3000);
})

// /////////////////////////////////////////////////////////////////////////
// VirtualTrainer specific - shifting gears or power via gpio + hardware switches
// /////////////////////////////////////////////////////////////////////////

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
      if (DEBUG) console.log('[server.js] - increment Power')
      io.emit('raw', '[server.js] - increment Power')
    } else { // if mode is set to 'gear', we increment gears
      if (geargpio < maxGear) {
        geargpio = geargpio + ratio // shift n gears at a time, to avoid too much shifting
        daumUSB.setGear(geargpio)
        if (DEBUG) console.log('[server.js] - Shift to Gear: ' + geargpio)
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
      if (DEBUG) console.log('[server.js] - decrement Power')
      io.emit('raw', '[server.js] - decrement Power')
    } else { // if mode is set to 'gear', we degrement gears
      if (geargpio > minGear) {
        geargpio = geargpio - ratio // sift n gears at a time, to avoid too much shifting
        daumUSB.setGear(geargpio)
        if (DEBUG) console.log('[server.js] - Shift to Gear: ' + geargpio)
        io.emit('raw', '[server.js] - Shift to Gear: ' + geargpio)
      }
    }
  }
})
process.on('SIGINT', () => {
  shiftDown.unexport()
})

// /////////////////////////////////////////////////////////////////////////
// Kettler specific 
// /////////////////////////////////////////////////////////////////////////

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

// /////////////////////////////////////////////////////////////////////////
// Bike information transfer to BLE & Webserver
// /////////////////////////////////////////////////////////////////////////

// VirtualTrainer BLE

function trainerBLEinit () {
  trainerBLE = new TrainerBLE(options = {
    name: 'Virtual Trainer'
  },serverCallback);

  trainerBLE.on('disconnect', string => {
    io.emit('control', 'disconnected')
    controlled = false;
  });

  trainerBLE.on('key', string => {
    if (DEBUG) console.log('[server.js] - key: ' + string)
    io.emit('key', '[server.js] - ' + string)
  })

  trainerBLE.on('error', string => {
    if (DEBUG) console.log('[server.js] - error: ' + string)
    io.emit('error', '[server.js] - ' + string)
  })
}

// Daum BLE

daumBLE.on('key', string => {
  if (DEBUG) console.log('[server.js] - error: ' + string)
  io.emit('key', '[server.js] - ' + string)
})

daumBLE.on('error', string => {
  if (DEBUG) console.log('[server.js] - error: ' + string)
  io.emit('error', '[server.js] - ' + string)
})

//--- Kettler BLE

kettlerBLE.on('advertisingStart', (client) => {
	oled.displayBLE('Started');
});

kettlerBLE.on('accept', (client) => {
	oled.displayBLE('Connected');
});

kettlerBLE.on('disconnect', (client) => {
	oled.displayBLE('Disconnected');
});


// /////////////////////////////////////////////////////////////////////////
// BLE trainer
// /////////////////////////////////////////////////////////////////////////

myBleTrainer.on('notifications_true', () => {
  trainerBLEinit ();
});

myBleTrainer.on('notified', data => {
  // recalculate power if BLE controlled? P = F * v
  
  if ('rpm' in data) io.emit('rpm', data.rpm);
  if ('speed' in data) {
    speedms = Number(data.speed/3.6).toFixed(4);
    //  myServo.getSpeed(data.speed, watt)

    io.emit('speed', data.speed);
  }
  if ('power' in data && controlled == true && brforce > 0) {
    var tp=brforce * data.speed/3.6
    data.power = Math.round(tp);
    io.emit('power', data.power);
      
  } else {
    io.emit('power', data.power);
  }
  if ('hr' in data) io.emit('hr', data.hr);

  trainerBLE.notifyFTMS(data)
 //   trainerBLE.notifyCSP(data)
});

// /////////////////////////////////////////////////////////////////////////
// Ant Trainer
// /////////////////////////////////////////////////////////////////////////

myAntTrainer.on('notifications_true', () => {
  trainerBLEinit ();
    myBleTrainer.discon(); //prefer Ant over BLE Sensors
});

myAntTrainer.on('notified', data => {
  // recalculate power if BLE controlled? P = F * v
  
  if ('rpm' in data) io.emit('rpm', data.rpm.toFixed(0));
  if ('speed' in data) {
      speedms = Number(data.speed/3.6).toFixed(4);
      //myServo.getSpeed(data.speed, watt)

      io.emit('speed', data.speed.toFixed(1));
  }
  if ('power' in data && controlled == true && brforce > 0) {
    var tp=brforce * data.speed/3.6
    data.power = Math.round(tp);
    io.emit('power', data.power);
  } else {
    io.emit('power', data.power);
  }
  
  if ('hr' in data) io.emit('hr', data.hr);
  
  if (!measuring) {
    trainerBLE.notifyFTMS(data)
    //   trainerBLE.notifyCSP(data)
  } 
  else {
    measuring = trainerBLE.measure(data);
    io.emit('key', '[server.js] - measured?')
    if (!measuring) {
      io.emit('measured')
      io.emit('key', '[server.js] - yes!')
    }
  } 
});

// /////////////////////////////////////////////////////////////////////////
// Daum USB Obs
// /////////////////////////////////////////////////////////////////////////

daumObs.on('error', string => {
  if (DEBUG) console.log('[server.js] - error: ' + string)
  io.emit('error', '[server.js] - ' + string)
})

daumObs.on('key', string => {
  if (DEBUG) console.log('[server.js] - key: ' + string)
  io.emit('key', '[server.js] - ' + string)
})

daumObs.on('raw', string => {
  if (DEBUG) console.log('[server.js] - raw: ', string)
  io.emit('raw', string.toString('hex'))
  io.emit('version', version) // emit version number to webserver
})

daumObs.on('data', data => { // get runData from daumUSB
  if (DEBUG) console.log('[server.js] - data:' + JSON.stringify(data))
  if ('speed' in data) io.emit('speed', data.speed)
  if ('power' in data) io.emit('power', data.power)
  if ('rpm' in data) io.emit('rpm', data.rpm)
  if ('gear' in data) io.emit('gear', data.gear)
  if ('program' in data) io.emit('program', data.program)
  daumBLE.notifyFTMS(data)
})

// /////////////////////////////////////////////////////////////////////////
// Kettler USB
// /////////////////////////////////////////////////////////////////////////

kettlerUSB.on('error', (string) => {
	console.log('error : ' + string);
	io.emit('error', string);
});

kettlerUSB.on('connecting', () => {
	oled.displayUSB('connecting');
});

kettlerUSB.on('start', () => {
	oled.displayUSB('connected');
});

kettlerUSB.on('data', (data) => {
	// keep
	bikeState.setData(data);

	// send to html server
	if ('speed' in data)
		io.emit('speed', data.speed.toFixed(1));
	if ('power' in data)
		io.emit('power', data.power);
	if ('hr' in data)
		io.emit('hr', data.hr);
	if ('rpm' in data)
		io.emit('rpm', data.rpm);

	// send to BLE adapter
	kettlerBLE.notifyFTMS(data);
});

kettlerUSB.open();

// /////////////////////////////////////////////////////////////////////////
// BLE callback section 
// /////////////////////////////////////////////////////////////////////////

function serverCallback (message, ...args) {
  console.log('[server.js] - ftms server callback', message)
  var success = false

  switch (message) {
    case 'reset':
      if (DEBUG) console.log('[server.js] - USB Reset triggered via BLE')
      io.emit('key', '[server.js] - Reset triggered via BLE')
      // Daum
      daumUSB.restart()
      // Kettler
      kettlerUSB.restart();
		  bikeState.restart();
      // common
      success = true
      break

    case 'control': // do nothing special
      if (DEBUG) console.log('[server.js] - Bike under control via BLE')
      io.emit('key', '[server.js] - Bike under control via BLE')
      io.emit('control', 'BIKE CONTROLLED')
      // Kettler
      oled.setStatus(1);
		  bikeState.setControl();
      // common
      controlled = true
      success = true
      break

    case 'power': // ERG Mode - receive control point value via BLE from zwift or other app
    if (DEBUG) console.log('[server.js] - Bike ERG Mode')
      if (args.length > 0) {
        watt = args[0]
        // Daum
        daumUSB.setPower(watt)
        // Kettler
        bikeState.setTargetPower(args[0]);
        // VirtualTrainer
        if (!settingservo || !measuring) brforce=myServo.setWatt(watt);
        // common
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
      // Daum
      global.globalwindspeed_ble = windspeed
      global.globalgrade_ble = grade
      global.globalcrr_ble = crr
      global.globalcw_ble = cw
      // Kettler
      bikeState.setExternalCondition(windspeed, grade, crr, cw);
      // common
      io.emit('raw', '[server.js] - Bike SIM Mode - [wind]: ' + windspeed + ' [grade]: ' + grade + ' [crr]: ' + crr + ' [cw]: ' + cw)
      io.emit('windspeed', windspeed)
      io.emit('grade', grade)
      io.emit('crr', crr)
      io.emit('cw', cw)
      // VirtualTrainer
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
      if (!settingservo || !measuring) {
          io.emit('raw', '[server.js] - Bike in SIM Mode - set Power to : ' + force) //power
          io.emit('simpower', force) //power
          io.emit('control', 'SIM MODE')
              
      }
      // Daum
      daumSIM.physics(global.globalwindspeed_ble, global.globalgrade_ble, global.globalcrr_ble, global.globalcw_ble, global.globalrpm_daum, global.globalspeed_daum, global.globalgear_daum)
      var power = Number(global.globalsimpower_daum).toFixed(0)
      // daumUSB.setPower(power) // if this is used here, then some random power is transmitted to zwift, e.g.: 111 watts / 20sec
      io.emit('raw', '[server.js] - Bike in SIM Mode - set Power to : ' + power)
      io.emit('simpower', power)
      io.emit('control', 'SIM MODE')
      success = true
      break
  }
  return success
}
