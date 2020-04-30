class DIS {
    constructor(options) {
        options = options || { };
        this.name = options.name || 'Pi Smart Trainer';
        this.systemId = options.systemId || '12345678954631';
        this.modelNumber = options.modelNumber || '0.1';
        this.serialNumber = options.serialNumber || '0.1';
        this.firmwareRevision = options.firmwareRevision || '0.1';
        this.hardwareRevision = options.hardwareRevision || '0.1';
        this.softwareRevision = options.softwareRevision || '0.1';
        this.manufacturerName = options.manufacturerName || 'Jo';
        this.certification = options.certification || 0;
        this.pnpId = options.pnpId || 0;
    }
}

module.exports = DIS;