const db_market = require('./db_market');
const db_logs = require('./db_logs');
const bfx = require('./market/bfx');
const market = require('./market');
const err = require('./err_requests');
const account = require('./account');
const slack = require('./slack');
const slack_logs = require('./slack_logs');
const telega = require('./telega');
const self = require('./self_requests');
const close_command = require('./close_command');
const swings = require('./swings');
const deal_finished = require('./deal_finished');

module.exports = {db_market, db_logs, market, bfx, err, account, slack, slack_logs, telega, self, close_command, swings, deal_finished};