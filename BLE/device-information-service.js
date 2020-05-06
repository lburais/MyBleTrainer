// ========================================================================
// device-information-service.js
//
// BLE Device Information Service 0x180A
//
// This service exposes manufacturer information about a device. 
// The Device Information Service is instantiated as a Primary Service. 
// Only one instance of the Device Information Service is exposed on a device.
//
// Spec: https://www.bluetooth.com/specifications/gatt/services/
//
// ========================================================================

const bleno = require('bleno');
const DIS = require('./smart-trainer-device-information');

const StaticReadCharacteristic = require('./static-read-characteristic');

const BlenoPrimaryService = bleno.PrimaryService;


/* bleDevice class MUST define the following:
  
  systemId (2A23)
  modelNumber (2A24)
  serialNumber (2A25)
  firmwareRevision (2A26)
  hardwareRevision (2A27)
  softwareRevision (2A28)
  manufacturerName (2A29)
  certification (2A2A)
  pnpId (2A50)
  
*/
class DeviceInformationService extends BlenoPrimaryService {
  constructor(bleDevice) {
    let info = new DIS(bleDevice);

    super({
      uuid: '180A',
      //uuid: '0ffffffffffffffffffffffffffffff0',
      characteristics: [
        new StaticReadCharacteristic('2A23', 'System Id', info.systemId),
        new StaticReadCharacteristic('2A24', 'Model Number', info.modelNumber),
        new StaticReadCharacteristic('2A25', 'Serial Number', info.serialNumber),
        new StaticReadCharacteristic('2A26', 'Firmware Revision', info.firmwareRevision),
        new StaticReadCharacteristic('2A27', 'Hardware Revision', info.hardwareRevision),
        new StaticReadCharacteristic('2A28', 'Software Revision', info.softwareRevision),
        new StaticReadCharacteristic('2A29', 'Manufacturer Name', info.manufacturerName)
      ]
    });

    this.info = info;
  }
}

module.exports = DeviceInformationService;
