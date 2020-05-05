// trainerSIM is used to handle physical watt calculation for SIM mode
// the basis for this was found here:
// https://www.gribble.org/cycling/power_v_speed.html

const config = require('config-yml')
var DEBUG = config.physics.debug
var maxGrade = config.physics.max_grade

function trainerSIM () {
  this.physics = function (windspeedz, gradez, crrz, cwz, rpmd, speedd) {
    if (DEBUG) console.log('[trainerSIM.js] - physics calculation started')
    
    // ////////////////////////////////////////////////////////////////////////
    //  Rider variables !!! TBD - make a form to change these rider variables per webserver
    // ////////////////////////////////////////////////////////////////////////
    
    var mRider = config.physics.mass_rider // mass in kg of the rider
    var mBike = config.physics.mass_rider // mass in kg of the bike
    var mass = mBike + mRider // mass in kg of the bike + rider

    // already included in the cw value sent from ZWIFT or FULLGAZ
    // var h = 1.92 // hight in m of rider
    // var area = 0.0276 * Math.pow(h, 0.725) * Math.pow(mRider, 0.425) + 0.1647;  //  cross sectional area of the rider, bike and wheels
    
    // ////////////////////////////////////////////////////////////////////////
    // ZWIFT simulation variables
    // ////////////////////////////////////////////////////////////////////////

    if (gradez > maxGrade) { // check if gradient received is to high for realistic riding experience
      var grade = maxGrade // set to maximum gradient; means, no changes in resistance if gradient is greater than maximum
    } else {
      grade = gradez // gradiant in %
    }
    
    // var angle = Math.atan(grade*0.01); // gradient in ° // through testing and reevaluation of algorythm, it is not neccesarry to have this in force calculation
    // var radiant = angle * 0.005555556 * Math.PI; // gradient in radiant (rad)

    var crr = crrz // coefficient of rolling resistance 
    // the values sent from ZWIFT / FULLGAZ are crazy, specially FULLGAZ, when starting to decent, this drives up the wattage to above 600W
    
    var w = windspeedz * 1 // multiply with 1 to parse sting to float 
    // the values sent from ZWIFT / FULLGAZ are crazy
    
    var cd = cwz // coefficient of drag
    
    // ////////////////////////////////////////////////////////////////////////
    // DAUM values
    // ////////////////////////////////////////////////////////////////////////
    
    var v = speedd * 0.2778 // speed in m/s

    // ////////////////////////////////////////////////////////////////////////
    //  Constants
    // ////////////////////////////////////////////////////////////////////////
    
    var g = 9.8067 // acceleration in m/s^2 due to gravity
    var p = 1.225 // air density in kg/m^3 at 15°C at sea level
    var e = 0.97 // drive chain efficiency
    // var vw = Math.abs(v + w); // have to do this to avoid NaN in Math.pow()

    // ////////////////////////////////////////////////////////////////////////
    // Cycling Wattage Calculator
    // https://www.omnicalculator.com/sports/cycling-wattage
    // https://www.gribble.org/cycling/power_v_speed.html
    // ////////////////////////////////////////////////////////////////////////
    
    var forceofgravity = g * Math.sin(Math.atan(grade / 100)) * mass
    if (DEBUG) console.log('[trainerSIM.js] - forceofgravity: ', forceofgravity)

    var forcerollingresistance = g * Math.cos(Math.atan(grade / 100)) * mass * crr
    if (DEBUG) console.log('[trainerSIM.js] - forcerollingresistance: ', forcerollingresistance)
    
    var forceaerodynamic = 0.5 * cd * p * Math.pow(v + w, 2)
    if (DEBUG) console.log('[trainerSIM.js] - forceaerodynamic: ', forceaerodynamic)
    
    var simpower = (forceofgravity + forcerollingresistance + forceaerodynamic) * v / e
    if (DEBUG) console.log('[trainerSIM.js] - SIM calculated power: ', simpower)
    
    return simpower
  }
}
module.exports = trainerSIM