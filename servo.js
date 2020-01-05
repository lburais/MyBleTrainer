
const pigpio = require('pigpio');
    pigpio.configureSocketPort(8889);
    var Gpio =pigpio.Gpio;
const motor = new Gpio(17, {mode: Gpio.OUTPUT});

let pulseWidth = 900;
let increment = 100;


setInterval(() => {
  motor.servoWrite(pulseWidth);

  pulseWidth += increment;
  if (pulseWidth >= 2100) {
    increment = -100;
  } else if (pulseWidth <= 900) {
    increment = 100;
  }
}, 80);