const request = require('request-promise');
const crypto = require('crypto');
const API_KEY = process.env.API_KEY;
const API_SEC = process.env.API_SEC;
const REST_AUTH_URL   =process.env.REST_AUTH_URL;

const math = require('../../math');
const db_logs = require('../db_logs');

function sleep(ms){
    return new Promise(resolve=>{
        setTimeout(resolve,ms)
    })
}

module.exports.wallets = async function() {
    // https://api.bitfinex.com/v2/auth/r/      wallets
    return await get_data('wallets', {});
}

module.exports.wallets_hist = async function(end, currency) {
    // https://api.bitfinex.com/v2/auth/r/      wallets/hist
    let body = {};
    if (end) body.end = end; else body.end = 'null';
    if (currency) body.currency = currency;
    return await get_data('wallets/hist', body);
}

module.exports.orders = async function(symbol) {
    // https://api.bitfinex.com/v2/auth/r/      orders/:Symbol
    return await get_data(`orders/t${symbol}`, {});
}

module.exports.order_trades = async function(pair, order) {
    // https://api.bitfinex.com/v2/auth/r/      order/Symbol:OrderId/trades
    return await get_data(`order/t${pair}:${order}/trades`, {});
}

module.exports.trades_hist = async function(pair, start, end, limit) {
    // https://api.bitfinex.com/v2/auth/r/      trades/Symbol/hist
    // let api_name = 'trades_hist';
    let body = {};
    if (start) body.start = start; else body.start = 'null';
    if (end) body.end = end; else body.end = 'null';
    if (limit) body.limit = limit;
    return await get_data(`trades/t${pair}/hist`, body);
}

module.exports.ledgers_hist = async function(currency, start, end, limit) {
    // https://api.bitfinex.com/v2/auth/r/      ledgers/Currency/hist
    let body = {};
    if (start) body.start = start; else body.start = 'null';
    if (end) body.end = end; else body.end = 'null';
    if (limit) body.limit = limit;
    return await get_data(`ledgers/${currency}/hist`, body);
}

module.exports.orders_hist = async function(pair, start, end, limit, sort) {
    // https://api.bitfinex.com/v2/auth/r/      orders/Symbol/hist
    let cmd = (pair.length > 0) ? `t${pair}/`: '';
    let body = {};
    if (start) body.start = start; else body.start = 'null';
    if (end) body.end = end; else body.end = 'null';
    if (limit) body.limit = limit;
    if (sort) body.sort = sort;
    
    return await get_data(`orders/${cmd}hist`, body);
}

module.exports.order_cancel = async function(pair, id, cid, ts) {
    // https://api.bitfinex.com/v2/auth/w/      order/cancel
    let [api_name, strt] = ['BFX.ORDER_CANCEL', Date.now()];

    let post_body = {id};

    let order = [null, null, null];
    let res_ = await get_data(`order/cancel`, post_body, 'w');
    if(res_.success){
        order[0] = math.data_models.order.cancelled(res_.result);
    }
    else {
        [order[1], order[2]] = await CheckOrderExists(pair, id, cid, ts);
    }

    await logging(strt, api_name, {pair, id, cid, ts, order});

    return order;

}

module.exports.order_status = async function(pair, id, cid, ts) {
    // https://api.bitfinex.com/v2/auth/w/      order/cancel
    let [api_name, strt] = ['BFX.ORDER_STATUS', Date.now()];

    let order = await CheckOrderExists(pair, id, cid, ts);
    await logging(strt, api_name, {pair, id, cid, ts, order});

    return order;
}

module.exports.order_submit = async function(pair, cid, type, price, coin) {
    // https://api.bitfinex.com/v2/auth/w/      order/submit
    let [api_name, strt] = ['BFX.ORDER_SUBMIT', Date.now()];

    let ts = Date.now() - 5000;
    let post_body = {
        cid:    cid,
        type:   type,
        symbol: `t${pair}`,
        price:  `${price}`,
        amount: `${coin}`
    };

    let order = [null, null, null];
    let res_ = await get_data(`order/submit`, post_body, 'w');
    if(res_.success){
        order[0] = math.data_models.order.submitted(res_.result);
    }
    else {
        [order[1], order[2]] = await CheckOrderExists(pair, null, cid, ts);
    }

    await logging(strt, api_name, {pair, cid, type, price, coin, order});
    return order;
}

async function logging(strt, api_name, log) {
    let fnt = Date.now();
    let dtlog = `${fnt} [${(new Date(fnt)).toISOString().replace(/T/g, ' ').substr(0, 19)}]\t[${fnt - strt}]\t`;
    console.log(`${dtlog} @ ${api_name}: ${JSON.stringify(log)}`);
    await db_logs.SetLogging(process.env.ORACLE_NAME, process.env.STRAT_ID, process.env.ACCOUNT_NAME, fnt, api_name, log);
}

async function CheckOrderExists(pair, id, cid, ts) {
    let order = [null, null];
    let [idx, field] = [(id) ? id : cid, (id) ? "id" : "cid"];
    let res_ = await get_data(`orders/t${pair}`, {});
    if (res_.success && res_.result.length > 0 && math.data_models.order.opened(res_.result).find((c, i) => c[field] === idx)) {
        order[0] = math.data_models.order.opened(res_.result).find((c, i) => c[field] === idx);
    }
    else {
        res_ = await get_data(`orders/t${pair}/hist`, { start: ts, end: 'null' });
        if (res_.success && res_.result.length > 0) {
            let ord = math.data_models.order.historical(res_.result).find((c, i) => c[field] === idx);
            if (ord)
                order[1] = ord;
        }
    }
    return order;
}

module.exports.margin_info = async function(key) {
    // https://api.bitfinex.com/v2/auth/r/      info/margin/key
    let cmd = (key === 'base') ? `${key}` : `t${key}`;
    return await get_data(`info/margin/${cmd}`, {});
}

module.exports.positions = async function() {
    // https://api.bitfinex.com/v2/auth/r/      positions
    return await get_data(`positions`, {});
}

module.exports.positions_hist = async function(start, end, limit) {
    // https://api.bitfinex.com/v2/auth/r/      positions/hist
    let body = {};
    if (start) body.start = start; else body.start = 'null';
    if (end) body.end = end; else body.end = 'null';
    if (limit) body.limit = limit;
    
    return await get_data(`positions/hist`, body);
}

module.exports.order_submit_ex = async function(body) {
    // https://api.bitfinex.com/v2/auth/w/      order/submit

    let post_body = {
        cid:    body.cid,
        type:   body.type,
        symbol: `t${body.pair}`,
        price:  `${body.price}`,
        amount: `${body.amount}`
    };

    return await get_data(`order/submit`, post_body, 'w');
}


async function get_data(api, body, rw) {
    let type = rw || 'r';
    const apiPath = `v2/auth/${type}/${api}`;
    const nonce = Date.now() * 1000;
    let res = {success: false, error: "", result: {}};

    let signature = `/api/${apiPath}${nonce}${JSON.stringify(body)}`;
    const sig = crypto.createHmac('sha384', API_SEC).update(signature);
    const shex = sig.digest('hex');
    const options = {
        method: 'POST',
        url: `${REST_AUTH_URL}/${apiPath}`,
        headers: {
            'bfx-nonce': nonce,
            'bfx-apikey': API_KEY,
            'bfx-signature': shex
        },
        body: body,
        json: true
    };
    await request(options).then(body => {
        res.success = true;
        res.result = body;
    })
    .catch(err => {
        res.error = err.message;
        // console.log(`post_order: ${err.message} ${JSON.stringify(err)}`);
        console.log(`post_order: ${err.message}`);
    });

    return res;
}

