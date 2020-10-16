const request = require('request-promise');
const TELEGRAM_TOCKEN = process.env.TELEGRAM_TOCKEN || '';
var TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const db_logs = require('./db_logs');

module.exports.Send = async function (text){
    // https://api.telegram.org/bot1008579602:AAFFkGGmW9vXSQqPnvendrQZACC7_DAznOE/sendMessage?chat_id=-1001169340382&text=
    let [api_name, strt] = ['TLG.SEND', Date.now()];
    let url = `https://api.telegram.org/bot${TELEGRAM_TOCKEN}/sendMessage?chat_id=${TELEGRAM_CHAT_ID}&text=${encodeURIComponent(text)}`;

    let res_ = await get_data(url, 'GET', {});
    if(res_.success) {
        await logging(strt, api_name, {text});
    }
    else await logging(strt, api_name, res_);
    return res_.success;    
}

async function logging(strt, api_name, log) {
    let fnt = Date.now();
    let dtlog = `${fnt} [${(new Date(fnt)).toISOString().replace(/T/g, ' ').substr(0, 19)}]\t[${fnt - strt}]\t`;
    console.log(`${dtlog} @ ${api_name}: ${JSON.stringify(log)}`);
    await db_logs.SetLogging(process.env.ORACLE_NAME, process.env.STRAT_ID, process.env.ACCOUNT_NAME, fnt, api_name, log);
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
    .catch(err => {
        res.error = err.message;
        console.log(`Error in ${method} ${url}: ${err.message}`);
    });
    return res;
}