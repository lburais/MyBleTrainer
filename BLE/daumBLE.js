process.env.BLENO_HCI_DEVICE_ID="0";
//process.env.BLENO_ADVERTISING_INTERVAL=300
const bleno = require('bleno');
const EventEmitter = require('events');
const CyclingPowerService = require('./cycling-power-service');
const FitnessMachineService = require('./ftms-service');
const DeviceInformationService = require('./device-information-service');
//const RSCService = require('./rsc-service');

class DaumBLE extends EventEmitter {
  constructor (options, serverCallback) {
    super();

    this.name = options.name || 'TrainerBLE 1';
    process.env['BLENO_DEVICE_NAME'] = this.name;

    this.csp = new CyclingPowerService();
    this.ftms = new FitnessMachineService(serverCallback);
    this.dis = new DeviceInformationService(options);
    //this.rsc = new RSCService();

    let self = this;
    console.log(`[daumBLE.js] - ${this.name} - BLE server starting`);
    self.emit('key', this.name + ' - BLE server starting');

    bleno.on('stateChange', (state) => {
      console.log(`[daumBLE.js] - ${this.name} - new state: ${state}`);
      self.emit('key', this.name + ' - new state: ' + state);

      self.emit('stateChange', state);

      if (state === 'poweredOn') {
        bleno.startAdvertising(self.name, [
               // self.csp.uuid, 
                self.dis.uuid,
                //self.rsc.uuid,
                self.ftms.uuid
        ]);
      } else {
        console.log('Stopping...');
        bleno.stopAdvertising();
      }
    });

    bleno.on('advertisingStart', (error) => {
      console.log(`[daumBLE.js] - ${this.name} - advertisingStart: ${(error ? 'error ' + error : 'success')}`);
      self.emit('advertisingStart', error);
      self.emit('error', error)

      if (!error) {
        bleno.setServices([
             //   self.csp, 
                self.dis,
                //self.rsc,
                self.ftms
        ],
        (error) => {
                console.log(`[daumBLE.js] - ${this.name} - setServices: ${(error ? 'error ' + error : 'success')}`);
          });
      }
    });

    bleno.on('advertisingStartError', () => {
      console.log(`[daumBLE.js] - ${this.name} - advertisingStartError - advertising stopped`);
      self.emit('advertisingStartError');
      self.emit('error', `[daumBLE.js] - ${this.name} - advertisingStartError - advertising stopped`);
    });

    bleno.on('advertisingStop', error => {
      console.log(`[daumBLE.js] - ${this.name} - advertisingStop: ${(error ? 'error ' + error : 'success')}`);
      self.emit('advertisingStop');
      self.emit('error', `[daumBLE.js] - ${this.name} - advertisingStop: ${(error ? 'error ' + error : 'success')}`);
    });

    bleno.on('servicesSet', error => {
      console.log(`[daumBLE.js] - ${this.name} - servicesSet: ${(error) ? 'error ' + error : 'success'}`);
    });

    bleno.on('accept', (clientAddress) => {
      console.log(`[daumBLE.js] - ${this.name} - accept - Client: ${clientAddress}`);
      self.emit('accept', clientAddress);
      self.emit('key', `[daumBLE.js] - ${this.name} - accept - Client: ${clientAddress}`);
      bleno.updateRssi();
    });

    bleno.on('rssiUpdate', (rssi) => {
      console.log(`[daumBLE.js] - ${this.name} - rssiUpdate: ${rssi}`);
      self.emit('key', `[daumBLE.js] - ${this.name} - rssiUpdate: ${rssi}`);
    });
    
    bleno.on('disconnect', (clientAddress) => {
        self.emit('disconnect', clientAddress);
        self.emit('key', `[daumBLE.js] - ${this.name} - disconnect - Client: ${clientAddress}`); 
    });
  }

  // notifiy BLE services

    notifyFTMS (event) {
        this.ftms.notify(event);
    };

    notifyCSP (event) {    

        this.csp.notify(event);
    };
};

module.exports = DaumBLE;
