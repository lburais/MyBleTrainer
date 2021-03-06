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
ExecStart=/usr/bin/node /mnt/dietpi_userdata/osiris/MyBleTrainer/server.js
# Required on some systems
#WorkingDirectory=/mnt/dietpi_userdata/osiris/MyBleTrainer
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

## website / server
* start your browser and enter "hostname:3000"
you can follow the Virtual Smart Trainer activity on a this website.

It will display the current power, rpm, speed

### you can use the server to:
* see current data from Tacx T1932
* see power calculation (simulation), grade (slope), Cw (aerodynamic drag coefficient)
* toggle socket messages
