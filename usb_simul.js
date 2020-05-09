const usb = require("webusb").usb;

const device = usb.requestDevice({
    filters: [{vendorId: 0x0d28}]
})
