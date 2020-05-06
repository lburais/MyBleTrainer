// ========================================================================
// physics.js
//
// estimate power and speed
// based on physics: https://www.gribble.org/cycling/power_v_speed.html
//
// ========================================================================

const config = require('config-yml')

const g = 9.8067 // acceleration in m/s^2 due to gravity
const p = 1.225  // air density in kg/m^3 at 15°C at sea level
const e = 0.97   // drive chain efficiency

var power_for_speed_and_grade = undefined
var g_windspeed = undefined
var g_crr = undefined
var g_cw = undefined

// /////////////////////////////////////////////////////////////////////////
// setPowerTable
// /////////////////////////////////////////////////////////////////////////

function setPowerTable( windspeed, crr, cw)  {
//var setPowerTable = function( windspeed, crr, cw ) {

  if ((windspeed == g_windspeed) && (crr == g_crr) && (cw == g_cw) && (power_for_speed_and_grade != undefined)) {
    // no need to recompute the table
  } else {
    g_windspeed = windspeed
    g_crr = crr
    g_cw = cw
    power_for_speed_and_grade = []
    for (grade = 0.0; grade <= config.physics.max_grade; grade += 0.1) {
      var speed_array = []
      for (speed = 0; speed <= 120; speed += 0.1) {
          power = estimatePower( windspeed, grade, crr, cw, speed )
          speed_array.push({ speed: speed, power: power})
      }
      power_for_speed_and_grade.push({ grade: grade, table: speed_array})
    }
  }
}

// /////////////////////////////////////////////////////////////////////////
// estimatePower
// /////////////////////////////////////////////////////////////////////////

var estimatePower = function(windspeed, grade, crr, cw, speed) {

  // h and area are already included in the cw value sent from ZWIFT or FULLGAZ
  var mass = config.physics.mass_rider  + config.physics.mass_bike            // mass in kg of the bike + rider
  var h = 1.92                                                                // height in m of rider
  var area = 0.0276 * Math.pow(h, 0.725) * Math.pow(mRider, 0.425) + 0.1647;  //  cross sectional area of the rider, bike and wheels

  if (grade > config.physics.max_grade) grade = config.physics.max_grade       // set to maximum gradient; means, no changes in resistance if gradient is greater than maximum
        
  var speedms = global.speed * 0.2778 // speed in m/s
  if (speedms > config.physics.max_speedms) speedms = 0

  // Cycling Wattage Calculator - https://www.omnicalculator.com/sports/cycling-wattage
  var forceofgravity = g * Math.sin(Math.atan(grade / 100)) * mass        
  var forcerollingresistance = g * Math.cos(Math.atan(grade / 100)) * mass * crr
  var forceaerodynamic = 0.5 * cw * p * Math.pow(speedms + windspeed, 2)
  var simpower = (forceofgravity + forcerollingresistance + forceaerodynamic) * speedms / e

  return simpower
}

// /////////////////////////////////////////////////////////////////////////
// estimateSpeed
// /////////////////////////////////////////////////////////////////////////

var estimateSpeed = function(windspeed, grade, crr, cw, power) {
  return 20
}