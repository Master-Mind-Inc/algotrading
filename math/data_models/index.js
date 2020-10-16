const exchange_raw = process.env.EXCHANGE.split('_');
const EXCHANGE = exchange_raw[0];
const EXEC_MODA = (exchange_raw.length > 1) ? exchange_raw[1] : 'MARKET';

const bfx_order = require('./bfx_order');
const binance_order = require('./binance_order');
const huobi_order = require('./huobi_order');
const order = (EXEC_MODA === 'MARKET' && EXCHANGE === 'BITFINEX') ? bfx_order
    : (EXEC_MODA === 'MARKET' && EXCHANGE === 'HUOBI') ? huobi_order
    : (EXEC_MODA === 'EMULATOR') ? binance_order
    : (EXEC_MODA === 'PNL') ? binance_order
    : null;

module.exports = {order};