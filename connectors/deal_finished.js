const request = require('request-promise');

module.exports.Send = async function (ORACLE_NAME, STRAT_ID, cid){
    const DEAL_FINISHED_URL = process.env.DEAL_FINISHED_URL || '';
    const exchange_raw = process.env.EXCHANGE.split('_');
    const EXEC_MODA = (exchange_raw.length > 1) ? exchange_raw[1] : 'MARKET';
    const ACCOUNT_NAME = process.env.ACCOUNT_NAME;
    const EXPERIMENT_NAME = process.env.EXPERIMENT_NAME || '???';
    const BASE = process.env.BASE;
    const QUOTE = process.env.QUOTE;
    
    if (DEAL_FINISHED_URL === '') {
        console.log(`DEAL_FINISHED_URL does not exist`);
        return true;
    }
    // http://svc-oracles-actions.thecabal/deal_finished?oracle=2933_50603&strat=65&exec_moda=emulator&account=account_21&experiment=test&id=811
    let url = `${DEAL_FINISHED_URL}?oracle=${ORACLE_NAME}&strat=${STRAT_ID}&exec_moda=${EXEC_MODA.toLowerCase()}&account=${ACCOUNT_NAME}&experiment=${EXPERIMENT_NAME}&id=${cid}&base=${BASE}&quote=${QUOTE}`;
    console.log(`DEAL.SEND: ${url}`);
    let res_ = await get_data(url, 'GET', {});
    return res_.success;
}

async function get_data(url, method, body) {
    let res = {success: false, error: "", result: {}};
    const options = {
        method: method,
        url: url,
        body: body,
        json: true
    };
    await request(options).then(body => {
        res.success = true;
        res.result = body;
    })
    .catch(error => {
        let e = fit_error(error);
        res.error = e;
        console.log('db_log Error in ${method} ${url}:', JSON.stringify({fn: 'deal_finished', query, error: JSON.stringify(e)}));
    });
    return res;
}

function fit_error(err){
    let e = {
        code: err.code,
        message: err.message,
        stack: err.stack
    };
    return e;
}