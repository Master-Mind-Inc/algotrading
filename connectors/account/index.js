const exchange_raw = process.env.EXCHANGE.split('_');
const EXEC_MODA = (exchange_raw.length > 1) ? exchange_raw[1] : 'MARKET';
const INTERNAL_RISK_MANAGER = +(process.env.INTERNAL_RISK_MANAGER || '');

const account_request = require('./account_request');
const stub = require('./stub');
const stub_pnl = require('./stub_pnl');
const account = (INTERNAL_RISK_MANAGER === 0) ? account_request : (EXEC_MODA === 'PNL') ? stub_pnl : stub;

module.exports = account;