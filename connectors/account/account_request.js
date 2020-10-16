const request = require('request-promise');
const db_logs = require('../db_logs');
const BASE = process.env.BASE;
const QUOTE = process.env.QUOTE;
const ACCOUNT_URL = process.env.ACCOUNT_URL;
const ORACLE_NAME = process.env.ORACLE_NAME;
const STRAT_ID = process.env.STRAT_ID;
const ACCOUNT_NAME = process.env.ACCOUNT_NAME;

module.exports.Dec = async function (){
    let [api_name, strt] = ['ACC.DEC', Date.now()];
    let url = `http://${ACCOUNT_URL}/dec?name=${ORACLE_NAME}_${STRAT_ID}&account=${ACCOUNT_NAME}&asset=${BASE}${QUOTE}`;

    let res_ = await get_data(url, 'GET', {});
    await logging(strt, api_name, res_);
    return res_.success;
}

module.exports.Get_Money = async function (min_sum, position_money, p2){
    let [api_name, strt] = ['ACC.GET_MONEY', Date.now()];
    let url = `http://${ACCOUNT_URL}/get_money?name=${ORACLE_NAME}_${STRAT_ID}&account=${ACCOUNT_NAME}&min_sum=${min_sum}&p2=${p2}&asset=${BASE}${QUOTE}`;
    let money = 0;

    let res_ = await get_data(url, 'GET', {});
    if(res_.success) {
        if (res_.result.money >= min_sum) money = res_.result.money;
        await logging(strt, api_name, {min_sum, money:res_.result.money});
    }
    else await logging(strt, api_name, res_);
    return money;
}

module.exports.Get_Status = async function (){
    let [api_name, strt] = ['ACC.GET_STATUS', Date.now()];
    let url = `http://${ACCOUNT_URL}/get_oracle_status?name=${ORACLE_NAME}_${STRAT_ID}&account=${ACCOUNT_NAME}&asset=${BASE}${QUOTE}`;
    let status = {current_risk: 0, max_risk: 0, pos: 0, ts: 0};

    let res_ = await get_data(url, 'GET', {});
    if(res_.success) {
        status.current_risk = res_.result.current_risk;
        status.max_risk = res_.result.max_risk;
        status.pos = res_.result.pos;
        status.ts = Math.floor(res_.result.ts);
    }
    await logging(strt, api_name, status);
    return status;
}

module.exports.Send_Result = async function (return_money, position_money, p2, sl_percent){
    let [api_name, strt] = ['ACC.SEND_RESULT', Date.now()];
    let url = `http://${ACCOUNT_URL}/get_result`;

    let post_body = {
        name: `${ORACLE_NAME}_${STRAT_ID}`,
        return: return_money,
        position: position_money,
        account: ACCOUNT_NAME,
        asset: `${BASE}${QUOTE}`,
        p2,
        p2_last: sl_percent
    };

    let res_ = await get_data(url, 'POST', post_body);
    await logging(strt, api_name, post_body);
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