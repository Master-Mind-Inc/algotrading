const TQ = require('./close_command_tq');
const quant = require('./close_command_quant');
const extr = require('./ext_close_command');
const intr = require('./int_close_command');
const prev = require('./pdv_close_command');
const trln = require('./trailing_close_command');
const stub = require('./stub');

module.exports = {EXTERNAL: extr, INTERNAL: intr, PREVISION: prev, TRAILING: trln, QUANT: quant, regular: stub, TQ};