const request = require('request-promise');

const external_err_logging = require('../err_requests');
const secret = require('../secret');

const API_KEY = secret.Decrypt(process.env.API_KEY);
const API_SEC = secret.Decrypt(process.env.API_SEC);
const FUTURES = +(process.env.FUTURES || '');
const REST_AUTH_URL = (FUTURES) ? process.env.REST_AUTH_URL_F : process.env.REST_AUTH_URL;
const DEBUG = +(process.env.DEBUG || '');
const PRECISION = (FUTURES) ? 3 : 4;
const PRICE_INDENT_ENABLE = +(process.env.PRICE_INDENT_ENABLE || '');
const BASE = process.env.BASE;
const QUOTE = process.env.QUOTE;

const ORACLE = `${process.env.ORACLE_NAME}_${process.env.STRAT_ID}`;

const V1 = (FUTURES) ? '/fapi/v1' : '/sapi/v1/margin';
const V3 = (FUTURES) ? '/fapi/v1' : '/api/v3';

const math = require('../../math');
const db_logs = require('../db_logs');

function sleep(ms){
    return new Promise(resolve=>{
        setTimeout(resolve,ms)
    })
}

function decimalAdjust(value, e) {
    let exp = e || 10;
    return Math.round(value * Math.pow(10, exp)) / Math.pow(10, exp);
}

function cid_to_ClientOrderId(cid){
    let str_cid = `000000000${cid}`.split("").reverse().join("").substring(0, 9).split("").reverse().join("");
    return `${ORACLE}_${str_cid}`.replace(/_/g, 'x');
}
function cid_from_ClientOrderId(str_cid){
    return +(str_cid.split("").reverse().join("").substring(0, 9).split("").reverse().join(""));
}

function indend_price (type, assets, avg_last_5m_coins) {
    let price = 0;
    let cum_coin = 0;
    for (let i = 0; i < assets.length; i++) {
        const asset = assets[i];
        cum_coin += asset.coin;
        if (cum_coin > avg_last_5m_coins) {
            price = asset.price + type*0.01;
            break;
        }
    }
    if (assets.length > 0 && !price) price = assets[assets.length-1].price + type*0.01;

    return price;
}

async function Order_CoinPrice(ord){
    let [api_name, strt] = ['BINANCE.MARGIN_PRICE', Date.now()];
    if (PRICE_INDENT_ENABLE === 1 && !ord.isGasket) {
        const books = await book();
        const avg_coin = await avg_last_5m_coins();
        let assets = (ord.type === 1) ? books.bids : books.asks;
    
        let idn_price = indend_price(ord.type, assets, avg_coin);
        await logging(strt, api_name, {type: ord.type, books, avg_coin, idn_price});
        if (idn_price) {
            ord.price = idn_price;
            ord.mm = {books, avg_coin, idn_price};
        }
    }
    else {
        if (!ord.isGasket) {
            let last_prc = await last_price();
            if (last_prc) ord.price = last_prc;
        }
        ord.price *= (1 + ord.type * +global.env_total.PRICE_GASKET);
    }
    let marginal_price = ord.original_price * (1 + ord.type * global.env_total.PRICE_MARGINAL_GASKET);
    if (ord.type * marginal_price >= ord.type * ord.price) ord.price = decimalAdjust(ord.price, 2);
    else {
        ord.price = decimalAdjust(marginal_price, 2);
        await logging(strt, api_name, {marginal_price, price: ord.price});
    }
    let coin = decimalAdjust(ord.origin_money/ord.price, PRECISION);
    ord.coin = Math.round(coin*global.env_total.BASE_SATOSHI);
    return coin;
}

module.exports.order_hist = async function(startTime, endTime) {
    // GET /fapi/v1/allOrders (HMAC SHA256)
    let ts_delta = (await server_time()) - Date.now();
    let orders = [];
    let res_ = await get_data(V1, `allOrders`, `symbol=${BASE}${QUOTE}&startTime=${startTime}&endTime=${endTime}&timestamp=${Date.now()+ts_delta}`, true);
    if (res_.success) {
        orders = res_.result;
    }
    return orders;
}

module.exports.order_cancel = async function(ord) {
    // Delete /sapi/v1/margin/order
    let [api_name, strt] = ['BINANCE.ORDER_CANCEL', Date.now()];

    let ts_delta = (await server_time()) - Date.now();

    let query = `symbol=${BASE}${QUOTE}&recvWindow=60000&orderId=${ord.id}&timestamp=${Date.now()+ts_delta}`;
    let order = null;

    await delete_data(V1, `order`, query, true);
    await sleep(1000);

    let orderOpenedYet = true;
    while(orderOpenedYet){
        orderOpenedYet = (await CheckOrderOpened(ord.id, ts_delta)).length !== 0;
        if (!orderOpenedYet) break;
        await logging(strt, api_name, {orderOpenedYet});
        await sleep(1000);
    }
    order = await CheckOrderExists(ord.id, null, ts_delta);

    await logging(strt, api_name, order);
    return order;
}


module.exports.hard_stop = async function() {
    // DELETE /sapi/v1/margin/order
    // DELETE /fapi/v1/allOpenOrders
    let [api_name, strt] = ['BINANCE.ALL_ORDER_CANCEL', Date.now()];

    let ts_delta = (await server_time()) - Date.now();
    let query = '';
    let orderOpenedYet = true;
    let res_ = {success: false, error: "", result: {}};

    if (FUTURES === 1) {
        orderOpenedYet = true;
        query = `symbol=${BASE}${QUOTE}&recvWindow=60000&timestamp=${Date.now()+ts_delta}`;
        res_ = await delete_data(V1, `allOpenOrders`, query, true);
        while(orderOpenedYet){
            orderOpenedYet = (await CheckOrderOpened(null, ts_delta)).length !== 0;
        }
    }
    else {
        query = `symbol=${BASE}${QUOTE}&recvWindow=60000&orderId=${ord.id}&timestamp=${Date.now()+ts_delta}`;
    }

    let query = `symbol=${BASE}${QUOTE}&recvWindow=60000&orderId=${ord.id}&timestamp=${Date.now()+ts_delta}`;
    let order = null;

    await delete_data(V1, `order`, query, true);

    let orderOpenedYet = true;
    while(orderOpenedYet){
        orderOpenedYet = (await CheckOrderOpened(ord.id, ts_delta)).length !== 0;
    }
    order = await CheckOrderExists(ord.id, null, ts_delta);

    await logging(strt, api_name, order);
    return order;
}


// Get  /sapi/v1/margin/myTrades

module.exports.order_status = async function(ord) {
    // GET  /sapi/v1/margin/   order
    let [api_name, strt] = ['BINANCE.ORDER_STATUS', Date.now()];

    let ts_delta = (await server_time()) - Date.now();
    let order = await CheckOrderExists(ord.id, ord.cid, ts_delta);
    let sub_order = null;
    if (order && cid_from_ClientOrderId(order.clientOrderId) === ord.cid) {
        let trades = await CheckOrderTraded(ord.id, order.time, ts_delta);
        let bnb_price = (trades.length > 0) ? await db_logs.GetLastBNB() : +(process.env.BNB_PRICE || '15.0');
        // let bnb_price = await db_logs.GetLastBNB();
        sub_order = math.data_models.order.historical(order, trades, bnb_price);

        math.data_models.order.fix_lag(sub_order);

        sub_order.cid = ord.cid;
        await logging(strt, api_name, {order, sub_order});
    }
    else {
        console.log(`order CID ${ord.cid} is INKNOWN`);
    }

    return sub_order;
}

module.exports.order_submit = async function(ord) {
    // Post  /sapi/v1/margin/   order
    let [api_name, strt] = ['BINANCE.ORDER_SUBMIT', Date.now()];
    let ts_delta = (await server_time()) - Date.now();
    let res_ = {success:false};
    let order = await CheckOrderExists(null, ord.cid, ts_delta);
    if (order && order.status !== 'REJECTED') {
        let sub_order = math.data_models.order.submitted(order);
        ord.ts = sub_order.ts;
        ord.id = sub_order.id;
    }
    else {
        let query = `symbol=${BASE}${QUOTE}&recvWindow=60000&newClientOrderId=${cid_to_ClientOrderId(ord.cid)}&timeInForce=GTC&newOrderRespType=FULL`;
        let coin = await Order_CoinPrice(ord);

        if (ord.type === 1){
            query += `&price=${ord.price}&quantity=${coin}&side=BUY&type=LIMIT&timestamp=${Date.now()+ts_delta}`;
            res_ = await post_data(V1, `order`, query);
            if (!res_.success) {
                ord.attemptions++;
                order = null;
            }
        }
        else {
            if (FUTURES || (await loan(ord, coin, ts_delta)) !== -1) {
                query += `&price=${ord.price}&quantity=${coin}&side=SELL&type=LIMIT&timestamp=${Date.now()+ts_delta}`;
                res_ = await post_data(V1, `order`, query);
                if (!res_.success) {
                    ord.attemptions++;
                    order = null;
                }
            }
            else {
                ord.attemptions++;
                order = null;
            }
        }
        let id = (res_.success) ? res_.result.orderId : null;
        order = await CheckOrderExists(id, ord.cid, ts_delta);

        if (order && cid_from_ClientOrderId(order.clientOrderId) === ord.cid && order.status !== 'REJECTED') {
            let sub_order = math.data_models.order.submitted(order);
            ord.ts = sub_order.ts;
            ord.id = sub_order.id;
        }
        else {
            ord.attemptions++;
            order = null;
        }
    }

    await logging(strt, api_name, order);
    return order;
}

module.exports.pos_submit = async function(ord) {
    // Post  /sapi/v1/margin/   order
    let [api_name, strt] = ['BINANCE.POS_SUBMIT', Date.now()];
    let ts_delta = (await server_time()) - Date.now();
    let res_ = null;
    let order = await CheckOrderExists(null, ord.cid, ts_delta);
    if (order && order.status !== 'REJECTED') {
        let sub_order = math.data_models.order.submitted(order);
        ord.ts = sub_order.ts;
        ord.id = sub_order.id;
    }
    else {
        let query = `symbol=${BASE}${QUOTE}&recvWindow=60000&newClientOrderId=${cid_to_ClientOrderId(ord.cid)}`;
        let coin = decimalAdjust(ord.coin_to_close/global.env_total.BASE_SATOSHI, PRECISION);
        let side = (ord.type === 1) ? 'SELL': 'BUY';

        query += `&quantity=${coin}&side=${side}&type=MARKET&timestamp=${Date.now()+ts_delta}`;
        res_ = await post_data(V1, `order`, query);

        let id = (res_.success) ? res_.result.orderId : null;
        order = await CheckOrderExists(id, ord.cid, ts_delta);

        if (order && cid_from_ClientOrderId(order.clientOrderId) === ord.cid && order.status !== 'REJECTED') {
            let orderOpenedYet = true;
            while(orderOpenedYet){
                let orders = await CheckOrderOpened(order.orderId, ts_delta);
                if (DEBUG === 1) console.log(`DEBUG: POS WHILE orders: ${JSON.stringify(orders)}`);
                orderOpenedYet = orders.length !== 0;
            }
            order = await CheckOrderExists(id, ord.cid, ts_delta);
            let sub_order = math.data_models.order.submitted(order);
            ord.ts = sub_order.ts;
            ord.id = sub_order.id;
        }
        else order = null;
    }

    await logging(strt, api_name, order);
    return order;
}

module.exports.tp_submit = async function(ord) {
    // Post  /sapi/v1/margin/   order
    let [api_name, strt] = ['BINANCE.TP_SUBMIT', Date.now()];
    let ts_delta = (await server_time()) - Date.now();
    let res_ = {success:false};
    let order = await CheckOrderExists(null, ord.tpsl.tp.cid, ts_delta);
    if (order && order.status !== 'REJECTED') {
        let sub_order = math.data_models.order.submitted(order);
        ord.tpsl.tp.ts = sub_order.ts;
        ord.tpsl.tp.id = sub_order.id;
    }
    else {
        let query = `symbol=${BASE}${QUOTE}&recvWindow=60000&newClientOrderId=${cid_to_ClientOrderId(ord.tpsl.tp.cid)}&timeInForce=GTC&newOrderRespType=FULL`;
        let coin = decimalAdjust(ord.tpsl.tp.coin/global.env_total.BASE_SATOSHI, PRECISION);
        ord.tpsl.tp.coin = Math.round(coin*global.env_total.BASE_SATOSHI);

        if (ord.type === 1){
            if (FUTURES || (await loan(ord, coin, ts_delta)) !== -1) {
                query += `&price=${ord.tpsl.tp.price}&quantity=${coin}&side=SELL&type=LIMIT&timestamp=${Date.now()+ts_delta}`;
                res_ = await post_data(V1, `order`, query);
                if (!res_.success) {
                    ord.tpsl.tp.attemptions++;
                    order = null;
                }
            }
            else {
                ord.tpsl.tp.attemptions++;
                order = null;
            }
        }
        else {
            query += `&price=${ord.tpsl.tp.price}&quantity=${coin}&side=BUY&type=LIMIT&timestamp=${Date.now()+ts_delta}`;
            res_ = await post_data(V1, `order`, query);
            if (!res_.success) {
                ord.tpsl.tp.attemptions++;
                order = null;
            }
        }
        
        let id = (res_.success) ? res_.result.orderId : null;
        order = await CheckOrderExists(id, ord.tpsl.tp.cid, ts_delta);

        if (order && cid_from_ClientOrderId(order.clientOrderId) === ord.tpsl.tp.cid && order.status !== 'REJECTED') {
            let sub_order = math.data_models.order.submitted(order);
            ord.tpsl.tp.ts = sub_order.ts;
            ord.tpsl.tp.id = sub_order.id;
        }
        else order = null;
    }

    await logging(strt, api_name, order);
    return order;
}

module.exports.sl_submit = async function(ord) {
    // Post  /sapi/v1/margin/   order
    let [api_name, strt] = ['BINANCE.SL_SUBMIT', Date.now()];
    let ts_delta = (await server_time()) - Date.now();
    let res_ = {success:false};
    let order = await CheckOrderExists(null, ord.tpsl.sl.cid, ts_delta);
    if (order && order.status !== 'REJECTED') {
        let sub_order = math.data_models.order.submitted(order);
        ord.tpsl.sl.ts = sub_order.ts;
        ord.tpsl.sl.id = sub_order.id;
    }
    else {
        const order_type = (FUTURES) ? 'STOP' : 'STOP_LOSS_LIMIT';
        let query = `symbol=${BASE}${QUOTE}&recvWindow=60000&newClientOrderId=${cid_to_ClientOrderId(ord.tpsl.sl.cid)}&timeInForce=GTC&newOrderRespType=FULL`;
        let coin = decimalAdjust(ord.tpsl.sl.coin/global.env_total.BASE_SATOSHI, PRECISION);
        ord.tpsl.sl.coin = Math.round(coin*global.env_total.BASE_SATOSHI);
        let price = decimalAdjust(ord.tpsl.sl.price*((ord.type === 1) ? 0.96 : 1.04), 2);
        let side =(ord.type === 1) ? 'SELL': 'BUY';

        query += `&stopPrice=${ord.tpsl.sl.price}&price=${price}&quantity=${coin}&side=${side}&type=${order_type}&timestamp=${Date.now()+ts_delta}`;
        res_ = await post_data(V1, `order`, query);

        let id = null;
        if (res_.success) id = res_.result.orderId;
        else if (res_.error.code === -2010){
            query = `symbol=${BASE}${QUOTE}&recvWindow=60000&newClientOrderId=${cid_to_ClientOrderId(ord.tpsl.sl.cid)}`;
            let side = (ord.type === 1) ? 'SELL': 'BUY';
    
            query += `&quantity=${coin}&side=${side}&type=MARKET&timestamp=${Date.now()+ts_delta}`;
            res_ = await post_data(V1, `order`, query);
    
            id = (res_.success) ? res_.result.orderId : null;
            order = await CheckOrderExists(id, ord.tpsl.sl.cid, ts_delta);
    
            if (order && cid_from_ClientOrderId(order.clientOrderId) === ord.tpsl.sl.cid && order.status !== 'REJECTED') {
                let sub_order = math.data_models.order.submitted(order);
                ord.tpsl.sl.ts = sub_order.ts;
                ord.tpsl.sl.id = sub_order.id;
            }
            else order = null;
        }
        // await logging(strt, api_name, res_.result);
        order = await CheckOrderExists(id, ord.tpsl.sl.cid, ts_delta);

        if (order && cid_from_ClientOrderId(order.clientOrderId) === ord.tpsl.sl.cid && order.status !== 'REJECTED') {
            let sub_order = math.data_models.order.submitted(order);
            ord.tpsl.sl.ts = sub_order.ts;
            ord.tpsl.sl.id = sub_order.id;
        }
        else order = null;
    }

    await logging(strt, api_name, order);
    return order;
}

async function CheckOrderExists(id, cid, ts_delta) {
    let order = null;
    let [idx, field] = (id) ? [`${id}`, 'orderId'] : [cid_to_ClientOrderId(cid), 'origClientOrderId'];
    if (ts_delta === undefined) ts_delta = (await server_time()) - Date.now();

    let res_ = await get_data(V1, `order`, `symbol=${BASE}${QUOTE}&${field}=${idx}&timestamp=${Date.now()+ts_delta}`, true);
    if (res_.success) {
        order = res_.result;
    }
    return order;
}

async function CheckOrderOpened(id, ts_delta) {
    // Get  /sapi/v1/margin/openOrders
    let orders = [];
    if (ts_delta === undefined) ts_delta = (await server_time()) - Date.now();

    let res_ = await get_data(V1, `openOrders`, `symbol=${BASE}${QUOTE}&timestamp=${Date.now()+ts_delta}`);
    if (res_.success) {
        if (id) orders = res_.result.filter(c => c.orderId === id);
        else orders = res_.result;
    }
    return orders;
}

async function CheckOrderTraded(id, ts, ts_delta) {
    // Get  /sapi/v1/margin/myTrades
    // Get  /fapi/v1/userTrades
    const api = (FUTURES) ? 'userTrades' : 'myTrades';

    let orders = [];
    if (ts_delta === undefined) ts_delta = (await server_time()) - Date.now();

    let res_ = await get_data(V1, api, `symbol=${BASE}${QUOTE}&startTime=${ts}&timestamp=${Date.now()+ts_delta}`);
    if (res_.success) {
        orders = res_.result.filter(c => c.orderId === id);
    }
    return orders;
}

async function book () {
    // GET https://fapi.binance.com/fapi/v1/    depth?symbol=BTCUSDT&limit=5
    let [api_name, strt] = ['BINANCE.BOOK', Date.now()];

    let query = `symbol=${BASE}${QUOTE}&limit=10`;
    let book = {asks: [], bids:[]};

    let attemptions = 0;
    while (attemptions < 3) {
        let res_ = await get_data_public(V3, `depth`, query);
        if (res_.success) {
            book = math.data_models.order.book(res_.result);
            break;
        }
        await sleep(500);
        attemptions++;
    }

    // logging(strt, api_name, {price});

    return book;
}

async function avg_last_5m_coins () {
    // GET https://fapi.binance.com/fapi/v1/    depth?symbol=BTCUSDT&limit=5
    let [api_name, strt] = ['BINANCE.CANDLE', Date.now()];

    let query = `symbol=${BASE}${QUOTE}&interval=1m&limit=6`;
    let coin = 0;

    let attemptions = 0;
    while (attemptions < 3) {
        let res_ = await get_data_public(V3, `klines`, query);
        if (res_.success) {
            coin = math.data_models.order.avg_last_5m_coins(res_.result);
            break;
        }
        await sleep(500);
        attemptions++;
    }

    // logging(strt, api_name, {price});

    return coin;
}

async function last_day_hl () {
    // GET https://fapi.binance.com/fapi/v1/    depth?symbol=BTCUSDT&limit=5
    let [api_name, strt] = ['BINANCE.GRAY', Date.now()];

    let query = `symbol=${BASE}${QUOTE}&interval=1h&limit=25`;
    let hl = [0, Number.MAX_VALUE];

    let attemptions = 0;
    while (attemptions < 3) {
        let res_ = await get_data_public(V3, `klines`, query);
        if (res_.success) {
            hl = math.data_models.order.last_day_hl(res_.result);
            break;
        }
        await sleep(500);
        attemptions++;
    }

    // logging(strt, api_name, {price});

    return hl;
}

async function last_oc (granule) {
    // GET https://fapi.binance.com/fapi/v1/    depth?symbol=BTCUSDT&limit=5
    let [api_name, strt] = ['BINANCE.GRAY', Date.now()];
    let interval =
        (granule <= 60) ? '1m' : (granule <= 180) ? '3m' : (granule <= 300) ? '5m' :
        (granule <= 900) ? '15m' : (granule <= 1800) ? '30m' : (granule <= 3600) ? '1h' :
        (granule <= 7200) ? '2h' : (granule <= 14400) ? '4h' : (granule <= 21600) ? '6h' :
        (granule <= 28800) ? '8h' : (granule <= 43200) ? '12h' : (granule <= 86400) ? '1d' :
        (granule <= 259200) ? '3d' : (granule <= 604800) ? '1w' : '1M';

    let query = `symbol=${BASE}${QUOTE}&interval=${interval}&limit=1`;
    let oc = [0, 0];

    let attemptions = 0;
    while (attemptions < 3) {
        let res_ = await get_data_public(V3, `klines`, query);
        if (res_.success) {
            oc = math.data_models.order.last_oc(res_.result);
            break;
        }
        await sleep(500);
        attemptions++;
    }

    // logging(strt, api_name, {price});

    return oc;
}

async function last_price () {
    // GET https://api.binance.com/api/v3/  ticker/price?symbol=BTCUSDT
    let [api_name, strt] = ['BINANCE.LAST_PRICE', Date.now()];

    let query = `symbol=${BASE}${QUOTE}`;
    let price = 0;

    let attemptions = 0;
    while (attemptions < 3) {
        let res_ = await get_data_public(V3, `ticker/price`, query);
        if(res_.success) {
            price = +res_.result.price;
            break;
        }
        await sleep(500);
        attemptions++;
    }

    // logging(strt, api_name, {price});

    return price;
}

async function server_time () {
    // GET https://api.binance.com/api/v3/  time
    let [api_name, strt] = ['BINANCE.SERVER_TIME', Date.now()];

    let time = 0;

    let attemptions = 0;
    while (attemptions < 3) {
        let res_ = await get_data_public(V3, `time`, '');
        if(res_.success) {
            time = res_.result.serverTime;
            break;
        }
        await sleep(500);
        attemptions++;
    }

    // logging(strt, api_name, {time});

    return time;
}

async function loan (ord, coin, ts_delta) {
    // POST https://api.binance.com/sapi/v1/margin/     loan

    let [api_name, strt] = ['BINANCE.LOAN', Date.now()];

    let [maxBorrowable, tranId] = [0, ord.loan.tranId];
    if (ord.loan.tranId === -1){

        // Get /sapi/v1/margin/maxBorrowable 
        let res_ = await get_data(V1, `maxBorrowable`, `asset=${BASE}&timestamp=${Date.now()+ts_delta}`);
        if(res_.success){
            maxBorrowable = res_.result.amount;
        }
        if (maxBorrowable < coin) return tranId;

        res_ = await post_data(V1, `loan`, `asset=${BASE}&amount=${coin}&timestamp=${Date.now()+ts_delta}`);
        if(res_.success){
            tranId = res_.result.tranId;
            let status = 'PENDING';
            while (status === 'PENDING') {
                res_ = await get_data(V1, `loan`, `asset=${BASE}&txId=${tranId}&timestamp=${Date.now()+ts_delta}`);
                if(res_.success && res_.result.rows.length === 1 && res_.result.rows[0].status !== 'PENDING'){
                    const tran = res_.result.rows[0];
                    if (tran.status === 'CONFIRMED') {
                        ord.loan.tranId = tranId;
                        ord.loan.principal = Math.round(tran.principal*global.env_total.BASE_SATOSHI);
                        ord.loan.interest = 0;
                        res_ = await get_data(V1, 'account', `timestamp=${Date.now()+ts_delta}`);
                        if(res_.success) {
                            let asset = res_.result.userAssets.find(c => c.asset === BASE);
                            // logging(strt, api_name, res_.result.userAssets);
                            logging(strt, api_name, asset);
                        }
                    }
                    else {
                        tranId = -1;
                        await logging(strt, api_name, tran);
                    }
                    break;
                }            
            }
        }

        await logging(strt, api_name, ord.loan);
    }
    return tranId;
}

async function repay (principal) {
    // POST https://api.binance.com/sapi/v1/margin/     repay

    let [api_name, strt] = ['BINANCE.REPAY', Date.now()];
    let ts_delta = (await server_time()) - Date.now();
    let tranId = -1;
    let coin = decimalAdjust(principal/global.env_total.BASE_SATOSHI, 6);

    res_ = await post_data(V1, `repay`, `asset=${BASE}&amount=${coin}&timestamp=${Date.now()+ts_delta}`);
    if(res_.success){
        tranId = res_.result.tranId;
        let status = 'PENDING';
        while (status === 'PENDING') {
            res_ = await get_data(V1, `repay`, `asset=${BASE}&txId=${tranId}&timestamp=${Date.now()+ts_delta}`);
            if(res_.success && res_.result.rows.length === 1 && res_.result.rows[0].status !== 'PENDING'){
                const tran = res_.result.rows[0];
                await logging(strt, api_name, tran);
                if(tran.interest > 0) res_ = await post_data(V1, `repay`, `asset=${BASE}&amount=${tran.interest}&timestamp=${Date.now()+ts_delta}`);
                break;
            }            
        }
    }
    return tranId;
}

async function logging(strt, api_name, log) {
    let fnt = Date.now();
    let dtlog = `${fnt} [${(new Date(fnt)).toISOString().replace(/T/g, ' ').substr(0, 19)}]\t[${fnt - strt}]\t`;
    console.log(`${dtlog} @ ${api_name}: ${JSON.stringify(log)}`);
    await db_logs.SetLogging(process.env.ORACLE_NAME, process.env.STRAT_ID, process.env.ACCOUNT_NAME, fnt, api_name, log);
}

async function get_data_public(version, api, query) {
    let res = {success: false, error: "", result: {}};

    const options = {
        method: 'GET',
        url: `${REST_AUTH_URL}${version}/${api}${(query.length > 0) ? '?'+query: ''}`,
        json: true
    };
    await request(options).then(body => {
        res.success = true;
        res.result = body;
    })
    .catch(err => {
        res.error = err.error;
        res.error_code = err.error.code;
        let e = fit_error(err);
        console.log(`GET PUBLIC ERROR: ${JSON.stringify(e)} query: ${query}`);
    });

    return res;
}

async function get_data(version, api, query, err_silent) {
    let res = {success: false, error: "", result: {}};

    const shex = secret.CreateHmac(query, API_SEC);

    const options = {
        method: 'GET',
        url: `${REST_AUTH_URL}${version}/${api}?${query}&signature=${shex}`,
        headers: {
            'X-MBX-APIKEY': API_KEY
        },
        json: true
    };
    await request(options).then(body => {
        res.success = true;
        res.result = body;
    })
    .catch(async function (err) {
        res.error = err.error;
        res.error_code = err.error.code;
        let e = fit_error(err);
        await external_err_logging.Log_Error(JSON.stringify(e), process.env.ACCOUNT_NAME, process.env.ORACLE_NAME, process.env.STRAT_ID);
        if(!err_silent) console.log(`GET ERROR: ${JSON.stringify(e)} query: ${query}`);
    });

    return res;
}

async function post_data(version, api, query) {
    let res = {success: false, error: "", result: {}};

    const shex = secret.CreateHmac(query, API_SEC);

    const options = {
        method: 'POST',
        url: `${REST_AUTH_URL}${version}/${api}?signature=${shex}`,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-MBX-APIKEY': API_KEY
        },
        body: `${query}`,
        json: true
    };
    await request(options).then(body => {
        res.success = true;
        res.result = body;
    })
    .catch(async function (err) {
        res.success = false;
        res.error = err.error;
        res.error_code = err.error.code;
        let e = fit_error(err);
        await external_err_logging.Log_Error(JSON.stringify(e), process.env.ACCOUNT_NAME, process.env.ORACLE_NAME, process.env.STRAT_ID);
        console.log(`POST ERROR: ${JSON.stringify(e)} query: ${query}`);
    });

    return res;
}

async function delete_data(version, api, query, err_silent) {
    let res = {success: false, error: "", result: {}};

    const shex = secret.CreateHmac(query, API_SEC);

    const options = {
        method: 'DELETE',
        url: `${REST_AUTH_URL}${version}/${api}?${query}&signature=${shex}`,
        headers: {
            'X-MBX-APIKEY': API_KEY
        },
        json: true
    };

    await request(options).then(body => {
        res.success = true;
        res.result = body;
    })
    .catch(async function (err) {
        res.error = err.error;
        res.error_code = err.error.code;
        let e = fit_error(err);
        await external_err_logging.Log_Error(JSON.stringify(e), process.env.ACCOUNT_NAME, process.env.ORACLE_NAME, process.env.STRAT_ID);
        if (!err_silent) console.log(`DELETE ERROR: ${JSON.stringify(e)} query: ${query}`);
    });

    return res;
}

function fit_error(err){
    let e = {
        name: err.name,
        statusCode: err.statusCode,
        message: err.message,
        error: err.error,
        options: {
            method: err.options.method,
            url: err.options.url,
            body: err.options.body
        }
    };
    return e;
}

module.exports.last_price = last_price;
module.exports.book = book;
module.exports.avg_last_5m_coins = avg_last_5m_coins;
module.exports.last_day_hl = last_day_hl;
module.exports.last_oc = last_oc;
module.exports.repay = repay;
module.exports.order_trades = CheckOrderTraded;
