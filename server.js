#!/usr/bin/env node
var express = require('express')
var app = require('express')()
var server = require('http').createServer(app) // for getting IP dynamicaly in index.ejs
var io = require('socket.io')(server) // for getting IP dynamicaly in index.ejs
var path = require('path')
var MyServo = require('./BLE/MyServo')
var MyBleTrainer = require('./BLE/MyBleTrainer')
var MyAntTrainer = require('./BLE/MyAntTrainer')
var TrainerBLE = require('./BLE/trainerBLE')
const config = require('config-yml') // Use config for yaml config files in Node.js projects
var nearest = config.Servo.nearest;
var widest = config.Servo.widest;
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
var gearvalue = widest
var brforce = 0;  // breacking force init
var watt=25;
var speedms = 0.0; //init with lowest resistance
var controlled, settingservo, measuring = false;
var trainerBLE; // wait for sensor befor start advertising
var myBleTrainer = new MyBleTrainer()
var myAntTrainer = new MyAntTrainer()


// /////////////////////////////////////////////////////////////////////////
// Web server callback, listen for actions taken at the server GUI, not from Ant or BLE
// /////////////////////////////////////////////////////////////////////////

io.on('connection', socket => {
    io.emit('preset_servo', [nearest,widest,gearvalue])

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
    trainerBLEinit ();
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
})

process.on('SIGINT', () => {
   setTimeout(function(){
    process.exit();
  }, 3000);
})
// /////////////////////////////////////////////////////////////////////////
// Bike information transfer to BLE & Webserver
// /////////////////////////////////////////////////////////////////////////
function trainerBLEinit () {
    trainerBLE = new TrainerBLE(options = {
        name: 'Jo1'
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
/* BLE callback section */
// /////////////////////////////////////////////////////////////////////////
function serverCallback (message, ...args) {
  console.log('[server.js] - ftms server callback', message)
    var success = false

  switch (message) {
    case 'reset':
      if (DEBUG) console.log('[server.js] - USB Reset triggered via BLE')
      io.emit('key', '[server.js] - Reset triggered via BLE')
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
        if (!settingservo || !measuring) brforce=myServo.setWatt(watt);
        
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
        if (!settingservo || !measuring) {
            io.emit('raw', '[server.js] - Bike in SIM Mode - set Power to : ' + force) //power
            io.emit('simpower', force) //power
            io.emit('control', 'SIM MODE')
                
        }
      success = true
      break
  }
  return success
}
