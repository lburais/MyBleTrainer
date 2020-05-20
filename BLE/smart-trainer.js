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

const path = require('path')
const moduleName = path.win32.basename(module.filename).replace('.js', '')

class TrainerBLE extends EventEmitter {
  constructor (options, serverCallback) {
    super();

    this.name = options.name || 'VirtualTrainerBLE'
    process.env['BLENO_DEVICE_NAME'] = this.name

    this.ftms = new FitnessMachineService(serverCallback)
    this.dis = new DeviceInformationService(options)

    let self = this;
    self.emit('log', {module: moduleName, level: 'info', msg: `${this.name} - BLE server starting`})

    bleno.on('stateChange', (state) => {
      self.emit('log', {module: moduleName, level: 'info', msg: `${this.name} - new state: ${state}`})

      self.emit('stateChange', state)

      if (state === 'poweredOn') {
        bleno.startAdvertising(self.name, [ self.ftms.uuid, self.dis.uuid ])
      } else {
        self.emit('log', {module: moduleName, level: 'info', msg: `${this.name} - stopping...`})
        bleno.stopAdvertising();
      }
    })

    bleno.on('advertisingStart', (error) => {
      self.emit('log', {module: moduleName, level: `${(error?'error':'info')}`, msg: `${this.name} - advertisingStart: ${error}`})
      self.emit('advertisingStart', error);

      if (!error) {
        bleno.setServices([ self.ftms, self.dis ],
          (error) =>
          { self.emit('log', {module: moduleName, level: `${(error?'error':'info')}`, msg: `${this.name} - setServices: ${error}`}) }
        )
      }
    })

    bleno.on('advertisingStartError', () => {
      self.emit('log', {module: moduleName, level: `error`, msg: `${this.name} - advertisingStartError - advertising stopped`})
      self.emit('advertisingStartError', error);
    })

    bleno.on('advertisingStop', error => {
      self.emit('log', {module: moduleName, level: `${(error?'error':'info')}`, msg: `${this.name} - advertisingStop: ${error}`})
      self.emit('advertisingStop', error);
    })

    bleno.on('servicesSet', error => {
      self.emit('log', {module: moduleName, level: `${(error?'error':'info')}`, msg: `${this.name} - servicesSet: ${error}`})
    })

    bleno.on('accept', (clientAddress) => {
      self.emit('log', {module: moduleName, level: `info`, msg: `${this.name} - accept - Client: ${clientAddress}`})
      self.emit('accept', clientAddress);
      bleno.updateRssi();
    })

    bleno.on('rssiUpdate', (rssi) => {
      self.emit('log', {module: moduleName, level: `info`, msg: `${this.name} - rssiUpdate: ${rssi}`})
    })

    bleno.on('disconnect', (clientAddress) => {
      self.emit('log', {module: moduleName, level: `info`, msg: `${this.name} - disconnect - Client: ${clientAddress}`})
      self.emit('disconnect', clientAddress);
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
