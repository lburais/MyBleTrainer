// ========================================================================
// user-data-service.js
//
// BLE User Data Service 0x181A
//
// TBC
//
// Spec: https://www.bluetooth.com/specifications/gatt/services/
//
// ========================================================================

const bleno = require('bleno');

const StaticReadCharacteristic = require('./static-read-characteristic');

const BlenoPrimaryService = bleno.PrimaryService;

class UserDataService extends BlenoPrimaryService {
  constructor(info) {

    super({
      uuid: '181C',
      characteristics: [
        new StaticReadCharacteristic('2A8A', 'First Name', info.First_Name),
        new StaticReadCharacteristic('2A90', 'Last Name', info.Last_Name),
        new StaticReadCharacteristic('2A87', 'Email Address', info.Email_Address),
        new StaticReadCharacteristic('2A85', 'Date of Birth', info.Date_of_Birth),
        new StaticReadCharacteristic('2A8C', 'Gender', info.Gender),
        new StaticReadCharacteristic('2A98', 'Weight', info.Weight),
        new StaticReadCharacteristic('2A8E', 'Height', info.Height),
        new StaticReadCharacteristic('2A96', 'VO2 Max', info.VO2_Max),
        new StaticReadCharacteristic('2A8D', 'Heart Rate Max', info.Heart_Rate_Max),
        new StaticReadCharacteristic('2AA2', 'Language', info.Language)
      ]
    });

    this.info = info
  }
}

module.exports = UserDataService;
