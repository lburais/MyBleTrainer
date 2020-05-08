// ========================================================================
// logger.js
//
// logging stuff
//
// ========================================================================

const config = require('config-yml')
const { createLogger, format, transports } = require('winston')
const { combine, timestamp, colorize, label, printf } = format

const consoleFormat = printf(({ level, message, timestamp }) => {
  let e = new Error();
  let frame = e.stack.split("\n")[6];
  let functionName = frame.split(" ")[5];
  return `${timestamp} [${functionName}] ${level}: ${message}`;
});



var logger = createLogger({
  level: 'info',
  format: format.json(),
  //defaultMeta: { service: 'user-service' },
  transports: [
    //
    // - Write to all logs with level `info` and below to `combined.log`
    // - Write all logs error (and below) to `error.log`.
    //
    new transports.File({ filename: 'logs/datalog.log', level: 'data' }),
    new transports.File({ filename: 'logs/error.log', level: 'error' }),
    new transports.File({ filename: 'logs/combined.log' })
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
