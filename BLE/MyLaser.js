const pigpio = require('pigpio');
pigpio.configureSocketPort(8889);
var Gpio = pigpio.Gpio;
const EventEmitter = require('events');

const echo = new Gpio(22, {mode: Gpio.INPUT, alert: true});


var ma = [];

const config = require('config-yml');
var wheel = config.globals.wheel;
var spokes = config.globals.spokes
//var timediff_1, timediff_2 = 0;
var spoke_speed_1, spoke_speed_2 = 0;
var ma_average_old;
var diff_old = 0;
var count_false = 0;
var accel = 0;
var accel_bool = false;
var false_val = 0;

class MyLaser extends EventEmitter {
    constructor (){
     
        super();
        let self = this;

        const Laser = () => {
            let startTick;
            let spoke;
            let oldTick, newTick = 0;
  
            this.acceleration = function(timediffms) {
                const distance = wheel / spokes;
                let x= 0;
                //speed in m/sec
                //timediff_1 = timediffms
                spoke_speed_1 = distance  / (timediffms/1e6);
//              console.log('spoke_speed', spoke_speed_1, timediffms/1e6)
                if (!isNaN(spoke_speed_1)) {
                    if (spoke_speed_1 != spoke_speed_2) {
                        x = (spoke_speed_1 - spoke_speed_2)/((timediffms)/1e6);
                    }
                } 
                else { 
//                    console.log('NaNAlart') 
                }
                spoke_speed_2 = spoke_speed_1;
                return x;
            }
  

            echo.on('alert', (level, tick) => {
                if (level === 1) {
                    newTick = tick;
                    if (oldTick != 0) {
                        const diff = pigpio.tickDiff(oldTick, newTick);
//                      console.log('false?', diff);
                        if ((((diff < diff_old * 1.2) && (diff > diff_old * 0.8)) || ((diff > 0 ) && (diff_old <= 0)) || (ma.length < 3)) && (Math.abs(diff) < 1e6)) {
                            ma.push(diff);
                            diff_old = diff;
                            count_false = 0;
                            false_val =0;
                        }
                        else {
//                            console.log('false!');
                            if (diff < 1e6) {
                                if (count_false < 3) {
                                    count_false += 1;
                                    false_val += diff;
                                    if ((false_val * 1.2 > diff_old) || (false_val * 0.8 > diff_old)) {
                                        ma.push(false_val);
                                        diff_old = false_val;
                                        count_false = 0;
                                        false_val =0;
                                    }   
                                }
                                else {
                                    count_false = 0;
                                    false_val =0;
                                }
                            }                    
                        }
                        if (ma.length > 8) ma.shift();
                        let sum = ma.reduce(function(pv, cv) { return pv + cv; }, 0); 
                        const ma_average = sum / ma.length;
                        accel = this.acceleration(ma_average);
//                      console.log('ma_average: ', ma_average, ' ', ma[0], ' ', ma[1], ' ', ma[2]);
//                      console.log('acceleration in m/s²: ', accel);
                        if ((Math.abs(accel) < 3) && accel > 0 ) {
                            if (accel > 0.02 && accel_bool == false) { 
                                accel_bool = true;
                                self.emit('notified', accel_bool);
                            }
                            if (accel < -0.02 && accel_bool == true) { 
                                accel_bool = false;
                                self.emit('notified', accel_bool);
                            }   
                        }
                    }
                    oldTick = newTick;
                }
            });

        };
        Laser();
    }
}

module.exports = MyLaser;