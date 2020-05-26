
// ========================================================================
// trainerANT.js
//
// Manage USB ANT sensors (heart rate and speed cadence)
//
// ========================================================================

var message = require('../lib/message')
const Ant = require('ant-plus');
const stick = new Ant.GarminStick2();
var exitHandlerBound = false;

const EventEmitter = require('events');
const config = require('config-yml');
var wheel = config.globals.wheel;

class trainerANT extends EventEmitter {
  constructor (){
      super();
    let self = this;
    let ant_data = {
        hr: 0,
        speed: 0,
        rpm: 0,
        power: 0.0,
        wheel_time: 0,
        wheel_count: 0,
        crank_time: 0,
        crank_count: 0
        };

    const hrScanner = new Ant.HeartRateScanner(stick);
        hrScanner.on('hbData', data => {
            message(`id: ${data.DeviceID}`);
            ant_data.hr = data.ComputedHeartRate;
            self.emit('notified', ant_data);

        });

    hrScanner.on('attached', () => {
        speedCadenceScanner.scan();
        speedScanner.scan();
        cadenceScanner.scan();
      //  fitnessEquipmentScanner.scan();
      //  environmentScanner.scan();
        self.emit('notifications_true');

    });


    const speedCadenceScanner = new Ant.SpeedCadenceScanner(stick);
    speedCadenceScanner.setWheelCircumference(wheel);
    speedCadenceScanner.on('speedData', data => {
        let speed = data.CalculatedSpeed;
        if (speed > 35) speed = 0
        to_watt(data.CalculatedSpeed);
        ant_data.speed = speed*3.6;
        ant_data.wheel_time = data.SpeedEventTime;
        ant_data.wheel_count = data.CumulativeSpeedRevolutionCount;
        self.emit('notified', ant_data);
       // message(`id: ${data.DeviceID}`);
        //message(ant_data.speed);
    });
    speedCadenceScanner.on('cadenceData', data => {
        let rpm = data.CalculatedCadence;
            if (rpm > 300) rpm=0 // cut fake
            ant_data.rpm = rpm;
        ant_data.crank_time = data.CadenceEventTime;
        ant_data.crank_count = data.CumulativeCadenceRevolutionCount;
        self.emit('notified', ant_data);
        //message(`id: ${data.DeviceID}`);
    });

    const speedScanner = new Ant.SpeedScanner(stick);
    speedScanner.setWheelCircumference(wheel);

    speedScanner.on('speedData', data => {
        let speed = data.CalculatedSpeed;
        if (speed > 35) speed = 0
        to_watt(data.CalculatedSpeed);
        ant_data.speed = speed*3.6;
        self.emit('notified', ant_data);
        // message(`id: ${data.DeviceID}`);
        //message(ant_data.speed);
    });
    
    function to_watt (data) {
        let speed_ms = data;

        //road bike top
        let CrEff = 0.4 * 1 * 0.021 + (1.0 - 0.4) * 0.021;
        let Frg = 9.81 * (9.5 + 75) * (CrEff * Math.cos(0) + Math.sin(0)); // no slope, rider 75 kg, bike 9.5 kg
        Frg = 0 ; // no rider to move
        let CwaBike = 1.5 * (1.1 * 0.0033 + 0.9 * 0.0033 + 0.048); //racing tire, high pressure 0.0033
        let adipos = Math.sqrt(75/(1.75*750)); //rider weight 75, - size 1.75
        let CwaRider = (1 + ant_data.rpm * 0.002) * 0.82 * adipos * (((1.75 - adipos) * 0.89) + adipos);  // ridersize 1.75., ccad 0.002
        let Ka = 176.5 * Math.exp(-350 * 0.0001253) * (CwaRider + CwaBike) / (273 + 20); //350 mNN, 20′C
        let power = 1.025 * speed_ms * (Ka * (Math.pow(speed_ms, 2) ) + Frg + speed_ms * 0.1*Math.cos(0)); // simplified - no wind,no slope
        if (power> 5000) power = 0 //cut fake
        ant_data.power = power.toFixed(0)
    }

    const cadenceScanner = new Ant.CadenceScanner(stick);
    cadenceScanner.on('cadenceData', data => {
        ant_data.rpm = data.CalculatedCadence;
        ant_data.crank_time = data.CadenceEventTime;
        ant_data.crank_count = data.CumulativeCadenceRevolutionCount;
        self.emit('notified', ant_data);
        //message(`id: ${data.DeviceID}`);
    });


    stick.on('startup', function() {
        message('startup');
        hrScanner.scan();
    });

    if (!stick.open()) {
        message('Stick not found!');
    }

    process.on('SIGINT', () => {
        setTimeout(function(){
           stick.close;
        }, 500);
    })
  }

}
module.exports = trainerANT;
