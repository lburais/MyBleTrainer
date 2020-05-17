// ========================================================================
// smart-trainer.js
//
// Manage the BLE peripheral (server)
//
// ========================================================================

process.env.BLENO_HCI_DEVICE_ID="0" //need internal BLE >4.0
//process.env.BLENO_ADVERTISING_INTERVAL=200
const bleno = require('bleno')
const EventEmitter = require('events')
const FitnessMachineService = require('./fitness-machine-service')
const DeviceInformationService = require('./device-information-service')
const config = require('config-yml')
var logger = require('../lib/logger')


var DEBUG = config.globals.debugBLE || config.trainerBLE.debug

class TrainerBLE extends EventEmitter {
  constructor (options, serverCallback) {
    super();

    this.name = options.name || 'VirtualTrainerBLE'
    process.env['BLENO_DEVICE_NAME'] = this.name

    this.ftms = new FitnessMachineService(serverCallback)
    this.dis = new DeviceInformationService(options)

    let self = this;
    if (DEBUG) logger.info(`[smart-trainer.js] - ${this.name} - BLE server starting`)
    self.emit('key', this.name + ' - BLE server starting')

    bleno.on('stateChange', (state) => {
      if (DEBUG) logger.info(`[smart-trainer.js] - ${this.name} - new state: ${state}`)
      self.emit('key', this.name + ' - new state: ' + state)

      self.emit('stateChange', state)

      if (state === 'poweredOn') {
        bleno.startAdvertising(self.name, [ self.ftms.uuid, self.dis.uuid ])
      } else {
        if (DEBUG) logger.info('Stopping...')
        bleno.stopAdvertising();
      }
    })

    bleno.on('advertisingStart', (error) => {
      if (DEBUG) logger.info(`[smart-trainer.js] - ${this.name} - advertisingStart: ${(error ? 'error ' + error : 'success')}`)
      self.emit('advertisingStart', error);
      self.emit('error', error)

      if (!error) {
        bleno.setServices([ self.ftms, self.dis ],
          (error) => { if (DEBUG) logger.info(`[smart-trainer.js] - ${this.name} - setServices: ${(error ? 'error ' + error : 'success')}`) }
        )
      }
    })

    bleno.on('advertisingStartError', () => {
      if (DEBUG) logger.info(`[smart-trainer.js] - ${this.name} - advertisingStartError - advertising stopped`);
      self.emit('advertisingStartError');
      self.emit('error', `[smart-trainer.js] - ${this.name} - advertisingStartError - advertising stopped`);
    })

    bleno.on('advertisingStop', error => {
      if (DEBUG) logger.info(`[smart-trainer.js] - ${this.name} - advertisingStop: ${(error ? 'error ' + error : 'success')}`);
      self.emit('advertisingStop');
      self.emit('error', `[smart-trainer.js] - ${this.name} - advertisingStop: ${(error ? 'error ' + error : 'success')}`);
    })

    bleno.on('servicesSet', error => {
      if (DEBUG) logger.info(`[smart-trainer.js] - ${this.name} - servicesSet: ${(error) ? 'error ' + error : 'success'}`);
    })

    bleno.on('accept', (clientAddress) => {
      if (DEBUG) logger.info(`[smart-trainer.js] - ${this.name} - accept - Client: ${clientAddress}`);
      self.emit('accept', clientAddress);
      self.emit('key', `[smart-trainer.js] - ${this.name} - accept - Client: ${clientAddress}`);
      bleno.updateRssi();
    })

    bleno.on('rssiUpdate', (rssi) => {
      if (DEBUG) logger.info(`[smart-trainer.js] - ${this.name} - rssiUpdate: ${rssi}`);
      self.emit('key', `[smart-trainer.js] - ${this.name} - rssiUpdate: ${rssi}`);
    })

    bleno.on('disconnect', (clientAddress) => {
      self.emit('disconnect', clientAddress);
      self.emit('key', `[smart-trainer.js] - ${this.name} - disconnect - Client: ${clientAddress}`);
    })
  }

  // /////////////////////////////////////////////////////////////////////////
  // Notify BLE services
  // /////////////////////////////////////////////////////////////////////////

  notifyFTMS (event) {
    this.ftms.notify(event)
  }
}

module.exports = TrainerBLE
