const FUTURES = +(process.env.FUTURES || '');
const BASE = process.env.BASE;

function Order_Status_Detail(fills, bnb_price){
    let BNB_PRICE = bnb_price || +(process.env.BNB_PRICE || '15.0');
    /*
        {
        "commission": "0.00000660",
        "commissionAsset": "BTC",
        "id": 205858314,
        "isBestMatch": true,
        "isBuyer": true,
        "isMaker": false,
        "orderId": 806899280,
        "price": "8432.11000000",
        "qty": "0.00660000",
        "symbol": "BTCUSDT",
        "time": 1574091381986
        }

        // Futures
        {
        "buyer": false,
        "commission": "-0.07819010",
        "commissionAsset": "USDT",
        "id": 698759,
        "maker": false,
        "orderId": 25851813,
        "price": "7819.01",
        "qty": "0.002",
        "quoteQty": "15.63802",
        "realizedPnl": "-0.91539999",
        "side": "SELL",
        "symbol": "BTCUSDT",
        "time": 1569514978020
        }

    */

    return fills.map(c => {
        return {
            status:             'FILLED',
            price:              +c.price,
            coin:               Math.round(+c.qty*global.env_total.BASE_SATOSHI),
            ts:                 c.time,
            commission_coin:    (BASE === c.commissionAsset) ? Math.round((+c.commission)*global.env_total.BASE_SATOSHI) : 0,
            commission:         (BASE === c.commissionAsset) ? 0.0 : ('BNB' === c.commissionAsset) ? (+c.commission)*BNB_PRICE : +c.commission
        };
    });
}

module.exports.submitted = function(submitted_order){
    /*
    {
            "clientOrderId": "3",
            "cummulativeQuoteQty": "0.00000000",
            "executedQty": "0.00000000",
            "fills": [],
            "orderId": 794868296,
            "origQty": "0.00200000",
            "price": "8637.73000000",
            "side": "BUY",
            "status": "NEW",
            "symbol": "BTCUSDT",
            "timeInForce": "GTC",
            "transactTime": 1573745794888,
            "type": "LIMIT"
        }
    */

    let order = {
        id:             submitted_order.orderId,                    // int	Order ID
        str_cid:        submitted_order.clientOrderId,              // String	Client Order ID
        ts:             submitted_order.transactTime || submitted_order.time,               // int	Second timestamp of creation
        coin:           Math.round(Math.abs(+submitted_order.origQty)*global.env_total.BASE_SATOSHI),         // float. Original amount in satoshi
        exec_coin:      Math.round(Math.abs(+submitted_order.executedQty)*global.env_total.BASE_SATOSHI),         // float. Original amount in satoshi
        avgPrice:       +submitted_order.avgPrice,
        price:          +submitted_order.price,                  // float	Price
        message: {
            status:     submitted_order.status,                         // string	Status of the notification; it may vary over time (SUCCESS, ERROR, FAILURE, ...)
            text:       '',                         // string	Text of the notification
        },
        order_status:   []  // Order_Status_Detail(submitted_order.fills)
    }

    return order;
}

module.exports.historical = function(hist_order, fills, bnb_price){
    /*
    {
        "accountId": 11632850,
        "clientOrderId": "2016x4x11x000000008",
        "cummulativeQuoteQty": "55.65192600",
        "executedQty": "0.00660000",
        "icebergQty": "0.00000000",
        "isWorking": true,
        "orderId": 806899280,
        "origQty": "0.00660000",
        "price": "8432.17000000",
        "side": "BUY",
        "status": "FILLED",
        "stopPrice": "0.00000000",
        "symbol": "BTCUSDT",
        "time": 1574091381986,
        "timeInForce": "GTC",
        "type": "LIMIT",
        "updateTime": 1574091381986
    }
    */

    let order = {
        id:             hist_order.orderId,                    // int	Order ID
        str_cid:        hist_order.clientOrderId,              // String	Client Order ID
        ts:             hist_order.transactTime || hist_order.time,               // int	Second timestamp of creation
        coin:           Math.round(Math.abs(+hist_order.origQty)*global.env_total.BASE_SATOSHI),         // float. Original amount in satoshi
        exec_coin:      Math.round(Math.abs(+hist_order.executedQty)*global.env_total.BASE_SATOSHI),         // float. Original amount in satoshi
        avgPrice:       +hist_order.avgPrice,
        price:          +hist_order.price,                  // float	Price
        message: {
            status:     hist_order.status,                  // string	Status of the notification; it may vary over time (SUCCESS, ERROR, FAILURE, ...)
            text:       '',                                 // string	Text of the notification
        },
        order_status:   Order_Status_Detail(fills, bnb_price)
    }

    return order;
}

module.exports.fix_lag = function(sub_order){
    let comm = (FUTURES) ? global.env_total.COMMISSION_F : global.env_total.COMMISSION;
    let fills_coin = sub_order.order_status.reduce((a,c) => a + c.coin, 0);
    let coin_to_fit = sub_order.exec_coin - fills_coin;
    if (coin_to_fit > 100) {
        let price = (sub_order.avgPrice) ? sub_order.avgPrice : sub_order.price;
        let fit_stat = {
            status: "FILLED",
            fix:    true,
            price,
            coin: sub_order.exec_coin,
            ts: sub_order.ts,
            commission_coin: 0,
            commission: decimalAdjust(sub_order.exec_coin / global.env_total.BASE_SATOSHI * price * comm, 8)
        };
        if (sub_order.order_status.length > 0 && !fit_stat.price) fit_stat.price = sub_order.order_status[0].price;
        sub_order.order_status = [fit_stat];
    }
}

module.exports.book = function(book) {
    let res = {asks:[], bids:[]};
    if (book.asks.length > 0) res.asks = book.asks.map(c => { return {price: +c[0], coin: Math.round((+c[1]) * global.env_total.BASE_SATOSHI)}; });
    if (book.bids.length > 0) res.bids = book.bids.map(c => { return {price: +c[0], coin: Math.round((+c[1]) * global.env_total.BASE_SATOSHI)}; });
    return res;
}

module.exports.avg_last_5m_coins = function(candles) {
    let PRICE_INDENT = (+(process.env.PRICE_INDENT || '')) ? +(process.env.PRICE_INDENT) : global.env_total.PRICE_INDENT;
    let coin = 0;
    if (candles.length > 0) {
        const len = Math.min(5, candles.length);
        for (let i = 0; i < len; i++) coin += candles[i][5] * global.env_total.BASE_SATOSHI;
        coin = Math.round(coin * PRICE_INDENT / len);
    }
    return coin;
}

module.exports.last_day_hl = function(candles) {
    let hl = [0, Number.MAX_VALUE];
    for (let i = 0; i < candles.length; i++) {
        hl[0] = Math.max(candles[i][2], hl[0]);
        hl[1] = Math.min(candles[i][3], hl[1]);
    }
    return hl;
}

module.exports.last_oc = function(candles) {
    let oc = [0, 0];
    if (candles.length > 0) {
        oc[0] = candles[i][1];
        oc[1] = candles[i][4];
    }
    return oc;
}

function decimalAdjust(value, e) {
    let exp = e || 10;
    return Math.round(value * Math.pow(10, exp)) / Math.pow(10, exp);
}
