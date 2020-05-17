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

const consoleFormat = printf(info => {
  if (info.moduleName == undefined)
    return `${moment(info.timestamp).format('YYYY-MM-DD HH:mm:ss.SSS')} ${info.level.padStart(10, ' ')}: ${info.message}`;
  else
    return `${moment(info.timestamp).format('YYYY-MM-DD HH:mm:ss.SSS')} [${path.win32.basename(info.moduleName).padStart(15, ' ')}] ${info.level.padStart(10, ' ')}: ${info.message}`;
});

const date = new Date()
const filename = "logs/logger_" +
               date.getFullYear().toString().padStart(4, '0') + date.getMonth().toString().padStart(2, '0') + date.getDate().toString().padStart(2, '0') +
               "_" +
               date.getHours().toString().padStart(2, '0') + date.getMinutes().toString().padStart(2, '0') +  date.getSeconds().toString().padStart(2, '0') +
               ".txt"


var logger = createLogger({
  level: 'debug',
  format: format.json(),
  transports: [
    //
    // - Write to all logs with level `info` and below to `combined.log`
    // - Write all logs error (and below) to `error.log`.
    //
    new transports.File({ filename: 'logs/datalog.log', level: 'data' }),
    new transports.File({ filename: 'logs/error.log', level: 'error' }),
    new transports.File({
      filename: filename,
      format: combine(
                timestamp(),
                consoleFormat )})
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
