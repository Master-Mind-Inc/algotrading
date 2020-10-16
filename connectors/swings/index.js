const swings_bogdan = require('./bogdan');
const swings_mine = require('./mine');
const SWINGS_SOURCE = process.env.SWINGS_SOURCE || 'MARTIN';

const swings = (SWINGS_SOURCE === 'MARTIN') ? swings_mine : swings_bogdan = require('./bogdan');

module.exports = swings;