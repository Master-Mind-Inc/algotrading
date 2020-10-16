const FUTURES = +(process.env.FUTURES || '');
const MAX_RISK = +(process.env.MAX_RISK || '0.01');
const WALLET = +(process.env.WALLET || '10000');
const DEBUG_PNL = +(process.env.DEBUG_PNL || '');
const fs = require('fs');
if (DEBUG_PNL === 1) fs.writeFileSync(process.cwd()+'/data/csvs/debug/money.csv', '');

module.exports.Get_Money = async function (min_sum, position_money, p2) {
    let comm = (FUTURES) ? global.env_total.COMMISSION_F : global.env_total.COMMISSION;
    let [api_name, strt] = ['ACC.GET_MONEY', Date.now()];
    let free_risk_money = WALLET * MAX_RISK - global.current_risk_money;
    let risk = (p2 + 2 * comm + global.env_total.MARKET_PENALTY);
    let money = free_risk_money / risk;

    let post_body = {
        name: `${process.env.ORACLE_NAME}_${process.env.STRAT_ID}`,
        money,
        position: position_money,
        account: process.env.ACCOUNT_NAME,
        wallet: global.wallet,
        current_risk_money: global.current_risk_money
    };
    if (money > min_sum) {
        let data_to_csv = `GET,${global.wallet},${global.current_risk_money},,${free_risk_money},${risk},${money}`;
        global.wallet -= money;
        global.current_risk_money += free_risk_money;
        post_body.wallet = global.wallet;
        logging(strt, api_name, post_body);
        if (DEBUG_PNL === 1) fs.appendFileSync(process.cwd()+'/data/csvs/debug/money.csv', `${data_to_csv},${global.wallet},${global.current_risk_money}\n`);
        return money;
    }
    post_body.money = 0;
    logging(strt, api_name, post_body);
    return 0;
}

module.exports.Send_Result = async function (return_money, position_money, p2, sl_percent){
    let [api_name, strt] = ['ACC.SEND_RESULT', Date.now()];
    let comm = (FUTURES) ? global.env_total.COMMISSION_F : global.env_total.COMMISSION;
    let risk = (p2 + 2 * comm + global.env_total.MARKET_PENALTY);

    let data_to_csv = `RET,${global.wallet},${global.current_risk_money},${return_money},,${risk},`;
    global.wallet += Math.max(return_money, 0);
    global.current_risk_money = position_money * risk;
    let post_body = {
        name: `${process.env.ORACLE_NAME}_${process.env.STRAT_ID}`,
        return: return_money,
        position: position_money,
        account: process.env.ACCOUNT_NAME,
        wallet: global.wallet,
        current_risk_money: global.current_risk_money,
        p2,
        p2_last: sl_percent
    };
    if (DEBUG_PNL === 1) fs.appendFileSync(process.cwd()+'/data/csvs/debug/money.csv', `${data_to_csv},${global.wallet},${global.current_risk_money}\n`);

    logging(strt, api_name, post_body);
    return true;
}

function logging(strt, api_name, log) {
    let fnt_log = global.logs[global.logs.length - 1].ts;
    let fnt = Date.now();
    let dtlog = `${fnt_log} [${(new Date(fnt_log)).toISOString().replace(/T/g, ' ').substr(0, 19)}]\t[${fnt - strt}]\t`;
    console.log(`${dtlog} @ ${api_name}: ${JSON.stringify(log)}`);
    // await db_logs.SetLogging(process.env.ORACLE_NAME, process.env.STRAT_ID, process.env.ACCOUNT_NAME, fnt, api_name, log);
}