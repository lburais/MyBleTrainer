// ========================================================================
// message.js
//
// logging stuff
//
// ========================================================================

const logger = require('./logger')
var util = require('util');
const path = require('path')

const STACK_FRAME_RE = new RegExp(/at ((\S+)\s)?\(?([^:]+):(\d+):(\d+)/)
const THIS_FILE = __filename.split('/')[__filename.split('/').length - 1]

function _getCaller() {
   var err = new Error()
   Error.captureStackTrace(err)

   // Throw away the first line of the trace
   var frames = err.stack.split('\n').slice(1)

   // Find the first line in the stack that doesn't name this module.
   var callerInfo = null;
   for (var i = 0; i < frames.length; i++) {
     if (frames[i].indexOf(THIS_FILE) === -1) {
       callerInfo = STACK_FRAME_RE.exec(frames[i])
       break
     }
   }

   if (callerInfo) {
     return {
       function: callerInfo[2] || null,
       module: callerInfo[3] || null,
       line: callerInfo[4] || null,
       column: callerInfo[5] || null
     }
   }
   return null
 }

function message ( content, level = 'info') {

  var level = (typeof level !== 'undefined') ? level : 'info';
  var caller = _getCaller()
  if (level == 'error') var content = caller.line + ' ' + content
  logger.log(level, content, {module: path.win32.basename(caller.module).replace('.js', '')} )
}

module.exports = message
