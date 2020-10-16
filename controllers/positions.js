const url = require("url");
const connectors = require('../connectors');

function sleep(ms){
    return new Promise(resolve=>{
        setTimeout(resolve,ms)
    })
}

module.exports.margin_base = async function(req, res) {
    let res_ = await connectors.bfx.margin_info('base');
    if(res_.success){
        let ans = res_.result[1];
        let margin = [{
            USER_PL:            ans[0],   // float   User Profit and Loss
            USER_SWAPS:         ans[1],   // float	Amount of swaps a user has
            MARGIN_BALANCE:     ans[2],   // float	Balance in your margin funding account
            MARGIN_NET:         ans[3]    // float	Balance after P&L is accounted for
        }];
        res.status(200).json(margin);
    }
    else res.status(400).send(res_);
}

module.exports.margin_info = async function(req, res) {
    let url_parts = url.parse(req.url, true);
    let pair = url_parts.query.pair || '';

    if (pair.length === 0){
        res.status(404).json({error: 'Pair is required'});
        return;
    }

    let res_ = await connectors.bfx.margin_info(pair);
    if(res_.success){
        let ans = res_.result[2];
        let margin = [{
            TRADABLE_BALANCE:   ans[0],   // float	Your buying power (how large a position you can obtain)
            GROSS_BALANCE:      ans[1],   // float	Your buying power (how large a position you can obtain)
            BYU:                ans[2],   // float	Balance in your margin funding account
            SELL:               ans[3]    // float	Balance after P&L is accounted for
        }];
        res.status(200).json(margin);
    }
    else res.status(400).send(res_);
}

module.exports.positions = async function(req, res) {
    let res_ = await connectors.bfx.positions();
    if(res_.success){
        let trades = res_.result.map(c => { return {
            SYMBOL:             c[0],   // string	Pair (tBTCUSD, …).
            STATUS:             c[1],   // string	Status (ACTIVE, CLOSED).
            AMOUNT:             c[2],   // float	Size of the position. Positive values means a long position, negative values means a short position.
            BASE_PRICE:         c[3],   // float	The price at which you entered your position.
            MARGIN_FUNDING:     c[4],   // float	The amount of funding being used for this position.
            MARGIN_FUNDING_TYPE:c[5],   // int	0 for daily, 1 for term.
            PL:                 c[6],   // float	Profit & Loss
            PL_PERC:            c[7],   // float	Profit & Loss Percentage
            PRICE_LIQ:          c[8],   // float	Liquidation price
            LEVERAGE:           c[9],   // float	Beta value
            // _PLACEHOLDER:       c[10],
            ID:                 c[11],   // int64	Position ID
            MTS_CREATE:         c[12],   // int	Millisecond timestamp of creation
            MTS_UPDATE:         c[13],   // int	Millisecond timestamp of update
            // _PLACEHOLDER:       c[14],
            TYPE:               c[15],   // int	Identifies the type of position, 0 = Margin position, 1 = Derivatives position
            // _PLACEHOLDER:       c[16],
            COLLATERAL:         c[17],   // float	The amount of collateral applied to the open position
            COLLATERAL_MIN:     c[18],   // float	The minimum amount of collateral required for the position
            META:               c[19]    // json string	Additional meta information about the position
        };});
        res.status(200).json(trades);
    }
    else res.status(400).send(res_);
}

module.exports.positions_hist = async function(req, res) {
    let url_parts = url.parse(req.url, true);

    let start = (+(url_parts.query.start || '')*1000);
    if (start === 0) start = null;
    let end = (+(url_parts.query.end || '')*1000);
    if (end === 0) end = null;
    let limit = +(url_parts.query.limit || '');
    if (limit === 0) limit = null;

    let res_ = await connectors.bfx.positions_hist(start, end, limit);
    if(res_.success){
        let trades = res_.result.map(c => { return {
            SYMBOL:             c[0],   // string	Pair (tBTCUSD, …).
            STATUS:             c[1],   // string	Status (ACTIVE, CLOSED).
            AMOUNT:             c[2],   // float	Size of the position. Positive values means a long position, negative values means a short position.
            BASE_PRICE:         c[3],   // float	The price at which you entered your position.
            MARGIN_FUNDING:     c[4],   // float	The amount of funding being used for this position.
            MARGIN_FUNDING_TYPE:c[5],   // int	0 for daily, 1 for term.
            PL:                 c[6],   // float	Profit & Loss
            PL_PERC:            c[7],   // float	Profit & Loss Percentage
            PRICE_LIQ:          c[8],   // float	Liquidation price
            LEVERAGE:           c[9],   // float	Beta value
            // _PLACEHOLDER:       c[10],
            ID:                 c[11],   // int64	Position ID
            MTS_CREATE:         c[12],   // int	Millisecond timestamp of creation
            MTS_UPDATE:         c[13]    // int	Millisecond timestamp of update
        };});
        res.status(200).json(trades);
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