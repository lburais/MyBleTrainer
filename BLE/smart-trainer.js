// ========================================================================
// smart-trainer.js
//
// Manage the BLE peripheral (server)
//
// ========================================================================

process.env.BLENO_HCI_DEVICE_ID="0"
const bleno = require('bleno')
var message = require('../lib/message')

const EventEmitter = require('events')
const FitnessMachineService = require('./fitness-machine-service')
const DeviceInformationService = require('./device-information-service')

var DeviceInformation = {
  name: 'Smart Trainer Bridge',
  systemId: '1',
  modelNumber: 'NA',
  serialNumber: 'NA',
  firmwareRevision: 'Dietpi',
  hardwareRevision: 'Rpi 3 model B+',
  softwareRevision: 'node 14.x',
  manufacturerName: 'Laurent Burais',
  certification: [0],
  pnpId: [0]
}

class TrainerBLE extends EventEmitter {
  constructor (options, serverCallback) {
    super();

    this.name = options.name || 'VirtualTrainerBLE'
    process.env['BLENO_DEVICE_NAME'] = this.name

    this.ftms = new FitnessMachineService(serverCallback)
    this.dis = new DeviceInformationService(DeviceInformation)

    let self = this;
    message(`BLE server starting`)

    bleno.on('stateChange', (state) => {
      message(`new state: ${state}`)

      self.emit('stateChange', state)

      if (state === 'poweredOn') {
        bleno.startAdvertising(self.name, [ self.ftms.uuid, self.dis.uuid ])
      } else {
        message(`stopping...`)
        bleno.stopAdvertising();
      }
    })

    bleno.on('advertisingStart', (error) => {
      message(`advertisingStart: ${error}`, `${(error?'error':'info')}`)
      self.emit('advertisingStart', error);

      if (!error) {
        bleno.setServices([ self.ftms, self.dis ],
          (error) =>
          { message(`setServices: ${error}`, `${(error?'error':'info')}`) }
        )
      }
    })

    bleno.on('advertisingStartError', () => {
      message(`advertisingStartError - advertising stopped`, `${(error?'error':'info')}`)
      self.emit('advertisingStartError', error);
    })

    bleno.on('advertisingStop', error => {
      message(`advertisingStop: ${error}`, `${(error?'error':'info')}`)
      self.emit('advertisingStop', error);
    })

    bleno.on('servicesSet', error => {
      message(`servicesSet: ${error}`, `${(error?'error':'info')}`)
    })

    bleno.on('accept', (clientAddress) => {
      message(`accept - Client: ${clientAddress}`)
      self.emit('accept', clientAddress);
      bleno.updateRssi();
    })

    bleno.on('rssiUpdate', (rssi) => {
      message(`rssiUpdate: ${rssi}`)
    })

    bleno.on('disconnect', (clientAddress) => {
      message(`disconnect - Client: ${clientAddress}`)
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
