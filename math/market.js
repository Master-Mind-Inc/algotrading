const BNB_USAGE = +(process.env.BNB_USAGE || '');
const exchange_raw = process.env.EXCHANGE.split('_');
const EXCHANGE = exchange_raw[0];
const EXEC_MODA = (exchange_raw.length > 1) ? exchange_raw[1] : 'MARKET';
const BASE = process.env.BASE;
const QUOTE = process.env.QUOTE;

const DEBUG = +(process.env.DEBUG || '0');
const INTERNAL_RISK_MANAGER = +(process.env.INTERNAL_RISK_MANAGER || '');
const SLACK_TO_NIL = (!process.env.SLACK_WEBHOOK_URL);
const SLACK_LOGS_TO_NIL = (!process.env.SLACK_LOGS_URL);

const TELEGRAM_TO_NIL = (!process.env.TELEGRAM_TOCKEN);
const DEAL_FINISHED_TO_NIL = (!process.env.DEAL_FINISHED_URL);

const ORACLE = `${process.env.ORACLE_NAME}_${process.env.STRAT_ID}`;
const T_ORACLE = `${ORACLE.replace(/_/g, '')}`;

const FUTURES = +(process.env.FUTURES || '');
const TIME_TRACKER = +(process.env.TIME_TRACKER || '');
const PRECISION = (FUTURES) ? 3 : 4;
const PRICE_GRAY_ENABLE = +(process.env.PRICE_GRAY_ENABLE || '');
const PRICE_INDENT_ENABLE = +(process.env.PRICE_INDENT_ENABLE || '');
const GONG = +(process.env.GONG || '');
const SWING_FILTER_ENABLE = +(process.env.SWING_FILTER_ENABLE || '');



// const connectors = require('../connectors');
module.exports.Serialize = Serialize;
module.exports.SerializeCheckPoints = SerializeCheckPoints;

module.exports.Env = function(env){
    if (Array.isArray(env) && env.length > 3) {
        var rt = (+env[0]) ? (+env[0])*1000 : Number.MAX_SAFE_INTEGER;
        global.params.env.REG_REV_EXPIRED_TIME = rt;
        global.params.env.ACCURACY_FILTER = +env[1];
        global.params.env.ACCURACY_LEVEL = +env[2];
        global.params.env.ACCURACY_FIELD = env[3] || 'accuracy';
        if (env.length > 7) {
            global.params.env.DYNAMIC_SLTP = +env[4];
            global.params.env.DYNAMIC_SLTP_TP_COEFF = +env[5];
            global.params.env.DYNAMIC_SLTP_SL_COEFF = +env[6];
            global.params.env.DYNAMIC_SLTP_FIELD = env[7] || 'delta';
            if (env.length > 8) {
                global.params.env.LEARN_DISTANCE_LIMIT_RED = (+env[8]) ? +env[8] : Number.MAX_VALUE;
                if (env.length > 9) {
                    global.params.env.LEARN_DISTANCE_LIMIT_GREEN = (+env[9]) ? +env[9] : 0;
                    if (env.length > 10) {
                        global.params.env.CANCEL_DELAY_MAKER_MIN = (+env[10]) ? +env[10] : 0;
                        global.params.env.CANCEL_DELAY_TAKER_MIN = (+env[11]) ? +env[11] : 0;
                        global.params.env.CLOSE_TIME_PROLONG_ENABLE = (+env[12]) ? +env[12] : 0;
                    }
                }
            }
        }
    }
}

/**
 * Under NDA
 */


function decimalAdjust(value, e) {
    let exp = e || 10;
    return Math.round(value * Math.pow(10, exp)) / Math.pow(10, exp);
}

function sleep(ms){
    return new Promise(resolve=>{
        setTimeout(resolve,ms)
    })
}

async function MemoryUsage(api_name, strt) {
    let memory = process.memoryUsage();
    memory.rss /= (1024 * 1024);
    memory.heapTotal /= (1024 * 1024);
    memory.heapUsed /= (1024 * 1024);
    memory.external /= (1024 * 1024);
    await logging(strt, `${api_name}.MARKET.MEMORY_USAGE`, memory);
}
async function logging(strt, api_name, log) {
    let fnt = Date.now();
    let dtlog = `${fnt} [${(new Date(fnt)).toISOString().replace(/T/g, ' ').substr(0, 19)}]\t[${fnt - strt}]\t`;
    console.log(`${dtlog} @ ${api_name}: ${JSON.stringify(log)}`);
    if (EXEC_MODA !== 'PNL') await connectors.db_logs.SetLogging(process.env.ORACLE_NAME, process.env.STRAT_ID, process.env.ACCOUNT_NAME, fnt, api_name, log);
}
function fit_error(err){
    let e = {
        code: err.code,
        message: err.message,
        stack: err.stack
    };
    return e;
}