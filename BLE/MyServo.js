const pigpio = require('pigpio');
pigpio.configureSocketPort(8889);
var Gpio = pigpio.Gpio;
const motor = new Gpio(17, {mode: Gpio.OUTPUT});
const config = require('config-yml');
var nearest = config.Servo.nearest;
var widest = config.Servo.widest;
var range = widest - nearest;
var servo_set = 0;
const fs = require('fs');
var config_file = "./config.yml";


let pulseWidth = widest;

/*
setInterval(() => {
  motor.servoWrite(pulseWidth);

  pulseWidth += increment;
  if (pulseWidth >= 2100) {
    increment = -100;
  } else if (pulseWidth <= 900) {
    increment = 100;
  }
}, 80);
*/
function MyServo () {
      var self = this
      var speed_ms = 0.0001

    this.setServo = function(number) {
        //number between 0 and 155 (25W-800W, 5W steps, resistance equivalent e-1) -> pulseWidth between 900 and 2100
        //0=900; 155 = 2100 => 2100-900=1200 -> 
        //neu: 1170 - 1470 ?? -d= 300
        //155 soll 0
        //0 soll 155
       servo_set = 155-number;

    console.log('[Servo.js] - this.setServo number:', servo_set)

        pulseWidth = Math.round(parseInt(nearest, 10) + servo_set*range/155)
        if (pulseWidth > widest) pulseWidth = widest;
        if (pulseWidth < nearest) pulseWidth = nearest;
         console.log('[Servo.js] - this.setServo pulsewidth:', pulseWidth)

        pulseWidth = parseInt(pulseWidth, 10); 
   //     setInterval(() => {
                    motor.servoWrite(pulseWidth);
    //    }, 80);
        
    }
    
    this.getSpeed = function(speed, watt) {
        // ignore 0 speed 
        if (speed > 0) {
            speed_ms = speed / 3.6
            // self.setWatt(watt) //called by ERG-Mode
        } else {
            self.setForce(133) // max brforce
        }
        // in ERG-Mode adjust resistance unit...
    } 
    
    this.setWatt = function(power) {
        // need to adjust force: P = F*v ; F/v = const. 'resistance-unit-factor'
        // power shall be between 25 and 800 to meet the wattage profile
        //ref: Tacx neo2: max 2200W, max 250N (speed: 8.8 m/s)
        // hopefully: max 800 W at 20km (6m/s)-> 133 N
        // for ERG-Mode force between 0 and 250 adjusted to 0 a 155 for setting steps
        var force = power / speed_ms
 console.log('[Servo.js] - this.setServo force:', force)
        // force to steps
        var breakforce = Math.round(force * 155/133);
        
        self.setServo(breakforce);
        return force;
    }
    
    this.setLimit = function(limit) {
        var caller = limit[1];
        if (caller === 'change_min') {
            fs.readFile(config_file, 'utf8', function (err,data) {
                if (err) {
                    return console.log(err);
                }
                var old_servo = 'nearest: ' + nearest;
 console.log('[Servo.js] - this.setServo servo:', old_servo)
                nearest = limit[0];
                var new_servo = 'nearest: ' + nearest;
 console.log('[Servo.js] - this.setServo servo:', new_servo)
                var result = data.replace(old_servo, new_servo);
                fs.writeFileSync(config_file, result, 'utf8', function (err) {
                    if (err) return console.log(err);
                }); 
            });
            servo_set = nearest;
 console.log('[Servo.js] - this.setServo servo:', servo_set)

        }
        else {
            fs.readFile(config_file, 'utf8', function (err,data) {
                if (err) {
                    return console.log(err);
                }
                var old_servo = 'widest: ' + widest;
                widest = limit[0];
                var new_servo = 'widest: ' + widest;
                var result = data.replace(old_servo, new_servo);
                fs.writeFileSync(config_file, result, 'utf8', function (err) {
                    if (err) return console.log(err);
                });
            });

            servo_set = widest;
        } 
        range = widest - nearest;
            motor.servoWrite(servo_set);
    }
    
        this.setForce = function(force) {
        // need to adjust force: P = F*v ; F/v = const. 'resistance-unit-factor'
        // power shall be between 25 and 800 to meet the wattage profile
        //ref: Tacx neo2: max 2200W, max 250N (speed: 8.8 m/s)
        // hopefully: max 800 W at 20km (6m/s)-> 133 N
        // for ERG-Mode force between 0 and 250 adjusted to 0 a 155 for setting steps

        var breakforce = Math.round(force * 155/133);
        
        self.setServo(breakforce);
        return force;
    }
    
    this.setGear = function(gear) {
        gear = parseInt(gear,10)-1;
        // 1 - 11 => 0 - 155
        if (gear == 0) {
            self.setServo(Math.round(gear));
        }
        else {
            self.setServo(Math.round(gear * 155 / (11-(1*gear/10 ))));
        }
    }
    
    this.setDirect = function(data) {
        pulseWidth = parseInt(data[0], 10); 
   //     setInterval(() => {
                    motor.servoWrite(pulseWidth);
    }
    
}




module.exports = MyServo