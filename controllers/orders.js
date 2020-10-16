const url = require("url");
const connectors = require('../connectors');
const mathjs = require('mathjs');
const math = require('../math');

function sleep(ms){
    return new Promise(resolve=>{
        setTimeout(resolve,ms)
    })
}

module.exports.orders_ex = async function(req, res) {
    let url_parts = url.parse(req.url, true);
    let symbol = url_parts.query.symbol || '';

    if (symbol.length === 0){
        res.status(404).json({error: 'Symbol is required'});
        return;
    }

    let res_ = await connectors.bfx.orders(symbol);
    if(res_.success){
        let orders = math.data_models.order.opened_ex(res_.result);
        mathjs.sort(orders, (a,b) => { return a.MTS_CREATE - b.MTS_CREATE });
        res.status(200).json(orders);
    }
    else res.status(400).send(res_);
}

module.exports.orders_hist_ex = async function(req, res) {
    let url_parts = url.parse(req.url, true);
    let pair = url_parts.query.pair || '';

    let start = (+(url_parts.query.start || '')*1000);
    if (start === 0) start = null;
    let end = (+(url_parts.query.end || '')*1000);
    if (end === 0) end = null;
    let limit = +(url_parts.query.limit || '');
    if (limit === 0) limit = null;
    let sort = +(url_parts.query.sort || '');
    if (sort === 0) sort = null;

    let res_ = await connectors.bfx.orders_hist(pair, start, end, limit, sort);
    if(res_.success){
        let orders = math.data_models.order.historical_ex(res_.result);
        mathjs.sort(orders, (a,b) => { return a.MTS_CREATE - b.MTS_CREATE });
        res.status(200).json(orders);
    }
    else res.status(400).send(res_);
}

module.exports.order_trades = async function(req, res) {
    let url_parts = url.parse(req.url, true);
    let pair = url_parts.query.pair || '';
    let order = url_parts.query.order || '';

    if (pair.length === 0){
        res.status(404).json({error: 'Pair is required'});
        return;
    }

    if (order.length === 0){
        res.status(404).json({error: 'Order ID is required'});
        return;
    }

    let res_ = await connectors.bfx.order_trades(pair, order);
    if(res_.success){
        let trades = res_.result.map(c => { return {
            ID:             c[0],   // integer	Trade database id
            PAIR:           c[1],   // string	Pair (BTCUSD, …)
            MTS_CREATE:     c[2],   // integer	Execution timestamp
            ORDER_ID:       c[3],   // integer	Order id
            EXEC_AMOUNT:    c[4],   // float	Positive means buy, negative means sell
            EXEC_PRICE:     c[5],   // float	Execution price
            // _PLACEHOLDER:   c[6],  // null
            // _PLACEHOLDER:   c[7],  // null
            MAKER:          c[8],   // int	1 if true, -1 if false
            FEE:            c[9],   // float	Fee
            FEE_CURRENCY:   c[10]   // string	Fee currency
        };});
        res.status(200).json(trades);
    }
    else res.status(400).send(res_);
}

module.exports.trades_hist = async function(req, res) {
    let url_parts = url.parse(req.url, true);
    let pair = url_parts.query.pair || '';

    let start = (+(url_parts.query.start || '')*1000);
    if (start === 0) start = null;
    let end = (+(url_parts.query.end || '')*1000);
    if (end === 0) end = null;
    let limit = +(url_parts.query.limit || '');
    if (limit === 0) limit = null;

    if (pair.length === 0){
        res.status(404).json({error: 'Pair is required'});
        return;
    }

    let res_ = await connectors.bfx.trades_hist(pair, start, end, limit);
    if(res_.success){
        let trades = res_.result.map(c => { return {
            ID:             c[0],   // integer	Trade database id
            PAIR:           c[1],   // string	Pair (BTCUSD, …)
            MTS_CREATE:     c[2],   // integer	Execution timestamp
            ORDER_ID:       c[3],   // integer	Order id
            EXEC_AMOUNT:    c[4],   // float	Positive means buy, negative means sell
            EXEC_PRICE:     c[5],   // float	Execution price
            ORDER_TYPE:     c[6],  // string	Order type
            ORDER_PRICE:    c[7],  // float	Order price
            MAKER:          c[8],   // int	1 if true, -1 if false
            FEE:            c[9],   // float	Fee
            FEE_CURRENCY:   c[10]   // string	Fee currency
        };});
        res.status(200).json(trades);
    }
    else res.status(400).send(res_);
}

module.exports.ledgers_hist = async function(req, res) {
    let url_parts = url.parse(req.url, true);
    let currency = url_parts.query.currency || '';

    let start = (+(url_parts.query.start || '')*1000);
    if (start === 0) start = null;
    let end = (+(url_parts.query.end || '')*1000);
    if (end === 0) end = null;
    let limit = +(url_parts.query.limit || '');
    if (limit === 0) limit = null;

    if (currency.length === 0){
        res.status(404).json({error: `Currency is required. For an up-to-date listing of supported currencies see: https://api.bitfinex.com/v2/conf/pub:map:currency:label`});
        return;
    }

    let res_ = await connectors.bfx.ledgers_hist(currency, start, end, limit);
    if(res_.success){
        let trades = res_.result.map(c => { return {
            ID:             c[0],   // int	Ledger identifier
            CURRENCY:       c[1],   // String	The symbol of the currency (ex. "BTC")
            // _PLACEHOLDER:   c[2],  // null
            TIMESTAMP_MILLI:c[3],   // Date	Timestamp in milliseconds
            // _PLACEHOLDER:   c[4],  // null
            AMOUNT:         c[5],   // float	Amount of funds moved
            BALANCE:        c[6],   // float	New balance
            // _PLACEHOLDER:   c[7],  // null
            DESCRIPTION:    c[8]    // String	Description of ledger transaction
        };});
        res.status(200).json(trades);
    }
    else res.status(400).send(res_);
}

module.exports.order_submit_ex = async function(req, res) {
    let body = take_body(req);

    let res_ = await connectors.bfx.order_submit_ex(body);
    if(res_.success){
        let order = math.data_models.order.submitted_ex(res_.result);
        res.status(200).json(order);
    }
    else res.status(400).send(res_);
}

module.exports.aaaaa = async function(req, res) {

    let res_ = await connectors.bfx.aaaaa();
    if(res_.success){
        let trades = res_.result.map(c => { return {
        };});
        res.status(200).json(trades);
    }
    else res.status(400).send(res_);
}

function take_body(req){
    let body;  
    if (req.body instanceof Object) {
        body = req.body;
    } else if (('' + req.body).trim().length > 0) { // 
        try { body = JSON.parse(req.body); }
        catch (err) {
            let message = `ERROR on POST ${req.route.path}: request body is not a valid JSON`;
            console.error(message, err);
            return {error: true, message, err};
        }
    }
    return body;
}