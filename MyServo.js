
const pigpio = require('pigpio');
    pigpio.configureSocketPort(8889);
    var Gpio =pigpio.Gpio;
const motor = new Gpio(17, {mode: Gpio.OUTPUT});

let pulseWidth = 900;

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
        //0=90; 155 = 2100 => 2100-900=1200 -> 
        //neu: 1170 - 1470 ?? -d= 300
        //155 soll 0
        //0 soll 155 
        if (number < 1) number = 1;
        number = 155 - (number - 1/number)
        
        
        pulseWidth = Math.round(1150 + number*300/155)
 console.log('[Servo.js] - this.setServo pulsewidth:', pulseWidth)
        if (pulseWidth > 1470) pulseWidth = 1470;
        if (pulseWidth < 1170) pulseWidth = 1170;
        if (pulseWidth <= 1470) {  
            setInterval(() => {
                    motor.servoWrite(pulseWidth);
            }, 80);
        }
    }
    
    this.getSpeed = function(speed, watt) {
        // ignore 0 speed 
        if (speed > 0) {
            speed_ms = speed / 3.6
           // self.setWatt(watt)
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
        self.setServo(Math.round((gear)*(155)/(11)));
    }
    
}




module.exports = MyServo