// ========================================================================
// smart-trainer.js
//
// Manage the BLE peripheral (server)
//
// ========================================================================

process.env.BLENO_HCI_DEVICE_ID="0"; //need internal BLE >4.0
//process.env.BLENO_ADVERTISING_INTERVAL=200
const bleno = require('bleno');
const EventEmitter = require('events');
const FitnessMachineService = require('./fitness-machine-service');
const DeviceInformationService = require('./device-information-service');
const config = require('config-yml');
var logger = require('../lib/logger')


var DEBUG = config.globals.debugBLE || config.trainerBLE.debug;

var rim = config.globals.rim;
var wheel_weight = config.globals.wheel_weight;
var wheel_time_1, wheel_time_2, wheel_time_3 = 0;
var wheel_count_1, wheel_count_2 = 0;
var rim_speed_1, rim_speed_2 = 0;
var trainer_const = 1;
var trainer_const_array = [];

class TrainerBLE extends EventEmitter {
  constructor (options, serverCallback) {
    super();

    this.name = options.name || 'VirtualTrainerBLE';
    process.env['BLENO_DEVICE_NAME'] = this.name;

    this.ftms = new FitnessMachineService(serverCallback);
    this.dis = new DeviceInformationService(options);

    let self = this;
    if (DEBUG) logger.info(`[smart-trainer.js] - ${this.name} - BLE server starting`);
    self.emit('key', this.name + ' - BLE server starting');

    bleno.on('stateChange', (state) => {
      if (DEBUG) logger.info(`[smart-trainer.js] - ${this.name} - new state: ${state}`);
      self.emit('key', this.name + ' - new state: ' + state);

      self.emit('stateChange', state);

      if (state === 'poweredOn') {
        bleno.startAdvertising(self.name, [
                self.ftms.uuid,
                self.dis.uuid
      } else {
        if (DEBUG) logger.info('Stopping...');
        bleno.stopAdvertising();
      }
    })

    bleno.on('advertisingStart', (error) => {
      if (DEBUG) logger.info(`[smart-trainer.js] - ${this.name} - advertisingStart: ${(error ? 'error ' + error : 'success')}`)
      self.emit('advertisingStart', error);
      self.emit('error', error)

      if (!error) {
        bleno.setServices([
                self.ftms,
                self.dis
          ],
          (error) => {
            if (DEBUG) logger.info(`[smart-trainer.js] - ${this.name} - setServices: ${(error ? 'error ' + error : 'success')}`)
          }
        )
      }
    })

    bleno.on('advertisingStartError', () => {
      if (DEBUG) logger.info(`[smart-trainer.js] - ${this.name} - advertisingStartError - advertising stopped`);
      self.emit('advertisingStartError');
      self.emit('error', `[smart-trainer.js] - ${this.name} - advertisingStartError - advertising stopped`);
    });

    bleno.on('advertisingStop', error => {
      if (DEBUG) logger.info(`[smart-trainer.js] - ${this.name} - advertisingStop: ${(error ? 'error ' + error : 'success')}`);
      self.emit('advertisingStop');
      self.emit('error', `[smart-trainer.js] - ${this.name} - advertisingStop: ${(error ? 'error ' + error : 'success')}`);
    });

    bleno.on('servicesSet', error => {
      if (DEBUG) logger.info(`[smart-trainer.js] - ${this.name} - servicesSet: ${(error) ? 'error ' + error : 'success'}`);
    });

    bleno.on('accept', (clientAddress) => {
      if (DEBUG) logger.info(`[smart-trainer.js] - ${this.name} - accept - Client: ${clientAddress}`);
      self.emit('accept', clientAddress);
      self.emit('key', `[smart-trainer.js] - ${this.name} - accept - Client: ${clientAddress}`);
      bleno.updateRssi();
    });

    bleno.on('rssiUpdate', (rssi) => {
      if (DEBUG) logger.info(`[smart-trainer.js] - ${this.name} - rssiUpdate: ${rssi}`);
      self.emit('key', `[smart-trainer.js] - ${this.name} - rssiUpdate: ${rssi}`);
    });

    bleno.on('disconnect', (clientAddress) => {
      self.emit('disconnect', clientAddress);
      self.emit('key', `[smart-trainer.js] - ${this.name} - disconnect - Client: ${clientAddress}`);
    });

    // /////////////////////////////////////////////////////////////////////////
    // VirtualTrainer
    // /////////////////////////////////////////////////////////////////////////
/*
    //measuring Force
    this.measure = function(event) {
      wheel_count_1 = event.wheel_count;
      wheel_time_1 = event.wheel_time;
      var time_backcount, count_backcount;

      time_backcount = wheel_time_1;
      count_backcount = wheel_count_1;

      if (wheel_time_2 > wheel_time_1) { //Hit rollover value
        wheel_time_1 += (1024 * 64);
        logger.info('wheel_rollover')
      }

      if (wheel_count_2 > wheel_count_1) { //Hit rollover value
        wheel_count_1 += (1024 * 64);
        logger.info('count_rollover')
      }

		  const distance = rim * (wheel_count_1 - wheel_count_2);

      //speed in m/sec
      rim_speed_1 = (distance * 1024) / (wheel_time_1 - wheel_time_2);
      if (!isNaN(rim_speed_1)) {
        if (rim_speed_1 < rim_speed_2) {
          const x = (wheel_weight * ((rim_speed_1 - rim_speed_2)/(wheel_time_2-wheel_time_1))) / (rim_speed_1 + ((rim_speed_2 - rim_speed_1) / 2));
          trainer_const_array.push(parseFloat(x));
        }
      } else { logger.info('NaNAlart') }

      rim_speed_2 = rim_speed_1;
      wheel_time_2 = time_backcount;
      // wheel_count_2 = count_backcount;

      if (event.speed < 8) {
        trainer_const = trainer_const_array.reduce(function(acc, val) { return acc + val; }, 0) / trainer_const_array.length;
        logger.info('trainer_const', trainer_const, trainer_const_array.length)
        trainer_const_array.length = 0
        return false;
      }
      return true;
    }
  }
*/
  // /////////////////////////////////////////////////////////////////////////
  // Notify BLE services
  // /////////////////////////////////////////////////////////////////////////

  notifyFTMS (event) {
    this.ftms.notify(event)
  }
}

module.exports = TrainerBLE
