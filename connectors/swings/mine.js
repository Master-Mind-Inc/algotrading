const request = require('request-promise');
const SWINGS_URL = process.env.SWINGS_URL || '';

function sleep(ms){
    return new Promise(resolve=>{
        setTimeout(resolve,ms)
    })
}

module.exports.GetSwingCommands = async function (post_body){
    let [api_name, strt] = ['MINE_SWING.SEND', Date.now()];
    let ret = [];

    let res_ = await get_data(`${SWINGS_URL}/pnl`, 'POST', post_body);
    if(res_.success) {
        await logging(strt, api_name, {message: 'sent point', point: post_body});
        let in_progress = true;
        while (in_progress){
            res_ = await get_data(`${SWINGS_URL}/in_progress`, 'GET', {});
            if(res_.success) {
                if (res_.result.status === 0) {
                    in_progress = false;
                    break;
                }
            }
            else await logging(strt, api_name, res_);

            await sleep(60000);
            console.log('Swings still are not ready  ...........');
        }
        res_ = await get_data(`${SWINGS_URL}/cmds`, 'GET', {});
        if(res_.success && res_.result.length > 0) {
            ret = res_.result.map(c => {
                return {
                    ts      : c.ts*1000,
                    type    : c.type  ,
                    cid     : c.cid   ,
                    s       : c.s     ,
                    dbar_i  : c.dbar_i,
                    dbar_ts : c.dbar_ts,
                    price   : c.price ,
                    cancel  : c.cancel,
                    tp      : c.tp    ,
                    sl      : c.sl    ,
                    action  : c.action
                }
            });
        }
        else await logging(strt, api_name, res_);
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