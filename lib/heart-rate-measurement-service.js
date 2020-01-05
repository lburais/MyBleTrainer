var HEART_RATE_MEASUREMENT_SERVICE_UUID = '180d';
var MEASUREMENT_UUID                    = '2a37';
var BODY_SENSOR_LOCATION_UUID           = '2a38';
var CONTROL_POINT_UUID                  = '2a39';

function HeartRateMeasurementService() {
}

HeartRateMeasurementService.prototype.readBodySensorLocation = function(callback) {
  this.readUInt8Characteristic(HEART_RATE_MEASUREMENT_SERVICE_UUID, BODY_SENSOR_LOCATION_UUID, callback);
};

HeartRateMeasurementService.prototype.writeControlPoint = function(data, callback) {
  this.writeUInt8Characteristic(HEART_RATE_MEASUREMENT_SERVICE_UUID, CONTROL_POINT_UUID, data, callback);
};

HeartRateMeasurementService.prototype.notifyMeasurement = function(callback) {
  this.onMeasurementChangeBinded = this.onMeasurementChange.bind(this);
  this.notifyCharacteristic(HEART_RATE_MEASUREMENT_SERVICE_UUID, MEASUREMENT_UUID, true, this.onMeasurementChangeBinded, callback);
};

HeartRateMeasurementService.prototype.unnotifyMeasurement = function(callback) {
  this.notifyCharacteristic(HEART_RATE_MEASUREMENT_SERVICE_UUID, MEASUREMENT_UUID, false, this.onMeasurementChangeBinded, callback);
};

HeartRateMeasurementService.prototype.onMeasurementChange = function(data) {
  this.convertMeasurement(data, function(counter) {
    this.emit('measurementChange', counter);
  }.bind(this));
};

HeartRateMeasurementService.prototype.readMeasurement = function(callback) {
  this.readDataCharacteristic(HEART_RATE_MEASUREMENT_SERVICE_UUID, MEASUREMENT_UUID, function(error, data) {
    if (error) {
      return callback(error);
    }

    this.convertMeasurement(data, function(counter) {
      callback(null, counter);
    });
  }.bind(this));
};

HeartRateMeasurementService.prototype.convertMeasurement = function(data, callback) {
  var flags = data.readUInt8(0);

  if (flags & 0x01) {
    // uint16
    callback(data.readUInt16LE(1));
  } else {
    // uint8
    callback(data.readUInt8(1));
  }
};

module.exports = HeartRateMeasurementService;