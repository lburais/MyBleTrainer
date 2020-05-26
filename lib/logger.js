// ========================================================================
// logger.js
//
// logging stuff
//
// ========================================================================

const config = require('config-yml')
const { createLogger, format, transports } = require('winston')
const { combine, timestamp, colorize, label, printf } = format
const moment = require('moment')
const path = require('path')
const socket = require('winston-socket.io');

const consoleFormat = printf(info => {
  var level = (typeof info.level !== 'undefined') ? info.level : 'info';
  var moduleName = (typeof info.module !== 'undefined') ? info.module : '???';
  level += ':'
  var line = `${moment(info.timestamp).format('YYYY-MM-DD HH:mm:ss.SSS')} `
  line += ` [${moduleName.padEnd(22, ' ')}] ${info.level.padEnd(8, ' ')} `
  if (typeof info.message == 'object') line += `${info.message.msg}`
  else line += `${info.message}`
  return line
});

const socketFormat = format(info => {
  var level = (typeof info.level !== 'undefined') ? info.level : 'info';
  var moduleName = (typeof info.module !== 'undefined') ? info.module : '???';
  info.message = {level: level, module: moduleName, msg: info.message}
  return info
});

const date = new Date()
const filename = "logs/logger_" +
date.getFullYear().toString().padStart(4, '0') + date.getMonth().toString().padStart(2, '0') + date.getDate().toString().padStart(2, '0') +
"_" +
date.getHours().toString().padStart(2, '0') + date.getMinutes().toString().padStart(2, '0') +  date.getSeconds().toString().padStart(2, '0') +
".txt"


var logger = createLogger({
  level: 'debug',
  format: format.combine( socketFormat(), format.json() ),
  transports: [
    new transports.File({ filename: 'logs/datalog.log', level: 'data' }),
    new transports.File({ filename: 'logs/error.log', level: 'error' }),
    new transports.File({ filename: filename, format: combine( timestamp(), consoleFormat )}),
    new transports.SocketIO({ reconnect: true, level: 'debug' })
  ],
  exitOnError: false
})

//
// If we're not in production then log to the `console` with the format:
// `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
//
if (process.env.NODE_ENV !== 'production') {
  logger.add(new transports.Console({
    format: combine(
      colorize(),
      timestamp(),
      consoleFormat
    )
  }))
}


module.exports = logger
