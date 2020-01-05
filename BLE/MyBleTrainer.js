/*jslint node: true */
//"use strict";
process.env.NOBLE_HCI_DEVICE_ID="1"
process.env.NOBLE_MULTI_ROLE=1
//process.env.NOBLE_REPORT_ALL_HCI_EVENTS=1
const noble = require('noble');
const serviceUuids = ['1816','180d'];
var exitHandlerBound = false;
const maxPeripherals = 4;
let peripherals = [];
const EventEmitter = require('events');
const config = require('config-yml');
var DEBUG = config.DEBUG.Trainer;
let deviceMapping = {};

class MyBleTrainer extends EventEmitter {
  constructor (){
      super();
    let self = this;
    let ble_data = {
        hr: 0,
        speed: 0,
        rpm: 0,
        power: 0
        };
    self.rpm_n_ticks = 0
    self.rpm_t_ticks = 0
    self.wheel_n_ticks = 0
    self.wheel_t_ticks = 0
    
    var connect = function(err) {
        if (err) throw err;
        if (DEBUG) console.log("Connection to " + this.peripheral.uuid);
        peripherals[peripherals.length] = this.peripheral;


        if (peripherals.length >= maxPeripherals) {
            console.log("Stopping BLE scan. Reached " + maxPeripherals + " peripherals");
            noble.stopScanning();
        };

        if (!exitHandlerBound) {
            exitHandlerBound = true;
            process.on('SIGINT', exitHandler);
        };
    //    setTimeout(function() {
            this.peripheral.discoverServices(['1816','180d'], setupService, this.peripheral.uuid);
    //    }, 1000);
        
       // this.peripheral.discoverServices([], setupService);
    };

    var setupService = function(err,services,puuid) {
        if (err) throw err;

        
        services.forEach(function(service) { 
                    if (DEBUG) console.log("service " + service.uuid);

            if(service.uuid == '1816') {
                if (DEBUG) console.log("found CSCService UUID");
                var characteristicUUIDs = ['2a5b'];
                service.discoverCharacteristics(characteristicUUIDs, function(error, characteristics) {
               // console.log("got characteristics");

                    requestNotify(characteristics[0]); //this is the first scratch characteristic.
                });
            }; 
            if (service.uuid == '180d') {
                if (DEBUG) console.log("found HRMService UUID");
                var characteristicUUIDs = ['2a37'];
                service.discoverCharacteristics(characteristicUUIDs, function(error, characteristics) {
 
                    requestNotify(characteristics[0]); //this is the first scratch characteristic.
                });
            };
        });
    };

    var requestNotify = function(characteristic) {
        characteristic.on('read', function(data, isNotification) {
           
            if (this._serviceUuid == '1816') {
                ble_data.raw=data
                to_rpm(data);
                to_speed(data);
                to_watt(ble_data);
                self.emit('notified', ble_data);
            characteristic.unsubscribe(function(error){}); 
            characteristic.subscribe(function(error){}); 
            }
            if (this._serviceUuid == '180d') {
                to_hr(data);
            characteristic.unsubscribe(function(error){}); 
            characteristic.subscribe(function(error){}); 
            }

        });
        characteristic.notify(true, function(error) {
            if (DEBUG) console.log('turned on notifications ' + (error ? ' with error' : 'without error'));
                        self.emit('notifications_true');

        });
    };

    function to_hr (data) {
        let cursor = 0
        function readNext(byteLength) {
            const value = (byteLength > 0) ? data.readUIntLE(cursor, byteLength) : undefined
            cursor += byteLength
            return value
        }
        // the first byte of data is the mandatory "Flags" value,
        // which indicates how to read the rest of the data buffer.
        const flags = readNext(1)
        // 0b00010110
        //          ^ 0 => Heart Rate Value Format is set to UINT8. Units: beats per minute (bpm)
        //            1 => Heart Rate Value Format is set to UINT16. Units: beats per minute (bpm)
        //        ^^ 00 or 01 => Sensor Contact feature is not supported in the current connection
        //           10       => Sensor Contact feature is supported, but contact is not detected
        //           11       => Sensor Contact feature is supported and contact is detected
        //       ^ 0 => Energy Expended field is not present
        //         1 => Energy Expended field is present (units are kilo Joules)
        //      ^ 0 => RR-Interval values are not present
        //        1 => One or more RR-Interval values are present
        //   ^^^ Reserved for future use
        const valueFormat =          (flags >> 0) & 0b01
        const sensorContactStatus =  (flags >> 1) & 0b11
        const energyExpendedStatus = (flags >> 3) & 0b01
        const rrIntervalStatus =     (flags >> 4) & 0b01

        ble_data.hr = readNext(valueFormat === 0 ? 1 : 2)
        //   const sensor = (sensorContactStatus === 2) ? 'no contact' : ((sensorContactStatus === 3) ? 'contact' : 'N/A')
        //   const energyExpended = readNext(energyExpendedStatus === 1 ? 2 : 0)
        const rrSample = readNext(rrIntervalStatus === 1 ? 2 : 0)
        // RR-Interval is provided with "Resolution of 1/1024 second"
        ble_data.rr = rrSample && (rrSample * 1000/1024) | 0
        self.emit('notified', ble_data);
    }

    function to_speed (data) {
        let t_ticks = 0;
        let n_ticks = 0;
        
        self.wheel_n_tick_new = data.readUInt32LE(1)
        self.wheel_t_tick_new = data.readUInt16LE(5)
        if (self.wheel_t_ticks != self.wheel_t_tick_new) {
            if (self.wheel_t_tick_new < self.wheel_t_ticks) {
                t_ticks = self.wheel_t_tick_new + 65535 - self.wheel_t_ticks
            } else {
                t_ticks = self.wheel_t_tick_new - self.wheel_t_ticks
            }
            if (self.wheel_n_tick_new < self.wheel_n_ticks) {
                n_ticks = self.wheel_n_tick_new + 2147483647 - self.wheel_n_ticks
            } else {
                n_ticks = self.wheel_n_tick_new - self.wheel_n_ticks
            }           
            
            let speed = ((self.wheel_n_tick_new - self.wheel_n_ticks) / ((t_ticks) / 1024))*60 //RPM
            speed = (config.globals.wheel * speed )*60/1000 //rpm ->km/h
            if (speed > 200) speed = 200 //cut fake
            ble_data.speed = speed.toFixed(1).toString()
        } else {
            ble_data.speed = 0
        }
        self.wheel_n_ticks = self.wheel_n_tick_new
        self.wheel_t_ticks = self.wheel_t_tick_new           
    }

    function to_watt (ble_data) {
        let speed_ms = ble_data.speed / 3.6;
         
        //road bike top
        let CrEff = 0.4 * 1 * 0.021 + (1.0 - 0.4) * 0.021; 
        let Frg = 9.81 * (9.5 + 75) * (CrEff * Math.cos(0) + Math.sin(0)); // no slope, rider 75 kg, bike 9.5 kg
        let CwaBike = 1.5 * (1.1 * 0.0033 + 0.9 * 0.0033 + 0.048); //racing tire, high pressure 0.0033
        let adipos = Math.sqrt(75/(1.75*750)); //rider weight 75, - size 1.75
        let CwaRider = (1 + ble_data.rpm * 0.002) * 0.82 * adipos * (((1.75 - adipos) * 0.89) + adipos);  // ridersize 1.75., ccad 0.002
        let Ka = 176.5 * Math.exp(-350 * 0.0001253) * (CwaRider + CwaBike) / (273 + 20); //350 mNN, 20′C
        let power = 1.025 * speed_ms * (Ka * (Math.pow(speed_ms, 2) ) + Frg + speed_ms * 0.1*Math.cos(0)); // simplified - no wind,no slope
        if (power> 5000) power = 5000 //cut fake
        ble_data.power = power.toFixed(0)
    }

    function to_rpm (data) {
        let t_ticks = 0;
        let n_ticks = 0;

        self.rpm_n_tick_new = data.readUInt16LE(7)
        self.rpm_t_tick_new = data.readUInt16LE(9)
        if (self.rpm_t_ticks != self.rpm_t_tick_new) {
            if (self.rpm_t_tick_new < self.rpm_t_ticks) {
                t_ticks = self.rpm_t_tick_new + 65535 - self.rpm_t_ticks
            } else {
                t_ticks = self.rpm_t_tick_new - self.rpm_t_ticks
            }
            if (self.rpm_n_tick_new < self.rpm_n_ticks) {
                n_ticks = self.rpm_n_tick_new + 65535 - self.rpm_n_ticks
            } else {
                n_ticks = self.rpm_n_tick_new - self.rpm_n_ticks
            }           
            
            let rpm = ((self.rpm_n_tick_new - self.rpm_n_ticks) / ((t_ticks) / 1024))*60
            if (rpm > 300) rpm=300 // cut fake
            ble_data.rpm = rpm.toFixed(0).toString()
        } else {
            ble_data.rpm = 0
        }
        self.rpm_n_ticks = self.rpm_n_tick_new
        self.rpm_t_ticks = self.rpm_t_tick_new
    }

    var discover = function(peripheral) {
            console.log("(scan)found:" + peripheral.advertisement.localName + " - UUID: " + peripheral.uuid);
            deviceMapping[peripheral.uuid] = peripheral.advertisement.localName;
              setTimeout(function(){
                    peripheral.connect(connect.bind({peripheral:peripheral}));  
              },300);
    };

//false = do not allow multiple - devices differentiated by peripheral UUID
//limit to devices having the service UUID below - which all Beans have
var rescan = function () {
                  console.log('rescan');

    noble.startScanning(serviceUuids, false);

}

noble.on('stateChange', function(state) {
  if (state === 'poweredOn')
    noble.startScanning(serviceUuids, false);
  else
    noble.stopScanning();
});


noble.on('discover', discover);
//noble.on('scanStop', rescan);



this.recon = function () {
            if (DEBUG) console.log('reconnect');

        noble.stopScanning();
        
          peripherals.forEach(function(peripheral) {
            if (DEBUG) console.log('Disconnecting from ' + peripheral.uuid + '...');
            peripheral.disconnect( function(){
                if (DEBUG) console.log('disconnected');
            });
          });
        peripherals = [];
          setTimeout(function(){
                noble.startScanning(serviceUuids, false);
      
          }, 1000);
    }


var exitHandler = function exitHandler() {
  peripherals.forEach(function(peripheral) {
    console.log('Disconnecting from ' + peripheral.uuid + '...');
    peripheral.disconnect( function(){
          console.log('disconnected');
    });
  });

  //end process after 2 more seconds
 /* setTimeout(function(){
    process.exit();
  }, 2000);*/
}

process.stdin.resume();//so the program will not close instantly

  }

}
module.exports = MyBleTrainer;
