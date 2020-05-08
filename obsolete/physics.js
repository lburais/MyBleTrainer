// ========================================================================
// physics.js
//
// estimate power and speed
// based on physics: https://www.gribble.org/cycling/power_v_speed.html
//
// ========================================================================

const config = require('config-yml')

// /////////////////////////////////////////////////////////////////////////
// computePower
// /////////////////////////////////////////////////////////////////////////

exports.computePower = function(windspeed, grade, crr, cw, speed) {

  const g = 9.8067 // acceleration in m/s^2 due to gravity
  const p = 1.225  // air density in kg/m^3 at 15°C at sea level
  const e = 0.97   // drive chain efficiency

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
