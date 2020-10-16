const url = require("url");
const connectors = require('../connectors');

function sleep(ms){
    return new Promise(resolve=>{
        setTimeout(resolve,ms)
    })
}

module.exports.wallets = async function(req, res) {
    let res_ = await connectors.bfx.wallets();
    if(res_.success){
        let wallets = res_.result.map(c => { return {
            WALLET_TYPE:        c[0],   // string      Wallet name (exchange, margin, funding)
            CURRENCY:           c[1],   // string      Currency (fUSD, etc)
            BALANCE:            c[2],   // float       Wallet balance
            UNSETTLED_INTEREST: c[3],   // float       Unsettled interest
            BALANCE_AVAILABLE:  c[4]    // float/null  Amount not tied up in active orders, positions or funding (null if the value is not fresh enough).
        };});
        res.status(200).json(wallets);
    }
    else {
        res.status(400).send(res_);
    }
}

module.exports.wallets_hist = async function(req, res) {
    let url_parts = url.parse(req.url, true);
    let end = (+(url_parts.query.end || '')*1000);
    if (end === 0) end = null;
    let currency = url_parts.query.currency;
    if (!currency) currency = null;

    let res_ = await connectors.bfx.wallets_hist(end, currency);
    if(res_.success){
        let wallets = res_.result.map(c => { return {
            WALLET_TYPE:        c[0],   // string      Wallet name (exchange, margin, funding)
            CURRENCY:           c[1],   // string      Currency (fUSD, etc)
            BALANCE:            c[2],   // float       Wallet balance
            UNSETTLED_INTEREST: c[3],   // float       Unsettled interest
            BALANCE_AVAILABLE:  c[4]    // float/null  Amount not tied up in active orders, positions or funding (null if the value is not fresh enough).
        };});
        res.status(200).json(wallets);
    }
    else res.status(400).send(res_);
}


function take_body(req, res){
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