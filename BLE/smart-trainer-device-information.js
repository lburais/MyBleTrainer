// ========================================================================
// smart-trainer-device-inforamtion.js
//
// Description for the BLE peripheral (server)
//
// ========================================================================

class DIS {
    constructor(options) {
        options = options || { };
        this.name = options.name || 'Smart Trainer Bridge';
        this.systemId = options.systemId || '1';
        this.modelNumber = options.modelNumber || 'NA';
        this.serialNumber = options.serialNumber || 'NA';
        this.firmwareRevision = options.firmwareRevision || 'Dietpi';
        this.hardwareRevision = options.hardwareRevision || '> Rpi 3+';
        this.softwareRevision = options.softwareRevision || 'node 14.0';
        this.manufacturerName = options.manufacturerName || 'nodejs';
        this.certification = options.certification || 0;
        this.pnpId = options.pnpId || 0;
    }
}

module.exports = DIS;