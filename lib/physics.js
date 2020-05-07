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

var estimate_table = undefined
var g_windspeed = undefined
var g_crr = undefined
var g_cw = undefined

// /////////////////////////////////////////////////////////////////////////
// computePower
// /////////////////////////////////////////////////////////////////////////

exports.computePower = function(windspeed, grade, crr, cw, speed) {

  // h and area are already included in the cw value sent from ZWIFT or FULLGAZ
  var mass = config.physics.mass_rider  + config.physics.mass_bike              // mass in kg of the bike + rider
  //var h = 1.92                                                                // height in m of rider
  //var area = 0.0276 * Math.pow(h, 0.725) * Math.pow(mRider, 0.425) + 0.1647;  //  cross sectional area of the rider, bike and wheels

  if (grade > config.physics.max_grade) grade = config.physics.max_grade        // set to maximum gradient; means, no changes in resistance if gradient is greater than maximum

  var speedms = Number(speed * 1000 / 3600) + Number(windspeed) // speed in m/s
  if (speedms > config.physics.max_speedms) speedms = 0.0

  // Cycling Wattage Calculator - https://www.omnicalculator.com/sports/cycling-wattage
  var forceofgravity = g * Math.sin(Math.atan(grade / 100)) * mass
  var forcerollingresistance = g * Math.cos(Math.atan(grade / 100)) * mass * crr
  var forceaerodynamic = 0.5 * cw * p * Math.pow(speedms, 2)

  var simpower = (forceofgravity + forcerollingresistance + forceaerodynamic) * speedms / e

  return simpower
}

// /////////////////////////////////////////////////////////////////////////
// setPowerTable
// /////////////////////////////////////////////////////////////////////////
/*
exports.oldsetPowerTable = function( windspeed, crr, cw)  {
  if ((windspeed == g_windspeed) && (crr == g_crr) && (cw == g_cw) && (estimate_table != undefined)) {
    // no need to recompute the table
  } else {
    g_windspeed = windspeed
    g_crr = crr
    g_cw = cw
    estimate_table = []
    for (grade = -config.physics.max_grade; grade <= config.physics.max_grade; grade += 0.1) {
      var speed_array = []
      for (speed = 0; speed <= 120; speed += 0.1) {
          var power = this.estimatePower( windspeed, grade, crr, cw, speed )
          speed_array.push({ speed: speed.toFixed(1), power: power.toFixed(0)})
      }
      estimate_table.push({ grade: grade.toFixed(1), table: speed_array})
    }
  }
}
*/
// /////////////////////////////////////////////////////////////////////////
// estimateSpeed
// /////////////////////////////////////////////////////////////////////////

exports.estimateSpeed = function( is_simulation_mode, target) {
  var value = { speed: 0.0, power: 0}
  if (estimate_table) {
    if (is_simulation_mode) {
      var grade = Number(target).toFixed(1)
      var power = config.physics.avg_power.toFixed(0)
    } else {
      grade = Number(0.0)
      power = Number(target).toFixed(0)
    }
    var grade_arr = estimate_table.find( function(item) { item.grade == grade })
    if (grade_arr) {
      var closest = 1000
      var speed_array = grade_arr.find( function (item) {
        if (( power - item.power )**2 < closest**2 ) {
          closest = ((power - item.powest)**2)**0.5
        }
      })
      if (speed_array) {
        value.speed = speed_array.speed
        value.power = speed_array.power
      }
    }
  }
  return value
}

// /////////////////////////////////////////////////////////////////////////
// estimatePower
// /////////////////////////////////////////////////////////////////////////

exports.estimatePower = function( windspeed, grade, crr, cw, speed) {
  if ((windspeed == g_windspeed) && (crr == g_crr) && (cw == g_cw) && (estimate_table != undefined)) {
    // no need to recompute the table
  } else {
    g_windspeed = windspeed
    g_crr = crr
    g_cw = cw
    estimate_table = []
    for (grade = -config.physics.max_grade; grade <= config.physics.max_grade; grade += 0.1) {
      var speed_array = []
      for (speed = 0; speed <= 120; speed += 0.1) {
          var power = this.computePower( windspeed, grade, crr, cw, speed )
          speed_array.push({ speed: speed.toFixed(1), power: power.toFixed(0)})
      }
      estimate_table.push({ grade: grade.toFixed(1), table: speed_array})
    }
  }
  return config.physics.avg_power.toFixed(0)
}
