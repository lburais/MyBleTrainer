# Virtual Smart Trainer
This project present a Tacx T1932 USB controller as a BLE FTMS machine.
CPC and BAT services are also exposed through the BLE interface.

This is a fork from https://github.com/roethigj/MyBleTrainer for the BLE bridge and server
merged with https://github.com/360manu/kettlerUSB2BLE for the Tacx T1932 interface

## Other source of information
* Kettler Ergorace USB to BLE FTMS service: https://github.com/360manu/kettlerUSB2BLE
* Daum ergobike 8008TRS USB to BLE FTMS server: https://github.com/weinzmi/daumUSB2BLE
* Bleno: https://github.com/noble/bleno

## Prerequisites
* Tacx T1932 controller
* BLE (Bluetooth low energy)
* NodeJS installed (https://nodejs.org)

Tested with a Raspberry Pi 3+ with onboard BLE and nodejs 14.x

## Features
* Detect T1932 attaching and detaching
* BLE FTMS service
* Web server to visualize data and control some actions:
** Data from T1932
** Data from BLE apps
** Internal data
** Logs and traces
* Applications
  * Kinomap (https://www.kinomap.com)
  * ZWIFT (https://zwift.com)
  * Bkool (https://www.bkool.com)
  * FulGaz (https://fulgaz.com)
  * Rouvy AR (https://rouvy.com)
  * GoldenCheetah (http://www.goldencheetah.org)

## Work in progress
Testing ... testing ... testing...
* connect and manage ANT HR and speed cadence sensors
* connect and manage BLE HR and speed cadence sensors
* dynamicaly set simulation parameters (mass, ...)
* more ...

## Setup

This is my install on a rasperypi with DietPi as the operating system (https://dietpi.com).

### bluetooth configuration

```shell
systemctl stop bluetooth
systemctl disable bluetooth
hciconfig hci0 up
```

### software dependencies

```shell
apt install -y git build-essential bluetooth bluez libbluetooth-dev libudev-dev
apt install -y python-dev
```

### install

```shell
git clone https://github.com/lburais/MyBleTrainer.git
cd MyBleTrainer
npm install
```

it can take a while as some packages must be compiled from sources.

## launch
* if SIM mode is a feature you want to use, edit the parameters in config.yml to fit yours
```
physics:
    max_grade: 11     // maximum grade, higher than this, will be cut
    mass_rider: 89    // weight of you, the rider
    mass_bike: 11     // weight of your bike
```

* go to installation directory and start node server from command line
```shell
sudo node server.js
```
### you can install the server as a service, to just plug the raspberry to a power source and ride on

* create ftms.service
```shell
sudo cat > /lib/systemd/system/FTMS.service < EOF
[Unit]
Description=Virtual Smart Trainer service
Requires=bluetooth.service network-online.target
After=bluetooth.service network-online.target


[Service]
ExecStart=/usr/bin/node /home/pi/server.js
# Required on some systems
#WorkingDirectory=/home/pi
Restart=always
# Restart service after 10 seconds if node service crashes
RestartSec=10
# Output to syslog
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=nodejs-example
#User=<alternate user>
#Group=<alternate group>
Environment=NODE_ENV=production PORT=3000

[Install]
WantedBy=multi-user.target

EOF
sudo chmod 644 /lib/systemd/system/FTMS.service
```
* configure
```shell
sudo systemctl daemon-reload
sudo systemctl enable FTMS.service
```
* reboot
```shell
sudo reboot
```
* check status of service
```shell
sudo systemctl status FTMS.service
```

* plug the RS232 to USB converter in any USB port
* start your Daum ergobike 8008 TRS
* start an app like ZWIFT and your Daum bike will appear as "DAUM Ergobike 8008 TRS" device with two services (power & FTMS)

## website / server
* start your browser and enter "pi-adress:3000" (try to get fixed IP address for you raspberry on your router before)
you can follow the Virtual Smart Trainer activity on a this website.

It will display the current power, rpm, speed
the current gear and program your Daum is running and the socket messages.
This site is used to toggle between ERG and SIM mode and toggle between switching gears or just power
### you can use the server to:
* see current data from Daum Ergobike
* see power calculation (simulation), grade (slope), Cw (aerodynamic drag coefficient)
* stop / restart RS232 interface via server
* toggle socket messages - key / raw / error

## current features 0.6.4 BETA
### common
* advanced webserver with dashboard and log messages based on Bootstrap v4.1.3
* apps recognize BLE (Bluetooth low energy) GATT FTM (Fitness machine) and CPC (Cycling power and cadence) service
### in ZWIFT
* ERG mode is fully implemented (FTMS control point), can be switched in workouts via ZWIFT app.
* SIM mode is fully implemented (FTMS control point) and physics simulation based on parameters send from ZWIFT and parameters input by the user - see section "launch"
* use virtual gearbox and use Daum buttons and jog wheel to switch gears
* use gpios (see gpio.js) to add hardware switches for more realistic ride and shifting experience, if not, use the jog wheel or +/- buttons on Daum ergobike 8008 TRS

### tested apps
* FULL GAZ - SIM mode working; no rpm
* ZWIFT - ERG mode working; SIM mode working; all signals working

# outlook / features to be developed
* start NodeJS server and raspberry in access point / hotspot mode to connect via mobile device and scan for your local Wi-Fi and enter credentials
* scan for updates via server and select ergoFACE versions, download and reboot
