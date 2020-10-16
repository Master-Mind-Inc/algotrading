const request = require('request-promise');
const SWINGS_URL = process.env.SWINGS_URL || '';

module.exports.GetSwingCommands = async function (post_body){
    let [api_name, strt] = ['SWING.SEND', Date.now()];
    let ret = [];

    let res_ = await get_data(SWINGS_URL, 'POST', post_body);
    if(res_.success) {
        if (res_.result.length > 0) {
            ret = res_.result.map(s => {
                return {
                    ts: Math.round(s.ts_index)*1000,
                    type: s.direction,
                    price: decimalAdjust(s.confirmation_price,2),
                    cancel: decimalAdjust(s.cancel_price,2),
                    tp: decimalAdjust(s.take_profit,2),
                    sl: decimalAdjust(s.stop_loss,2),
                    action: 1
                }
            });
        }
    }
    else await logging(strt, api_name, res_);
    return ret;
}

async function logging(strt, api_name, log) {
    let fnt = Date.now();
    let dtlog = `${fnt} [${(new Date(fnt)).toISOString().replace(/T/g, ' ').substr(0, 19)}]\t[${fnt - strt}]\t`;
    console.log(`${dtlog} @ ${api_name}: ${JSON.stringify(log)}`);
}

function decimalAdjust(value, e) {
    let exp = e || 10;
    return Math.round(value * Math.pow(10, exp)) / Math.pow(10, exp);
}

async function get_data(url, method, query) {
    let res = {success: false, error: "", result: {}};
    const options = {
        method: method,
        url: url,
        followRedirect: false,
        body: query,
        json: true
    };
    await request(options).then(body => {
        res.success = true;
        res.result = body;
    })
    .catch(err => {
        res.error = err.message;
        console.log(`Error in ${method} ${url}: ${err.message}`);
    });
    return res;
}