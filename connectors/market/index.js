const exchange_raw = process.env.EXCHANGE.split('_');
const EXCHANGE = exchange_raw[0];
const EXEC_MODA = (exchange_raw.length > 1) ? exchange_raw[1] : 'MARKET';

const bfx = require('./bfx');
// const huobi = require('./huobi');
const binance = require('./binance');
const emulator = require('./emulator');
const market = (EXEC_MODA === 'MARKET' && EXCHANGE === 'BITFINEX') ? bfx
    : (EXEC_MODA === 'MARKET' && EXCHANGE === 'HUOBI') ? huobi
    : (EXEC_MODA === 'MARKET' && EXCHANGE === 'BINANCE') ? binance
    : (EXEC_MODA === 'EMULATOR') ? emulator
    : (EXEC_MODA === 'PNL') ? emulator
    : {};

module.exports = market;