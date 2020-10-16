const FUTURES = +(process.env.FUTURES || '');
const MAX_RISK = +(process.env.MAX_RISK || '0.01');
const WALLET = +(process.env.WALLET || '10000');

module.exports.Get_Money = async function (min_sum, position_money, p2){
    let comm = (FUTURES) ? global.env_total.COMMISSION_F : global.env_total.COMMISSION;

    let free_risk_money = WALLET * MAX_RISK - global.current_risk_money;
    let risk = (p2 + 2 * comm + global.env_total.MARKET_PENALTY);

    let money = free_risk_money / risk;
    if (money > min_sum) {
        global.wallet -= money;
        global.current_risk_money += free_risk_money;
        return money;
    }
    return 0;
}

module.exports.Send_Result = async function (return_money, position_money, p2){
    let comm = (FUTURES) ? global.env_total.COMMISSION_F : global.env_total.COMMISSION;
    let risk = (p2 + 2 * comm + global.env_total.MARKET_PENALTY);
    global.wallet += Math.max(return_money, 0);
    global.current_risk_money = position_money * risk;
    return true;
}
