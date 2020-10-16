'use strict';

const router = require('express').Router();
const controllers = require('./../controllers');

/* POST */
// router.post('/', root_controller.init);
/* GET API's home page. */
router.get('/', controllers.root);
router.get('/favicon.ico', controllers.ico);

/* POST */
// router.post('/init', cmd_controller.init);          // Load Market ticks and Oracle logs

/* GET WALLETS */
router.get('/wallets', controllers.wallets.wallets);
router.get('/wallets/hist', controllers.wallets.wallets_hist);

/* GET ORDERS */
router.get('/orders', controllers.orders.orders_ex);
router.get('/orders/hist', controllers.orders.orders_hist_ex);
router.get('/order/trades', controllers.orders.order_trades);
router.get('/trades/hist', controllers.orders.trades_hist);
router.get('/ledgers/hist', controllers.orders.ledgers_hist);

/* POST ORDER */

router.post('/order/submit', controllers.orders.order_submit_ex);

/* GET POSITIONS */
router.get('/positions', controllers.positions.positions);
router.get('/positions/hist', controllers.positions.positions_hist);
router.get('/margin/base', controllers.positions.margin_base);
router.get('/margin/info', controllers.positions.margin_info);

/* GET CMDs */
router.get('/cmd/orders/hist', controllers.cmd.orders_hist);
router.get('/cmd/transactions/hist', controllers.cmd.transactions_hist);
router.get('/cmd/state', controllers.cmd.state);

router.post('/cmd/order/cancel', controllers.cmd.order_cancel);
router.post('/cmd/order/submit', controllers.cmd.order_submit);
router.post('/cmd/order/status', controllers.cmd.order_status);

router.get('/hardstop', controllers.cmd.hard_stop);
router.get('/stop', controllers.cmd.stop);
router.get('/pause', controllers.cmd.pause);
router.get('/resume', controllers.cmd.resume);

// router.post('/cmd/logs', controllers.cmd.logs);
router.post('/logs', controllers.cmd.logs);
router.get('/logs', controllers.cmd.logs_light);

router.get('/batch', controllers.cmd.batch);
router.get('/init', controllers.cmd.init);
router.get('/ready4logs', controllers.cmd.ready_for_logs);
router.get('/last_got_log', controllers.cmd.last_got_log);
router.get('/ready4pnls', controllers.cmd.ready_for_pnls);
router.get('/in_progress', controllers.cmd.in_progress);

router.post('/pnl', controllers.cmd.pnl);
router.post('/swing_pnl', controllers.cmd.swing_pnl);
router.get('/pnl', controllers.cmd.pnl_ex);
router.get('/pnl_result', controllers.cmd.pnl_result);

router.get('/env', controllers.cmd.env);

module.exports = router;