const pigpio = require('pigpio');
pigpio.configureSocketPort(8889);
var Gpio = pigpio.Gpio;
const motor = new Gpio(17, {mode: Gpio.OUTPUT});
const config = require('config-yml');
const MyLaser = require('./MyLaser');
var nearest = config.Servo.nearest;
var widest = config.Servo.widest;
var range = widest - nearest;
var servo_set = 155;
var m_Rider = config.globals.m_Rider;
var m_Bike = config.globals.m_Bike;
const fs = require('fs');
var config_file = "./config.yml";
var s_bool = false;

let pulseWidth = widest;

function MyServo () {
      var self = this
      var speed_ms = 0.0001
      var myLaser = new MyLaser();

    this.setServo = function(number) {
        //number between 0 and 155 (25W-800W, 5W steps, resistance equivalent e-1) -> pulseWidth between 1500 and 2100
        //0=1500; 155 = 2100 => 2100-1500=600 -> 
        //neu: 1170 - 1470 ?? -d= 300
        //155 soll 0
        //0 soll 155
       servo_set = 155-number;
                       console.log('servo_set', servo_set);


        pulseWidth = Math.round(parseInt(nearest, 10) + servo_set*range/155)
        if (pulseWidth > widest) pulseWidth = widest;
        if (pulseWidth < nearest) pulseWidth = nearest;
        pulseWidth = parseInt(pulseWidth, 10); 
            motor.servoWrite(pulseWidth);
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
 console.log('[Servo.js] - this.setServo force', force)
        // force to steps
        var breakforce = Math.round(force * 155/133);
        
        if (breakforce <= 155) self.setServo(breakforce);
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
                nearest = limit[0];
                var new_servo = 'nearest: ' + nearest;
                var result = data.replace(old_servo, new_servo);
                fs.writeFileSync(config_file, result, 'utf8', function (err) {
                    if (err) return console.log(err);
                }); 
            });
            servo_set = nearest;
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
                    
            servo_set = Math.round((pulseWidth - parseInt(nearest,10)) * 155/range)

    }
    
    myLaser.on('notified', function (data) {
        // adjust resistant unit force based on accelaration
        // servo_set represent F_1
        // to accelete a real bike  we need ro accelarate the rider + bike -> F_2 = m * a
        // F_total = F_1+F_2
        
        //assume servo:155 = 133 N, 0 = 0
                var force_1 = (155 - servo_set) * 133/155;
        //        var force_2 = (m_Bike + m_Bike) * data*5;
            //    console.log('force_2', force_2);
         //       var f_total = force_1 + force_2;
        //        console.log('force_2', f_total, force_1, force_2, servo_set, data);
              /*          pulseWidth = Math.round(parseInt(nearest, 10) + (155-f_total)*range/155)
        if (pulseWidth > widest) pulseWidth = widest;
        if (pulseWidth < nearest) pulseWidth = nearest;
        pulseWidth = parseInt(pulseWidth, 10); */
        if (data == true) {
        //pulseWidth *= 1.03;
       // s_bool = true;
        }
        else {
        //  pulseWidth /= 1.03;  
        //  s_bool = false;
        }
                        console.log('pw', pulseWidth);

            motor.servoWrite(Math.round(pulseWidth));
        
        
        
    });
}




module.exports = MyServo