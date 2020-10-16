const url = require("url");
const connectors = require('../connectors');
const math = require('../math');
const fs = require('fs');

const exchange_raw = process.env.EXCHANGE.split('_');
const BATCH_TS_START = +(process.env.BATCH_TS_START || '');
const BATCH_TS_END = +(process.env.BATCH_TS_END || '');
const BATCH_SIZE = +(process.env.BATCH_SIZE || '2880');
const EXEC_MODA = (exchange_raw.length > 1) ? exchange_raw[1] : 'MARKET';
const SQRT = Math.sqrt(360);
const ORACLE_NAME = process.env.ORACLE_NAME;
const TIME_TRACKER = +(process.env.TIME_TRACKER || '');
const PRICE_INDENT_ENABLE = +(process.env.PRICE_INDENT_ENABLE || '');
const PRICE_GRAY_ENABLE = +(process.env.PRICE_GRAY_ENABLE || '');
const SWING_FILTER_ENABLE = +(process.env.SWING_FILTER_ENABLE || '');
const WORK_ONLY = +(process.env.WORK_ONLY || '');

const FIBO_TP = +(process.env.FIBO_TP || '0.786');
const TPSL_FACTOR = +(process.env.TPSL_FACTOR || '3');

const INTERNAL_RISK_MANAGER = +(process.env.INTERNAL_RISK_MANAGER || '');

const zip = require('adm-zip');
const { stringify } = require("querystring");
const csv = require('../math').csv;

function sleep(ms){
    return new Promise(resolve=>{
        setTimeout(resolve,ms)
    })
}

module.exports.orders_hist = async function(req, res) {
    let url_parts = url.parse(req.url, true);
    let startTime = url_parts.query.startTime;
    let endTime = url_parts.query.endTime + '';
    let orders = await connectors.market.order_hist(startTime, endTime);

    res.status(200).json(orders);
}

module.exports.transactions_hist = async function(req, res) {
    let transactions = [];
    try {
        transactions = await connectors.db_logs.GetTransactions(process.env.ORACLE_NAME, process.env.STRAT_ID);
    }
    catch (err) {
        let message = `ERROR on GET Action ${JSON.stringify(err)}: request body is not a valid JSON`;
        console.error(message, JSON.stringify(err));
    }
    res.status(200).json(transactions);
}

async function ExecuteBatch(i_start, i_end) {
    let strt = Date.now();
    let P9 = Math.floor(global.params.p9*24*3600000);

    await connectors.db_market.GetTicksBatch(global.pre_logs[i_start].ts - P9, global.pre_logs[i_end].ts);
    await logging(strt, 'BATCH.LOAD', { message: `Ticks were Loaded (${global.batch_ticks_array.length})` });
    Fit_PreLogs_WP_for_PnL();

    await MemoryUsage('BATCH.LOAD', strt);

    /**
     * Under NDA
     */
    
    return;
}

function Fit_PreLogs_toAB (logs, abt) {
    if (abt.length > 0) {
        let abt_i = 0;
        for (let i = 0; i < logs.length; i++) {
            let log = logs[i];
            while (abt_i < abt.length && abt[abt_i].ts*1000 < log.ts) {
                abt_i++;
            }
            if (abt[abt_i] && abt[abt_i].ts*1000 - logs[i].ts < 60000) {
                log.ts = abt[abt_i].ts*1000;
                log.ab = abt[abt_i];
                log.avg_last_5m_coins = abt[abt_i].coin;
            }
            else {
                log.ab = {ts: log.ts, asks: [], bids: []};
                log.avg_last_5m_coins = 0;
            }
        }
    }
}
function Fit_PreLogs_toGray (logs, abt) {
    if (abt.length > 0) {
        let abt_i = 0;
        for (let i = 0; i < logs.length; i++) {
            let log = logs[i];
            while (abt_i < abt.length && abt[abt_i].ts*1000 < log.ts) {
                abt_i++;
            }
            if (abt[abt_i] && abt[abt_i].ts*1000 - logs[i].ts < 60000) {
                log.ts = abt[abt_i].ts*1000;
                log.last_day_hl = abt[abt_i].hl;
            }
            else {
                log.ab = {ts: log.ts, asks: [], bids: []};
                log.last_day_hl = [log.price+1, log.price-1];
            }
        }
    }
}

function Fit_Vols_toLogs(vols) {
    if (vols.length > 0) {
        let vol_fields = Object.keys(vols[0]).filter(c => c !== "ts");
        let vol_id = 0;
        for (let idx = 0; idx < global.pre_logs.length; idx++) {
            let log = global.pre_logs[idx];
            for (; vol_id < vols.length; vol_id++) {
                 if (vols[vol_id].ts > log.ts) break;
            }
            let v = Math.max(vol_id-1, 0);
            vol_fields.forEach(c => log[c] = (vols[v] && vols[v][c]) ? vols[v][c] : 0.0);
        }
    }
    return;
}

function Fit_LN_toLogs(lns) {
    if (lns.length > 0) {
        let lns_id = 0;
        let lns_i = 0;
        for (let idx = 0; idx < global.pre_logs.length; idx++) {
            let log = global.pre_logs[idx];
            for (; lns_id < lns.length; lns_id++) {
                if (lns[lns_id].ts > log.ts) break;
                lns_i = lns_id;
            }
            log.learn_distance = lns[lns_i].learn_distance;
        }
    }
    return;
}

function Fit_Swings_toLogs(sws) {
    if (sws.length > 0) {
        let sws_id = 0;
        let sws_i = 0;
        for (let idx = 0; idx < global.pre_logs.length; idx++) {
            let log = global.pre_logs[idx];
            for (; sws_id < sws.length; sws_id++) {
                if (sws[sws_id].ts > log.ts) break;
                sws_i = sws_id;
            }
            log.swing_filter = sws[sws_i];
        }
    }
    return;
}

function Fit_TQ_PDs_toLogs(TQ_pds) {
    let TQ_id = 0;
    let TQs = global.TQs;
    for (let idx = 0; idx < global.pre_logs.length; idx++) {
        let log = global.pre_logs[idx];
        if (global.params.env.CLOSE_COMMAND_TQ === 1) {
            if (TQs[TQ_id].ts > log.ts) log.TQ_del = 0;
            else {
                if (TQ_id < TQs.length - 1) {
                    while (TQ_id < TQs.length - 1) {
                        if (TQs[TQ_id + 1].ts > log.ts) break;
                        else TQ_id++;
                    }
                }
                let [TQ, TQ_pd] = [TQs[TQ_id], TQ_pds[idx]];
                if (TQ && TQ.ts < log.ts) {
                    let [sum, sumTQ] = [0, 0];
                    if (TQ_pd.pd1) [sum, sumTQ] = [sum + TQ.tq1*TQ_pd.pd1, sumTQ + TQ.tq1];
                    if (TQ_pd.pd2) [sum, sumTQ] = [sum + TQ.tq2*TQ_pd.pd2, sumTQ + TQ.tq2];
                    if (TQ_pd.pd3) [sum, sumTQ] = [sum + TQ.tq3*TQ_pd.pd3, sumTQ + TQ.tq3];
                    if (TQ_pd.pd4) [sum, sumTQ] = [sum + TQ.tq4*TQ_pd.pd4, sumTQ + TQ.tq4];
                    if (TQ_pd.pd5) [sum, sumTQ] = [sum + TQ.tq5*TQ_pd.pd5, sumTQ + TQ.tq5];
                    if (TQ_pd.pd6) [sum, sumTQ] = [sum + TQ.tq6*TQ_pd.pd6, sumTQ + TQ.tq6];
                    log.TQ_del = (sumTQ) ? decimalAdjust(sum/sumTQ, 6) : 0;
                }
                else log.TQ_del = 0;
            }
        }
        else log.TQ_del = 0;
    }
    return;
}

function Fit_PnL_Result(params){
    let [cumsum, DD, maxDD, resCoef, pnl, sharp, cnt_long, cnt_short] = [[], [], 0, 0, 0, 0, 0, 0];
    let res = {params: JSON.parse(JSON.stringify(params)), pnl:0, maxDD:0, resCoef:0, sharp:0, cnt_long:0, cnt_short:0};
    if (global.trans.length > 0) {
        const days = Math.floor((global.pre_logs[global.pre_logs.length-1].ts - global.pre_logs[0].ts)/24/3600000);
        let d_sharp = (new Array(days+1)).fill(0, 0);

        const tran = global.trans[0];
        let cumMax = Math.max(tran.pnl, 0);
        let cs = tran.pnl;
        cumsum.push(cs);
        DD.push(cumMax-cs);
        maxDD = cumMax-cs;
        d_sharp[tran.day] += tran.pnl;
        if(tran.type === 1) cnt_long++;
        else cnt_short++;

        let pnl_sum = tran.pnl;

        for (let t = 1; t < global.trans.length; t++) {
            const tran = global.trans[t];
            cs = tran.pnl + cumsum[t-1];
            cumsum.push(cs);
            if (cs > cumMax) cumMax = cs;
            let dd = cumMax-cs;
            DD.push(dd);
            if (dd > maxDD) maxDD = dd;
            d_sharp[tran.day] += tran.pnl;
            pnl_sum += tran.pnl;
            if(tran.type === 1) cnt_long++;
            else cnt_short++;
        }
        let mean_db = pnl_sum/(days+1);
        sharp = SQRT * mean_db / Math.sqrt(d_sharp.reduce((a,c) => a+(c-mean_db)*(c-mean_db), 0)/(days+1));
        resCoef = sharp - Math.max(3 - 2*global.trans.length/(days+1), 0);
        pnl = cumsum[cumsum.length-1];
        res.pnl = pnl;
        res.maxDD = maxDD;
        res.resCoef = resCoef;
        res.sharp = sharp;
        res.cnt_long = cnt_long;
        res.cnt_short = cnt_short;
    }
    return res;
}

function Hide_Duplets_Swing_Commands (cmds) {
    let ret = [];
    let last_ts = cmds[0].ts;
    for (let i = 1; i < cmds.length; i++) {
        let cmd = cmds[i];
        if (cmds[i].ts !== last_ts) {
            last_ts = cmds[i].ts;
            ret.push(cmd);
        }
    }
    return ret;
}

function Fit_Globals_for_PnL(moda, pars){
    if (moda === 'PNL') {
        global.params.p1 = pars[0];
        global.params.p2 = pars[1];
        global.params.p3 = pars[2];
        global.params.p4 = pars[3];
        global.params.p5 = pars[4];
        global.params.p6 = pars[5];
        global.params.p7 = pars[6];
        global.params.p8 = pars[7];
        global.params.p9 = pars[8];
        global.params.p10 = pars[9];

        math.market.Env(pars[10]);
        if (global.params.p1 === 0) global.params.p1 = Number.MAX_SAFE_INTEGER;
    }
    else if (moda === 'SWG') {
        global.params.BEP_X = (!Number.isNaN(pars[13]) && pars[13] !== undefined) ? pars[13] : 1;
        global.params.SWINGS_SL_CANCEL = (!Number.isNaN(pars[16]) && pars[16] !== undefined) ? pars[16] : 0;

        let emarfemit = (pars[0] || '1h').split("").reverse().join("");
        let base = 3600;
        switch (emarfemit.substring(0, 1)) {
            case 'm':
                base = 60;
                break;
            case 'h':
                base = 3600;
                break;
            case 'd':
                base = 3600*24;
                break;
            case 'w':
                base = 3600*24*7;
                break;
            case 'M':
                base = 3600*24*28;
                break;
        }
        let quote = +((emarfemit.substring(1)).split("").reverse().join(""));
        if (!Number.isInteger(quote)) quote = 1;

        global.params.granule_sec = base*quote;
    }
    
    global.market_status = {OP: {}, type: 0, CHP: [{last_price: 0, type: 0, ufs: [{cid: 0, b_ts: 0, type: 0, moi: 0, close_ts: 1, filled: -1}]}]};
    global.logs = [];
    global.queue = [];
    global.pre_queue = [];
    global.trans = [];
    global.sequence = 0;
    global.pause = 0b0;

    global.wallet = +(process.env.WALLET || '0');
    global.current_risk_money = 0;

    global.market = {orders: {}, loans: 0, sequence: 0, ts_start: 0, ts_end: 0, ticks: []};

    for (let i = 0; i < global.batch_ticks_array.length; i++) {
        let tick = global.batch_ticks_array[i];
        tick.coin = tick.origin_coin;
    }
    global.gc();
}

function Fit_PreLogs_HL_for_PnL(){
    let logs = global.pre_logs;
    let ticks = global.batch_ticks_array;
    if (global.pre_logs.length > 0) {
        let pTick = connectors.db_market.get_tick(logs[0].ts, global.batch_ticks, global.batch_ticks_array).i;
        let [high, low] = [ticks[pTick].price, ticks[pTick].price];
        for (let i = 0; i < global.pre_logs.length && pTick < ticks.length; i++) {
            let log = global.pre_logs[i];
            while (ticks[pTick].ts*1000 < log.ts + global.env_total.MARKET_DELAY) {
                if(ticks[pTick].price > high) high = ticks[pTick].price;
                if(ticks[pTick].price < low) low = ticks[pTick].price;
                pTick++;
                if(pTick >= ticks.length) break;
            }

            log.high = high;
            log.low = low;
            high = (pTick >= ticks.length) ? ticks[ticks.length-1].price : ticks[pTick].price;
            low = high;
        }
    }
}

function Fit_PreLogs_for_Swing_PnL(cmds) {
    let cmd_i = 0;
    while (cmd_i < cmds.length && cmds[cmd_i].ts < global.pre_logs[0].ts) cmd_i++;
    if (cmd_i < cmds.length) {
        for (let i = 0; i < global.pre_logs.length && cmd_i < cmds.length; i++) {
            let log = global.pre_logs[i];
            log.swing = null;
            if (cmd_i < cmds.length && cmds[cmd_i].ts === log.ts) {
                log.swing = cmds[cmd_i];
                cmd_i++;
            }
        }
    }
}

function Fit_PreLogs_WP_for_PnL(){
    let p9 = global.params.p9;
    if (global.pre_logs.length > 0) {
        let logs = global.pre_logs;
        let ticks = global.batch_trend_ticks_array;

        let ts_start = Math.floor(logs[0].ts - p9*24*3600000);
        let tick_start_idx_prev = connectors.db_market.get_tick(ts_start, global.batch_trend_ticks, global.batch_trend_ticks_array).i;
        let tick_end_idx_prev = connectors.db_market.get_tick(logs[0].ts, global.batch_trend_ticks, global.batch_trend_ticks_array).i;

        let [sum, coin] = [0, 0];
        for (let j = tick_start_idx_prev; j < tick_end_idx_prev; j++) {
            const tick = ticks[j];
            sum += tick.price*tick.origin_coin;
            coin += tick.origin_coin;
        }
        logs[0].weight_price = sum/coin;

        for (let i = 1; i < logs.length; i++) {
            ts_start = Math.floor(logs[i].ts - p9*24*3600000);
            let tick_start_idx = connectors.db_market.get_tick(ts_start, global.batch_trend_ticks, global.batch_trend_ticks_array).i;
            let tick_end_idx = connectors.db_market.get_tick(logs[i].ts, global.batch_trend_ticks, global.batch_trend_ticks_array).i;
            let [sum_left, coin_left, sum_right, coin_right] = [0, 0, 0, 0];
            for (let j = tick_start_idx_prev; j < tick_start_idx; j++) {
                const tick = ticks[j];
                sum_left += tick.price*tick.origin_coin;
                coin_left += tick.origin_coin;
            }
            for (let j = tick_end_idx_prev; j < tick_end_idx; j++) {
                const tick = ticks[j];
                sum_right += tick.price*tick.origin_coin;
                coin_right += tick.origin_coin;
            }
            sum += sum_right - sum_left;
            coin += coin_right - coin_left;
            logs[i].weight_price = sum/coin;
            // let wp = connectors.db_market.GetWeightPrice(ts_start, logs[i].ts);
            // console.log(`wpn: ${logs[i].weight_price}, wp: ${wp}`);
            tick_start_idx_prev = tick_start_idx;
            tick_end_idx_prev = tick_end_idx;
        }
    }
}

function Init_Time_Tracker(){
    return {
        last_price: [],
        order_submit: [],
        order_cancel: [],
        order_status: [],

        order_status_1: [],
        order_status_2: [],
        order_status_3: [],
        order_status_4: [],

        repay: [],
        pos_submit: [],
        tp_submit: [],
        sl_submit: [],

        Check_Pos_Was_Closed: [],
        Check_Pos_To_Close: [],

        Let_Return_Money: [],
        Let_Open_Order: [],
        Let_Cancel_Order: [],
        Finalize_Cancelled_Order: [],
        Let_Open_TPSL: [],
        Finalize_TPSL: [],
        ClosePos: [],

        Let_Cancel_TPSL         : [],
        Let_Cancel_TP           : [],
        Finalize_Cancelled_TPSL : [],
        Let_Close_Pos           : [],
        Finalize_Close_Pos      : [],

        Let_Prepare_Order_To_Open: [],

        Let_Close_Pos_1           : [],
        Let_Close_Pos_2           : [],
        Let_Close_Pos_3           : []
    }
}

function Pnl_to_Tbl() {
    return global.pnls.map(c => {
        return {
            p1:(c.params.p1 === Number.MAX_SAFE_INTEGER) ? 0 : c.params.p1,
            p2:c.params.p2,
            p3:c.params.p3,
            p4:c.params.p4,
            p5:c.params.p5,
            p6:c.params.p6,
            p7:c.params.p7,
            p8:c.params.p8,
            p9:c.params.p9,
            p10:c.params.p10,
            reg_rev_expired_time:Math.floor(c.params.env.REG_REV_EXPIRED_TIME/1000),
            accuracy_filter : c.params.env.ACCURACY_FILTER,
            accuracy_level  : c.params.env.ACCURACY_LEVEL,
            accuracy_field  : c.params.env.ACCURACY_FIELD,
            volatility_tpsl_filter      : c.params.env.DYNAMIC_SLTP,
            volatility_tp_level         : c.params.env.DYNAMIC_SLTP_TP_COEFF,
            volatility_sl_level         : c.params.env.DYNAMIC_SLTP_SL_COEFF,
            volatility_tpsl_field       : c.params.env.DYNAMIC_SLTP_FIELD,
            pnl:decimalAdjust(c.pnl, 5),
            maxDD:decimalAdjust(c.maxDD, 5),
            resCoef:decimalAdjust(c.resCoef, 5),
            sharp:decimalAdjust(c.sharp, 5),
            cnt_long: c.cnt_long,
            cnt_short: c.cnt_short
        };
    });
}

function Pnl_to_Tbl_Sw() {
    return global.pnls.map(c => {
        return {
            timeframe           : c.params.timeframe,
            atr                 : c.params.atr,
            bar_high_low        : c.params.bar_high_low,
            section_high_low    : c.params.section_high_low,
            numbers_to_inverse  : c.params.numbers_to_inverse,
            min_wave            : c.params.min_wave,
            atr_hl_coeff        : c.params.atr_hl_coeff,
            atr_oc_coeff        : c.params.atr_oc_coeff,
            max_gap             : c.params.max_gap,
            max_overlap         : c.params.max_overlap,
            min_swing_percent   : c.params.min_swing_percent,
            max_swing_percent   : c.params.max_swing_percent,
            max_breakout_atr    : c.params.max_breakout_atr,

            pnl:decimalAdjust(c.pnl, 5),
            maxDD:decimalAdjust(c.maxDD, 5),
            resCoef:decimalAdjust(c.resCoef, 5),
            sharp:decimalAdjust(c.sharp, 5),
            cnt_long: c.cnt_long,
            cnt_short: c.cnt_short
        };
    });
}

function PnlResult() {
    let tbl = null;
    if (process.env.SWINGS_ENABLE !== '1') tbl = Pnl_to_Tbl();
    else tbl = Pnl_to_Tbl_Sw();

    let file = '';
    if (tbl.length === 1) {
        global.trans.map(c => c.open_dt = (new Date(c.ts_open)).toISOString().replace(/T/g, ' ').substr(0, 19));
        global.trans.map(c => c.close_dt = (new Date(c.ts)).toISOString().replace(/T/g, ' ').substr(0, 19));
        global.trans.map(c => c.dur = Math.round((c.ts - c.ts_open) / 60000), 2);
        file = csv.ObjectsToCSVString(global.trans);
    }
    else if (tbl.length > 1) {
        file = csv.ObjectsToCSVString(tbl);
        if (file.length > 0 && file[file.length - 1] === '\n')
            file = file.substring(0, file.length - 1);
    }
    return file;
}

async function PnlExec(api_name, strt, body, cb) {
    let a = (global.in_progress >>> 16);
    if (a === 0x0000FFFF){
        global.in_progress = a;
        global.pnls = [];

        if (Array.isArray(body) && body.length > 0){
            for (let p = 0; p < body.length; p++) {
                console.log(`----------------------------\t${p}\t----------------------`);
                const pars = body[p];
                if (!Array.isArray(pars) || pars.length < 11) continue;
                let _strt = new Date();
                Fit_Globals_for_PnL('PNL', pars);

                if (global.params.p9 !== global.p9_trend) Fit_PreLogs_WP_for_PnL();

                global.p9_trend = global.params.p9;
                [date_start, date_end] = [global.pre_logs[0].ts, global.pre_logs[global.pre_logs.length - 1].ts];
                global.market.ts_start = date_start;
                global.market.ts_end = date_start;

                /*************************************/
                if (TIME_TRACKER === 1) global.time_tracker = Init_Time_Tracker();

                /**
                 * Under NDA
                 */

                let _p = Fit_PnL_Result(global.params);

                global.pnls.push(_p);

                /*************************************/
                if (TIME_TRACKER === 1) {
                    let time_tracker = Get_Time_Tracker();
                    await logging(_strt, `${api_name}.TIME.TRECKER`, time_tracker);
                }

                await logging(strt, `${api_name}.POINT`, _p);
                /*************************************/
                // await MemoryUsage(`Get_Time_Tracker.${api_name}`, strt);

            }
            if (cb) await cb();
            console.log('PNL.DONE =====================================')
            await logging(strt, api_name, {message: `Points count: (${body.length})`});
        }
        else await logging(strt, api_name, {message: `Points are absent`});
        global.in_progress = 0xFFFF0000;
    }
    return;
}

async function SwingPnlExec(api_name, strt, body, cb) {
    let a = (global.in_progress >>> 16);
    if (a === 0x0000FFFF){
        global.in_progress = a;
        global.pnls = [];

        if (Array.isArray(body) && body.length > 0){
            console.log(`\nPNL_SWING.START ========== (${body.length}) points ===========================`)
            for (let p = 0; p < body.length; p++) {
                console.log(`----------------------------\t${p}\t----------------------`);
                const pars = body[p];

                if (!Array.isArray(pars) || pars.length < 16) continue;

                let sw = {
                    timeframe: pars[0],
                    atr: pars[1],
                    bar_high_low: pars[2],
                    section_high_low: pars[3],
                    numbers_to_inverse: pars[4],
                    min_wave: pars[5],
                    atr_hl_coeff: pars[6],
                    atr_oc_coeff: pars[7],
                    max_gap: pars[8],
                    max_overlap: pars[9],
                    min_swing_percent: pars[10],
                    max_swing_percent: pars[11],
                    max_breakout_atr: pars[12],
                    // BEP_X: pars[13],
                    ts_start: Math.round(BATCH_TS_START/1000),
                    ts_end: Math.round(BATCH_TS_END/1000),
                    base: process.env.BASE,
                    quote: process.env.QUOTE,
                    fibo_tp: pars[14] || FIBO_TP,
                    tpsl_factor: pars[15] || 3,
                    // SWINGS_SL_CANCEL: pars[16],
                    need_confirmation: (pars[17] === undefined) ? 1 : pars[17]
                };
                // global.sw_obj
                let sw_keys = Object.keys(sw);
                let diff = false;
                for (let swi = 0; swi < sw_keys.length; swi++) {
                    if (sw[sw_keys[swi]] !== global.sw_obj.sw[sw_keys[swi]]) {
                        diff = true;
                        break;
                    }
                }
                let cmds = global.sw_obj.cmds;
                // if (diff) {
                    cmds = (await connectors.swings.GetSwingCommands(sw));
                    global.sw_obj.cmds = cmds;
                    global.sw_obj.sw = sw;
                // }
                await logging(strt, api_name, {message: `Swing points count: (${cmds.length})`});
                if (cmds.length !== 0) {

                    cmds = Hide_Duplets_Swing_Commands(cmds);
                    Fit_Globals_for_PnL('SWG', pars);
                    Fit_PreLogs_for_Swing_PnL(cmds);

                    [date_start, date_end] = [global.pre_logs[0].ts, global.pre_logs[global.pre_logs.length - 1].ts];
                    global.market.ts_start = date_start;
                    global.market.ts_end = date_start;

                    /*************************************/
                    /**
                     * Under NDA
                     */

                }

                let _p = Fit_PnL_Result(sw);

                global.pnls.push(_p);

                await logging(strt, `${api_name}.POINT`, _p);
            }
            if (cb) await cb();
            console.log('PNL_SWING.DONE =====================================')
            await logging(strt, api_name, {message: `Points count: (${body.length})`});
        }
        else await logging(strt, api_name, {message: `Points are absent`});
        global.in_progress = 0xFFFF0000;
    }
    return;
}

module.exports.pnl_result = function(req, res){
    let a = (global.in_progress >>> 16);
    if (a === 0x0000FFFF && global.pnls && global.pnls.length > 0){
        let url_parts = url.parse(req.url, true);
        let file = PnlResult();

        let aszip = +(url_parts.query.aszip || '');
        if (aszip === 1) {
            let start = (new Date(global.params.ranges[0][0])).toISOString().replace(/T/g, '_').substr(0, 19).replace(/:/g, '-');
            let end = (new Date(BATCH_TS_END)).toISOString().replace(/T/g, '_').substr(0, 19).replace(/:/g, '-');
            let zipper = new zip();
            zipper.addFile(`${start}______${end}.csv`, new Buffer.alloc(file.length, file));
            let content = zipper.toBuffer();
            res.setHeader('Content-disposition', `attachment; filename=${ORACLE_NAME}.zip`);
            res.set('Content-Type', 'application/zip').set('Content-disposition', `attachment; filename=${ORACLE_NAME}.zip`).status(200).send(content);
        }
        else {
            res.set('Content-Type', 'text/csv').status(200).send(file);
        }
    }
    else res.status(204).send();
}

module.exports.pnl = async function(req, res) {
    let [api_name, strt] = ['PNL.RUN', Date.now()];
    res.status(204).send();

    if (!global.init_done) return;

    let body = take_body(req, res);
    if (body.error) {
        console.log(JSON.stringify(body));
        return;
    }

    await PnlExec(api_name, strt, body, null);
    return;
}

module.exports.swing_pnl = async function(req, res) {
    let [api_name, strt] = ['PNL_SWING.RUN', Date.now()];
    res.status(204).send();

    if (!global.init_done) return;

    let body = take_body(req, res);
    if (body.error) {
        console.log(JSON.stringify(body));
        return;
    }
    global.trans = [];
    await SwingPnlExec(api_name, strt, body, null);
    return;
}

module.exports.pnl_ex = async function(req, res) {
    let [api_name, strt] = ['PNLEX.RUN', Date.now()];
    res.status(204).send();

    if (!global.init_done) return;

    await connectors.db_logs.DeleteExperiment('PNLPOINT');
    let body = await connectors.db_logs.GetPnlPoints();

    if (!Array.isArray(body) || body.length === 0) {
        console.log(JSON.stringify(body));
        return;
    }

    // let debug_body = body.slice(0, 10);

    let cb = async function () {
        let file = PnlResult();
        await connectors.db_logs.SetPnlResults(file);
    }

    await PnlExec(api_name, strt, body, cb);

    return;
}

module.exports.init_old = async function(req, res){
    let [api_name, strt] = ['PNL.LOAD', Date.now()];
    res.status(204).send();
    await MemoryUsage(api_name, strt);

    // let hr = process.hrtime();
    // console.log(hr, hr[0] * 1000000 + hr[1] / 1000);
    // console.log(process.hrtime.bigint());

    let date_start = BATCH_TS_START;
    
    let date_end = BATCH_TS_END;
    let P9 = Math.floor((+(process.env.MAX_P9 || '9'))*24*3600000);

    global.pre_logs = await connectors.db_logs.GetLogs(date_start, date_end);
    await logging(strt, api_name, {message: `Logs were Loaded (${global.pre_logs.length})`});
    if (global.pre_logs.length === 0) process.exit(1);

    if (global.params.env.CLOSE_COMMAND_TQ === 1) global.TQs = await connectors.db_logs.GetTQs();

    [date_start, date_end] = [global.pre_logs[0].ts, global.pre_logs[global.pre_logs.length - 1].ts];

    if (PRICE_INDENT_ENABLE === 1) {
        global.AB = (await connectors.db_market.GetAB(date_start, date_end + 60000));
        Fit_PreLogs_toAB(global.pre_logs, global.AB);
    }

    let learn_dist = await connectors.db_logs.GetLearnDIst_s(date_start-120000, date_end+120000);
    await logging(strt, api_name, {message: `LearnDIst were Loaded (${learn_dist.length})`});
    Fit_LN_toLogs(learn_dist);

    let vols = await connectors.db_market.GetVols(date_start, date_end);
    Fit_Vols_toLogs(vols);
    if (global.params.env.CLOSE_COMMAND_TQ === 1) {
        let TQ_pds = await connectors.db_logs.GetTQ_PDs(date_start, date_end);
        await logging(strt, api_name, {message: `TQ_PDs were Loaded (${TQ_pds.length})`});
        Fit_TQ_PDs_toLogs(TQ_pds);
    }

    await connectors.db_market.GetTrendTicksBatch(date_start - P9, date_end + 1000);
    await connectors.db_market.GetTicksBatch(date_start - P9, date_end + 1000);

    Fit_PreLogs_HL_for_PnL();

    await logging(strt, api_name, {message: `Ticks were Loaded (${global.batch_ticks_array.length})`});
    await MemoryUsage(api_name, strt);
    global.init_done = true;
}

function Pre_Logs(date_start, date_end) {
    let pre_logs = [];
    let dt = Math.floor(date_start/60000)*60000;
    for (let i = 0; dt+i*60000 < date_end; i++) {
        pre_logs.push({ts: dt+i*60000});
    }
    return pre_logs;
}

module.exports.init = async function(req, res){
    let [api_name, strt] = ['PNL.LOAD', Date.now()];
    res.status(204).send();
    await MemoryUsage(api_name, strt);

    // let hr = process.hrtime();
    // console.log(hr, hr[0] * 1000000 + hr[1] / 1000);
    // console.log(process.hrtime.bigint());

    let date_start = BATCH_TS_START;
    
    let date_end = BATCH_TS_END;
    let P9 = Math.floor((+(process.env.MAX_P9 || '9'))*24*3600000);

    if (process.env.SWINGS_ENABLE === '1') global.pre_logs = Pre_Logs(date_start, date_end);
    else global.pre_logs = await connectors.db_logs.GetLogs(date_start, date_end);

    await logging(strt, api_name, {message: `Logs were Loaded (${global.pre_logs.length})`});
    if (global.pre_logs.length === 0) process.exit(1);

    if (global.params.env.CLOSE_COMMAND_TQ === 1) global.TQs = await connectors.db_logs.GetTQs();

    if (process.env.SWINGS_ENABLE !== '1') {
        [date_start, date_end] = [global.pre_logs[0].ts, global.pre_logs[global.pre_logs.length - 1].ts];

        if (PRICE_INDENT_ENABLE === 1) {
            global.AB = (await connectors.db_market.GetAB(date_start, date_end + 60000));
            Fit_PreLogs_toAB(global.pre_logs, global.AB);
        }
        if (PRICE_GRAY_ENABLE === 1) {
            global.Gray = (await connectors.db_market.GetGray(date_start, date_end + 60000));
            Fit_PreLogs_toGray(global.pre_logs, global.Gray);
        }
        if (SWING_FILTER_ENABLE === 1) {
            global.Swings = (await connectors.db_market.GetSwings(date_start, date_end));
            Fit_Swings_toLogs(global.Swings);
        }

        let learn_dist = await connectors.db_logs.GetLearnDIst_s(date_start-120000, date_end+120000);
        await logging(strt, api_name, {message: `LearnDIst were Loaded (${learn_dist.length})`});
        Fit_LN_toLogs(learn_dist);

        let vols = await connectors.db_market.GetVols(date_start, date_end);
        Fit_Vols_toLogs(vols);
        if (global.params.env.CLOSE_COMMAND_TQ === 1) {
            let TQ_pds = await connectors.db_logs.GetTQ_PDs(date_start, date_end);
            await logging(strt, api_name, {message: `TQ_PDs were Loaded (${TQ_pds.length})`});
            Fit_TQ_PDs_toLogs(TQ_pds);
        }

        await connectors.db_market.GetTrendTicksBatch(date_start - P9, date_end + 1000);
    }
    await connectors.db_market.GetTicksBatch(date_start - P9, date_end + 1000);
    await logging(strt, api_name, {message: `Ticks were Loaded (${global.batch_ticks_array.length})`});

    if (process.env.SWINGS_ENABLE !== '1') Fit_PreLogs_HL_for_PnL();

    await MemoryUsage(api_name, strt);
    global.gc();
    global.init_done = true;
}

module.exports.batch_old = async function(req, res){
    let [api_name, strt] = ['BATCH.LOAD', Date.now()];
    res.status(204).send();
    await MemoryUsage(api_name, strt);

    let date_start = BATCH_TS_START;
    let date_end = Date.now();
    let P9 = Math.floor((+(process.env.MAX_P9 || '9'))*24*3600000);

    await connectors.db_market.GetTrendTicksBatch(date_start - P9, date_end + 1000);

    global.pre_logs = await connectors.db_logs.GetLogs(date_start, date_end);
    await logging(strt, api_name, {message: `Logs were Loaded (${global.pre_logs.length})`});

    if (global.pre_logs.length === 0) process.exit(1);
    [date_start, date_end] = [global.pre_logs[0].ts, global.pre_logs[global.pre_logs.length - 1].ts];

    if (PRICE_INDENT_ENABLE === 1) {
        global.AB = (await connectors.db_market.GetAB(date_start, date_end + 60000));
        Fit_PreLogs_toAB(global.pre_logs, global.AB);
    }
    if (global.params.env.CLOSE_COMMAND_TQ === 1) global.TQs = await connectors.db_logs.GetTQs();

    let learn_dist = await connectors.db_logs.GetLearnDIst_s(date_start-120000, date_end+120000);
    await logging(strt, api_name, {message: `LearnDIst were Loaded (${learn_dist.length})`});
    Fit_LN_toLogs(learn_dist);

    let vols = await connectors.db_market.GetVols(date_start, date_end);
    Fit_Vols_toLogs(vols);
    let TQ_pds = [];
    if (global.params.env.CLOSE_COMMAND_TQ === 1) {
        TQ_pds = await connectors.db_logs.GetTQ_PDs(date_start, date_end);
        await logging(strt, api_name, {message: `TQ_PDs were Loaded (${TQ_pds.length})`});
        Fit_TQ_PDs_toLogs(TQ_pds);
    }

    global.market.ts_start = date_start;
    global.market.ts_end = date_start;
    let LOG_BATCH_COUNT = Math.ceil(global.pre_logs.length/BATCH_SIZE) - 1;
    for(let bx = 0; bx < LOG_BATCH_COUNT; bx++) {
        await ExecuteBatch(bx*BATCH_SIZE, (bx+1)*BATCH_SIZE - 1);
    }
    await ExecuteBatch(LOG_BATCH_COUNT*BATCH_SIZE, global.pre_logs.length - 1);
    await logging(strt, api_name, { message: `Done 1 Time` });

    [date_start, date_end] = [global.pre_logs[global.pre_logs.length-1].ts + 1, Date.now()];
    global.pre_logs = await connectors.db_logs.GetLogs(date_start, date_end);
    await logging(strt, api_name, {message: `Logs were Loaded (${global.pre_logs.length})`});

    if (PRICE_INDENT_ENABLE === 1) {
        global.AB = (await connectors.db_market.GetAB(date_start, date_end + 60000));
        Fit_PreLogs_toAB(global.pre_logs, global.AB);
    }
    await connectors.db_market.GetTrendTicksBatch(date_start - P9, date_end + 1000);

    learn_dist = await connectors.db_logs.GetLearnDIst_s(date_start-120000, date_end+120000);
    await logging(strt, api_name, {message: `LearnDIst were Loaded (${learn_dist.length})`});
    Fit_LN_toLogs(learn_dist);

    vols = await connectors.db_market.GetVols(date_start, date_end);
    Fit_Vols_toLogs(vols);
    if (global.params.env.CLOSE_COMMAND_TQ === 1) {
        TQ_pds = await connectors.db_logs.GetTQ_PDs(date_start, date_end);
        await logging(strt, api_name, {message: `TQ_PDs were Loaded (${TQ_pds.length})`});
        Fit_TQ_PDs_toLogs(TQ_pds);
    }

    await ExecuteBatch(0, global.pre_logs.length - 1);
    await logging(strt, api_name, { message: `Done 2 Time` });

    if (global.pre_logs.length > 2) {
        [date_start, date_end] = [global.pre_logs[global.pre_logs.length-1].ts + 1, Date.now()];
        global.pre_logs = await connectors.db_logs.GetLogs(date_start, date_end);
        await logging(strt, api_name, {message: `Logs were Loaded (${global.pre_logs.length})`});

        if (PRICE_INDENT_ENABLE === 1) {
            global.AB = (await connectors.db_market.GetAB(date_start, date_end + 60000));
            Fit_PreLogs_toAB(global.pre_logs, global.AB);
        }
        await connectors.db_market.GetTrendTicksBatch(date_start - P9, date_end + 1000);

        learn_dist = await connectors.db_logs.GetLearnDIst_s(date_start-120000, date_end+120000);
        await logging(strt, api_name, {message: `LearnDIst were Loaded (${learn_dist.length})`});
        Fit_LN_toLogs(learn_dist);

        vols = await connectors.db_market.GetVols(date_start, date_end);
        Fit_Vols_toLogs(vols);
        if (global.params.env.CLOSE_COMMAND_TQ === 1) {
            TQ_pds = await connectors.db_logs.GetTQ_PDs(date_start, date_end);
            await logging(strt, api_name, {message: `TQ_PDs were Loaded (${TQ_pds.length})`});
            Fit_TQ_PDs_toLogs(TQ_pds);
        }
        
        await ExecuteBatch(0, global.pre_logs.length - 1);
        await logging(strt, api_name, { message: `Done 2A Time` });
    }

    let attemptions = 7;

    [date_start, date_end] = [global.pre_logs[global.pre_logs.length-1].ts + 1, Date.now()];
    await connectors.db_market.GetTrendTicksBatch(date_start - P9, date_end + 1000);

    while (attemptions) {
        global.pre_logs = await connectors.db_logs.GetLogs(date_start, date_end);
        await logging(strt, api_name, {message: `Logs were Loaded (${global.pre_logs.length})`});

        learn_dist = await connectors.db_logs.GetLearnDIst_s(date_start-120000, date_end+120000);
        await logging(strt, api_name, {message: `LearnDIst were Loaded (${learn_dist.length})`});
        Fit_LN_toLogs(learn_dist);

        vols = await connectors.db_market.GetVols(date_start, date_end);
        Fit_Vols_toLogs(vols);
        if (global.params.env.CLOSE_COMMAND_TQ === 1) {
            TQ_pds = await connectors.db_logs.GetTQ_PDs(date_start, date_end);
            await logging(strt, api_name, {message: `TQ_PDs were Loaded (${TQ_pds.length})`});
            Fit_TQ_PDs_toLogs(TQ_pds);
        }
    
        if (global.pre_logs.length === 0) {
            await sleep(10000);
            attemptions--;
            continue;
        }
        else {    
            await ExecuteBatch(0, global.pre_logs.length - 1);
            await logging(strt, api_name, { message: `Done 3 Time` });
            global.ignore_logs = false;
            await math.market.Serialize();
            break;
        }
    }
}


module.exports.batch = async function(req, res){
    let [api_name, strt] = ['BATCH.LOAD', Date.now()];
    res.status(204).send();
    await MemoryUsage(api_name, strt);
    let [learn_dist, vols, TQ_pds] = [null, null, null];
    let [date_start, date_end] = [0, 0];
    let i = (WORK_ONLY === 1) ? global.params.ranges.length - 1 : 0;
    for (; i < global.params.ranges.length; i++) {
        let r = global.params.ranges[i];
        if (r[1] !== 0) {
            date_start = r[0];
            date_end = r[1];
            NullizeGlobal_before_Batch();

            await batch_partial(api_name, date_start, date_end, strt);
            // TODO hard Stop
            let queue = global.queue;
            let market_status = global.market_status;
            let op_keys = Object.keys(market_status.OP);
            if (op_keys.length > 0){
                queue.length = 0;
                global.pre_queue.length = 0;
                for (let o = op_keys.length - 1; o >= 0; o--) {
                    let ord = market_status.OP[op_keys[o]];
                    for (let m = 0; m < ord.POSs.length; m++) {
                        let pos = ord.POSs[m];
                        if (!queue.find(c => c.task_name === 'CLOSE_POS' && c.obj.ref_cid === ord.cid && c.obj.idx === pos.idx)) {
                            pos.cause = 'HRD';
                            pos.to_close = 0;
                            queue.push({task_name: 'CLOSE_POS', obj: pos, done: 0});
                        }
                    }
                }
                console.log(`DEBUG: queue.length = ${queue.length}, ${Date.now()}`);
                if(queue.length > 0) await math.market.Emptify();
                console.log(`DEBUG: 2 queue.length = ${queue.length}, ${Date.now()}`);
                await logging(global.pause_strt, "CMD.PAUSE_RESUME", {m: "HARD STOPPED"});
                if(queue.length > 0) await math.market.Emptify();
                console.log(`DEBUG: 3 queue.length = ${queue.length}, ${Date.now()}`);
            }
    
            await math.market.Serialize();
        }
        else {
            date_start = r[0];
            NullizeGlobal_before_Batch();
            await batch_partial(api_name, date_start, Date.now(), strt);
        }
    }
    await logging(strt, api_name, { message: `Done 1 Time` });

    if (global.pre_logs.length > 0) {
        [date_start, date_end] = [global.pre_logs[global.pre_logs.length-1].b_ts + 1, Date.now()];
        await batch_partial(api_name, date_start, date_end, strt);
        await logging(strt, api_name, { message: `Done 2 Time` });
    }

    let attemptions = 7;

    while (attemptions) {
        if (global.pre_logs.length === 0) {
            await sleep(10000);
            attemptions--;
            continue;
        }
        else {    
            [date_start, date_end] = [global.pre_logs[global.pre_logs.length-1].b_ts + 1, Date.now()];
            await batch_partial(api_name, date_start, date_end, strt);
            await logging(strt, api_name, { message: `Done 3 Time` });
            await math.market.Serialize();
            await math.market.SerializeCheckPoints();
            global.ignore_logs = false;
            break;
        }
    }
}

module.exports.logs = async function(req, res) {
    res.status(204).send();

    if (global.ignore_logs) return;

    let body = take_body(req, res);
    if (body.error) {
        console.log(JSON.stringify(body));
        return;
    }
    let pipe = body[process.env.PIPE];

    if (!pipe) return;

    let P9 = (global.params) ? Math.floor(global.params.p9*24*3600000) : 864000000;

    let inverse = +(process.env.INVERSE || '');
    let log = {};
    try {
        let ACCURACY_FIELD = global.params.env.ACCURACY_FIELD;
        let [b_ts, price, price_del, accuracy] = [
            (+body.ts)*1000 || Date.now(), +pipe.price, +pipe[process.env.MODEL].price_del,
            +pipe[process.env.MODEL][ACCURACY_FIELD]
        ];
        if (inverse === 1) price_del = - price_del;

        log = { ts: b_ts, b_ts, price, original_price: price, price_del, accuracy, vol_del: 0 };
        log[ACCURACY_FIELD] = log.accuracy;

        let vol_del = await connectors.db_market.GetVolDel();
        if (vol_del) Object.keys(vol_del).filter(c => c !== "ts").forEach(c => log[c] = vol_del[c] || 0.0);

        log.TQ_del = (global.params.env.CLOSE_COMMAND_TQ === 1) ? await connectors.db_logs.GetTQDel() : 0;
        log.TQ = await connectors.db_logs.GetLastTQ();
        // log.PDV_del = await connectors.db_logs.GetPDVDel();
        log.learn_distance = await connectors.db_logs.GetLearnDist();
        if (SWING_FILTER_ENABLE === 1) log.swing_filter = await connectors.db_market.GetLastSwing();

        let last_price = await connectors.market.last_price(log.ts);
        if (last_price !== 0) log.price = last_price;
        log.avg_last_5m_coins = await connectors.market.avg_last_5m_coins();
        if (PRICE_GRAY_ENABLE === 1) log.last_day_hl = await connectors.market.last_day_hl(log.ts, log.price);
    }
    catch(error) {
        console.log(`ERROR.LOG: ${JSON.stringify(error)}`);
        return;
    }

    /**
     * Under NDA
     */
}

module.exports.logs_light = async function(req, res) {
    res.status(204).send();

    if (global.ignore_logs) return;

    let P9 = (global.params) ? Math.floor(global.params.p9*24*3600000) : 864000000;

    let inverse = +(process.env.INVERSE || '');
    let log = {};
    try {
        log = await connectors.db_logs.GetLastLog();
        if (!log) {
            console.log(`ERROR.LOG: log is undefined`);
            return;
        }
        if (inverse === 1) log.price_del *= -1;

        let vol_del = await connectors.db_market.GetVolDel();
        if (vol_del) Object.keys(vol_del).filter(c => c !== "ts").forEach(c => log[c] = vol_del[c] || 0.0);

        log.TQ_del = (global.params.env.CLOSE_COMMAND_TQ === 1) ? await connectors.db_logs.GetTQDel() : 0;
        log.TQ = await connectors.db_logs.GetLastTQ();
        // log.PDV_del = await connectors.db_logs.GetPDVDel();
        log.learn_distance = await connectors.db_logs.GetLearnDist();
        if (SWING_FILTER_ENABLE === 1) log.swing_filter = await connectors.db_market.GetLastSwing();

        let last_price = await connectors.market.last_price(log.ts);
        if (last_price !== 0) log.price = last_price;
        log.avg_last_5m_coins = await connectors.market.avg_last_5m_coins();
        if (PRICE_GRAY_ENABLE === 1) log.last_day_hl = await connectors.market.last_day_hl(log.ts, log.price);
    }
    catch(error) {
        console.log(`ERROR.LOG: ${JSON.stringify(error)}`);
        return;
    }

    /**
     * Under NDA
     */
}

module.exports.resume = async function(req, res) {
    let [api_name, strt] = ['CMD.PAUSE_RESUME', Date.now()];
    global.pause = 0;
    // global.ignore_logs = false;
    res.status(204).send();
    if (INTERNAL_RISK_MANAGER === 0) await connectors.account.Get_Money(Number.MAX_SAFE_INTEGER, 0, global.params.p2);
    await logging(strt, api_name, {m: "RESUMED."});
}

module.exports.pause = async function(req, res) {
    global.pause_strt = Date.now();
    global.pause = 1;
    res.status(204).send();
    await logging(global.pause_strt, "CMD.PAUSE_RESUME", {m: "PAUSING ......."});
}

module.exports.stop = async function(req, res) {
    global.pause_strt = Date.now();
    global.pause |= 0b101;
    res.status(204).send();
    await logging(global.pause_strt, "CMD.PAUSE_RESUME", {m: "STOPPING ......."});
}

module.exports.hard_stop = async function(req, res) {
    res.status(204).send();

    let a = (global.hard_stop_in_progress >>> 16);
    if (a === 0x0000FFFF){
        global.hard_stop_in_progress = a;
        global.ignore_logs = true;
        global.is_hard_stop = true;

        global.pause_strt = Date.now();
        await logging(global.pause_strt, "CMD.PAUSE_RESUME", {m: "HARD STOP STARTED ..........."});

        let queue = global.queue;
        console.log(`DEBUG: -1 queue.length = ${queue.length}, ${Date.now()}`);
        let market_status = global.market_status;
        let op_keys = Object.keys(market_status.OP);
        if (op_keys.length > 0){
            queue.length = 0;
            global.pre_queue.length = 0;
            for (let o = op_keys.length - 1; o >= 0; o--) {
                let ord = market_status.OP[op_keys[o]];
                for (let m = 0; m < ord.POSs.length; m++) {
                    let pos = ord.POSs[m];
                    if (!queue.find(c => c.task_name === 'CLOSE_POS' && c.obj.ref_cid === ord.cid && c.obj.idx === pos.idx)) {
                        pos.cause = 'HRD';
                        pos.to_close = 0;
                        queue.push({task_name: 'CLOSE_POS', obj: pos, done: 0});
                    }
                }
            }
        }

        console.log(`DEBUG: queue.length = ${queue.length}, ${Date.now()}`);
        if(queue.length > 0) await math.market.Emptify();
        console.log(`DEBUG: 2 queue.length = ${queue.length}, ${Date.now()}`);
        await logging(global.pause_strt, "CMD.PAUSE_RESUME", {m: "HARD STOPPED"});
        if(queue.length > 0) await math.market.Emptify();
        console.log(`DEBUG: 3 queue.length = ${queue.length}, ${Date.now()}`);
        global.pause |= 0b1111;
        global.ignore_logs = false;
        global.is_hard_stop = false;
        global.hard_stop_in_progress = 0xFFFF0000;
    }
}

function NullizeGlobal_before_Batch() {
    global.batch_ticks = {};
    global.batch_ticks_array = [];
    global.trend_ticks_array = [];
    global.trend_ticks = {};
    global.pre_logs = [];
    global.queue = [];
    global.pre_queue = [];
    global.market = { orders: {}, loans: 0, sequence: global.sequence, ts_start: 0, ts_end: 0, ticks: [] };
}

async function batch_partial(api_name, date_start, date_end, strt) {
    let P9 = Math.floor((+(process.env.MAX_P9 || '9'))*24*3600000);
    await connectors.db_market.GetTrendTicksBatch(date_start - P9, date_end + 24*3600000);
    global.pre_logs = await connectors.db_logs.GetLogs(date_start, date_end);
    await logging(strt, api_name, { message: `Logs were Loaded (${global.pre_logs.length})` });
    if (global.pre_logs.length !== 0) {
        [date_start, date_end] = [global.pre_logs[0].b_ts, global.pre_logs[global.pre_logs.length - 1].b_ts];
        let ab_exists = false;
        if (PRICE_INDENT_ENABLE === 1) {
            global.AB = (await connectors.db_market.GetAB(date_start, date_end + 60000));
            Fit_PreLogs_toAB(global.pre_logs, global.AB);
        }
        if (PRICE_GRAY_ENABLE === 1) {
            global.Gray = (await connectors.db_market.GetGray(date_start, date_end + 60000));
            Fit_PreLogs_toGray(global.pre_logs, global.Gray);
        }
        if (SWING_FILTER_ENABLE === 1) {
            global.Swings = (await connectors.db_market.GetSwings(date_start, date_end));
            Fit_Swings_toLogs(global.Swings);
        }
        if (global.params.env.CLOSE_COMMAND_TQ === 1)
            global.TQs = await connectors.db_logs.GetTQs();
        let learn_dist = await connectors.db_logs.GetLearnDIst_s(date_start - 120000, date_end + 120000);
        await logging(strt, api_name, { message: `LearnDIst were Loaded (${learn_dist.length})` });
        Fit_LN_toLogs(learn_dist);
        let vols = await connectors.db_market.GetVols(date_start, date_end);
        Fit_Vols_toLogs(vols);
        let TQ_pds = [];
        if (global.params.env.CLOSE_COMMAND_TQ === 1) {
            TQ_pds = await connectors.db_logs.GetTQ_PDs(date_start, date_end);
            await logging(strt, api_name, { message: `TQ_PDs were Loaded (${TQ_pds.length})` });
            Fit_TQ_PDs_toLogs(TQ_pds);
        }
        global.market.ts_start = date_start;
        global.market.ts_end = date_start;
        let LOG_BATCH_COUNT = Math.ceil(global.pre_logs.length / BATCH_SIZE) - 1;
        for (let bx = 0; bx < LOG_BATCH_COUNT; bx++) {
            await ExecuteBatch(bx * BATCH_SIZE, (bx + 1) * BATCH_SIZE - 1);
        }
        await ExecuteBatch(LOG_BATCH_COUNT * BATCH_SIZE, global.pre_logs.length - 1);
        await logging(strt, api_name, { message: {date_start, date_end} });
    }
    return;
}

function Get_Time_Tracker() {
    let sum_last_price = global.time_tracker.last_price.reduce((a, c) => a + c, 0);
    let sum_order_submit = global.time_tracker.order_submit.reduce((a, c) => a + c, 0);
    let sum_order_cancel = global.time_tracker.order_cancel.reduce((a, c) => a + c, 0);
    let sum_order_status = global.time_tracker.order_status.reduce((a, c) => a + c, 0);

    let sum_order_status_1 = global.time_tracker.order_status_1.reduce((a, c) => a + c, 0);
    let sum_order_status_2 = global.time_tracker.order_status_2.reduce((a, c) => a + c, 0);
    let sum_order_status_3 = global.time_tracker.order_status_3.reduce((a, c) => a + c, 0);
    let sum_order_status_4 = global.time_tracker.order_status_4.reduce((a, c) => a + c, 0);

    let sum_repay = global.time_tracker.repay.reduce((a, c) => a + c, 0);
    let sum_pos_submit = global.time_tracker.pos_submit.reduce((a, c) => a + c, 0);
    let sum_tp_submit = global.time_tracker.tp_submit.reduce((a, c) => a + c, 0);
    let sum_sl_submit = global.time_tracker.sl_submit.reduce((a, c) => a + c, 0);

    let sum_Check_Pos_Was_Closed = global.time_tracker.Check_Pos_Was_Closed.reduce((a, c) => a + c, 0);
    let sum_Check_Pos_To_Close = global.time_tracker.Check_Pos_To_Close.reduce((a, c) => a + c, 0);

    let sum_Let_Return_Money = global.time_tracker.Let_Return_Money.reduce((a, c) => a + c, 0);
    let sum_Let_Open_Order = global.time_tracker.Let_Open_Order.reduce((a, c) => a + c, 0);
    let sum_Let_Cancel_Order = global.time_tracker.Let_Cancel_Order.reduce((a, c) => a + c, 0);
    let sum_Finalize_Cancelled_Order = global.time_tracker.Finalize_Cancelled_Order.reduce((a, c) => a + c, 0);
    let sum_Let_Open_TPSL = global.time_tracker.Let_Open_TPSL.reduce((a, c) => a + c, 0);
    let sum_Finalize_TPSL = global.time_tracker.Finalize_TPSL.reduce((a, c) => a + c, 0);
    let sum_ClosePos = global.time_tracker.ClosePos.reduce((a, c) => a + c, 0);
    let sum_Let_Cancel_TPSL = global.time_tracker.Let_Cancel_TPSL.reduce((a, c) => a + c, 0);
    let sum_Let_Cancel_TP = global.time_tracker.Let_Cancel_TP.reduce((a, c) => a + c, 0);
    let sum_Finalize_Cancelled_TPSL = global.time_tracker.Finalize_Cancelled_TPSL.reduce((a, c) => a + c, 0);
    let sum_Let_Close_Pos = global.time_tracker.Let_Close_Pos.reduce((a, c) => a + c, 0);
    let sum_Finalize_Close_Pos = global.time_tracker.Finalize_Close_Pos.reduce((a, c) => a + c, 0);

    let sum_Let_Prepare_Order_To_Open = global.time_tracker.Let_Prepare_Order_To_Open.reduce((a, c) => a + c, 0);

    let sum_Let_Close_Pos_1 = global.time_tracker.Let_Close_Pos_1.reduce((a, c) => a + c, 0);
    let sum_Let_Close_Pos_2 = global.time_tracker.Let_Close_Pos_2.reduce((a, c) => a + c, 0);
    let sum_Let_Close_Pos_3 = global.time_tracker.Let_Close_Pos_3.reduce((a, c) => a + c, 0);
    let time_tracker = {
        last_price: { mean: Math.ceil(sum_last_price / global.time_tracker.last_price.length), sum: sum_last_price, cnt: global.time_tracker.last_price.length },
        order_submit: { mean: Math.ceil(sum_order_submit / global.time_tracker.order_submit.length), sum: sum_order_submit, cnt: global.time_tracker.order_submit.length },
        order_cancel: { mean: Math.ceil(sum_order_cancel / global.time_tracker.order_cancel.length), sum: sum_order_cancel, cnt: global.time_tracker.order_cancel.length },
        order_status: { mean: Math.ceil(sum_order_status / global.time_tracker.order_status.length), sum: sum_order_status, cnt: global.time_tracker.order_status.length },

        order_status_1: { mean: Math.ceil(sum_order_status_1 / global.time_tracker.order_status_1.length), sum: sum_order_status_1, cnt: global.time_tracker.order_status_1.length },
        order_status_2: { mean: Math.ceil(sum_order_status_2 / global.time_tracker.order_status_2.length), sum: sum_order_status_2, cnt: global.time_tracker.order_status_2.length },
        order_status_3: { mean: Math.ceil(sum_order_status_3 / global.time_tracker.order_status_3.length), sum: sum_order_status_3, cnt: global.time_tracker.order_status_3.length },
        order_status_4: { mean: Math.ceil(sum_order_status_4 / global.time_tracker.order_status_4.length), sum: sum_order_status_4, cnt: global.time_tracker.order_status_4.length },

        repay: { mean: Math.ceil(sum_repay / global.time_tracker.repay.length), sum: sum_repay, cnt: global.time_tracker.repay.length },
        pos_submit: { mean: Math.ceil(sum_pos_submit / global.time_tracker.pos_submit.length), sum: sum_pos_submit, cnt: global.time_tracker.pos_submit.length },
        tp_submit: { mean: Math.ceil(sum_tp_submit / global.time_tracker.tp_submit.length), sum: sum_tp_submit, cnt: global.time_tracker.tp_submit.length },
        sl_submit: { mean: Math.ceil(sum_sl_submit / global.time_tracker.sl_submit.length), sum: sum_sl_submit, cnt: global.time_tracker.sl_submit.length },

        Check_Pos_Was_Closed: { mean: Math.ceil(sum_Check_Pos_Was_Closed / global.time_tracker.Check_Pos_Was_Closed.length), sum: sum_Check_Pos_Was_Closed, cnt: global.time_tracker.Check_Pos_Was_Closed.length },
        Check_Pos_To_Close: { mean: Math.ceil(sum_Check_Pos_To_Close / global.time_tracker.Check_Pos_To_Close.length), sum: sum_Check_Pos_To_Close, cnt: global.time_tracker.Check_Pos_To_Close.length },

        Let_Return_Money: { mean: Math.ceil(sum_Let_Return_Money / global.time_tracker.Let_Return_Money.length), sum: sum_Let_Return_Money, cnt: global.time_tracker.Let_Return_Money.length },
        Let_Open_Order: { mean: Math.ceil(sum_Let_Open_Order / global.time_tracker.Let_Open_Order.length), sum: sum_Let_Open_Order, cnt: global.time_tracker.Let_Open_Order.length },
        Let_Cancel_Order: { mean: Math.ceil(sum_Let_Cancel_Order / global.time_tracker.Let_Cancel_Order.length), sum: sum_Let_Cancel_Order, cnt: global.time_tracker.Let_Cancel_Order.length },
        Finalize_Cancelled_Order: { mean: Math.ceil(sum_Finalize_Cancelled_Order / global.time_tracker.Finalize_Cancelled_Order.length), sum: sum_Finalize_Cancelled_Order, cnt: global.time_tracker.Finalize_Cancelled_Order.length },
        Let_Open_TPSL: { mean: Math.ceil(sum_Let_Open_TPSL / global.time_tracker.Let_Open_TPSL.length), sum: sum_Let_Open_TPSL, cnt: global.time_tracker.Let_Open_TPSL.length },
        Finalize_TPSL: { mean: Math.ceil(sum_Finalize_TPSL / global.time_tracker.Finalize_TPSL.length), sum: sum_Finalize_TPSL, cnt: global.time_tracker.Finalize_TPSL.length },
        ClosePos: { mean: Math.ceil(sum_ClosePos / global.time_tracker.ClosePos.length), sum: sum_ClosePos, cnt: global.time_tracker.ClosePos.length },
        Let_Cancel_TPSL: { mean: Math.ceil(sum_Let_Cancel_TPSL / global.time_tracker.Let_Cancel_TPSL.length), sum: sum_Let_Cancel_TPSL, cnt: global.time_tracker.Let_Cancel_TPSL.length },
        Let_Cancel_TP: { mean: Math.ceil(sum_Let_Cancel_TPSL / global.time_tracker.Let_Cancel_TP.length), sum: sum_Let_Cancel_TP, cnt: global.time_tracker.Let_Cancel_TP.length },
        Finalize_Cancelled_TPSL: { mean: Math.ceil(sum_Finalize_Cancelled_TPSL / global.time_tracker.Finalize_Cancelled_TPSL.length), sum: sum_Finalize_Cancelled_TPSL, cnt: global.time_tracker.Finalize_Cancelled_TPSL.length },
        Let_Close_Pos: { mean: Math.ceil(sum_Let_Close_Pos / global.time_tracker.Let_Close_Pos.length), sum: sum_Let_Close_Pos, cnt: global.time_tracker.Let_Close_Pos.length },
        Finalize_Close_Pos: { mean: Math.ceil(sum_Finalize_Close_Pos / global.time_tracker.Finalize_Close_Pos.length), sum: sum_Finalize_Close_Pos, cnt: global.time_tracker.Finalize_Close_Pos.length },

        Let_Prepare_Order_To_Open: { mean: Math.ceil(sum_Let_Prepare_Order_To_Open / global.time_tracker.Let_Prepare_Order_To_Open.length), sum: sum_Let_Prepare_Order_To_Open, cnt: global.time_tracker.Let_Prepare_Order_To_Open.length },

        Let_Close_Pos_1: { mean: Math.ceil(sum_Let_Close_Pos_1 / global.time_tracker.Let_Close_Pos_1.length), sum: sum_Let_Close_Pos_1, cnt: global.time_tracker.Let_Close_Pos_1.length },
        Let_Close_Pos_2: { mean: Math.ceil(sum_Let_Close_Pos_2 / global.time_tracker.Let_Close_Pos_2.length), sum: sum_Let_Close_Pos_2, cnt: global.time_tracker.Let_Close_Pos_2.length },
        Let_Close_Pos_3: { mean: Math.ceil(sum_Let_Close_Pos_3 / global.time_tracker.Let_Close_Pos_3.length), sum: sum_Let_Close_Pos_3, cnt: global.time_tracker.Let_Close_Pos_3.length }
    };
    return time_tracker;
}

async function MemoryUsage(api_name, strt) {
    let memory = process.memoryUsage();
    memory.rss /= (1024 * 1024);
    memory.heapTotal /= (1024 * 1024);
    memory.heapUsed /= (1024 * 1024);
    memory.external /= (1024 * 1024);
    await logging(strt, `${api_name}.MEMORY_USAGE`, memory);
}

async function logging(strt, api_name, log) {
    let fnt = Date.now();
    let dtlog = `${fnt} [${(new Date(fnt)).toISOString().replace(/T/g, ' ').substr(0, 19)}]\t[${fnt - strt}]\t`;
    console.log(`${dtlog} @ ${api_name}: ${JSON.stringify(log)}`);
    if (EXEC_MODA === 'MARKET') await connectors.db_logs.SetLogging(process.env.ORACLE_NAME, process.env.STRAT_ID, process.env.ACCOUNT_NAME, fnt, api_name, log);
}
/* =========================================================
    DEBUG
*/
module.exports.order_submit = async function(req, res) {
    let body = take_body(req, res);
    if (body.error) {
        console.log(JSON.stringify(body));
        res.status(204).send();
        return;
    }

    let cid = body.cid;
    let type = body.type || 1;
    let price = body.price;
    let coin = body.coin;

    let res_ = await connectors.market.order_submit(cid, type, price, coin);
    let ord = res_[0] || res_[1] || res_[2];
    if(ord) res.status(200).json(ord);
    else res.status(400).json({});
}

module.exports.order_cancel = async function(req, res) {
    let body = take_body(req, res);
    if (body.error) {
        console.log(JSON.stringify(body));
        res.status(204).send();
        return;
    }
    let pair = `${process.env.BASE}${process.env.QUOTE}`;
    let ts = body.ts;
    let id = body.id;
    let cid = body.cid;

    let res_ = await connectors.bfx.order_cancel(pair, id, cid, ts);
    if(res_.success){
        let trades = res_.result.map(c => { return {
        };});
        res.status(200).json(trades);
    }
    else res.status(400).send(res_);
}

module.exports.order_status = async function(req, res) {
    let body = take_body(req, res);
    if (body.error) {
        console.log(JSON.stringify(body));
        res.status(204).send();
        return;
    }
    let id = body.id;
    let cid = body.cid;
    let ts_origin = body.ts_origin || 0;

    let order = await connectors.market.order_status({id, cid, ts_origin});
    res.status(400).send(order);
}

module.exports.state = async function(req, res) {
    res.status(200).json({
        in_progress:    global.in_progress >>> 16,
        queue:          global.queue.length,
        logs:           global.logs.length,
        pre_logs:       global.pre_logs.length,
        sequence:       global.sequence,
        wallet:         global.wallet,
        ready4logs:     !global.ignore_logs,
        isRed:          global.isRed
    });
}

module.exports.env = async function(req, res) {
    let ans = {
        env: {
            ACCOUNT_NAME            : process.env.ACCOUNT_NAME,
            ACCOUNT_URL             : process.env.ACCOUNT_URL || '',
            API_PORT                : +process.env.API_PORT,
            BASE                    : process.env.BASE,
            BATCH_SIZE              : +process.env.BATCH_SIZE,
            BATCH_TS_START          : +process.env.BATCH_TS_START,
            BATCH_TS_END            : +process.env.BATCH_TS_END,
            BNB_PRICE               : +process.env.BNB_PRICE,
            BNB_USAGE               : +process.env.BNB_USAGE,
            DEBUG                   : +process.env.DEBUG,
            ERR_URL                 : process.env.ERR_URL,
            EXCHANGE                : process.env.EXCHANGE,
            EXPERIMENT_NAME         : process.env.EXPERIMENT_NAME,
            FUTURES                 : +process.env.FUTURES,
            INTERNAL_RISK_MANAGER   : +process.env.INTERNAL_RISK_MANAGER,
            MAX_RISK                : +process.env.MAX_RISK,
            MODEL                   : +process.env.MODEL,
            NODE_OPTIONS            : process.env.NODE_OPTIONS,
            ORACLE_NAME             : process.env.ORACLE_NAME,
            PIPE                    : +process.env.PIPE,
            PRICE_INDENT            : (+(process.env.PRICE_INDENT || '')) ? +(process.env.PRICE_INDENT) : global.env_total.PRICE_INDENT,
            PRICE_INDENT_ENABLE     : +(process.env.PRICE_INDENT_ENABLE || ''),
            QUOTE                   : process.env.QUOTE,
            RECALCULATE_HISTORY     : +process.env.RECALCULATE_HISTORY,
            REST_AUTH_URL           : process.env.REST_AUTH_URL,
            REST_AUTH_URL_F         : process.env.REST_AUTH_URL_F,
            REST_URL                : process.env.REST_URL,
            SLACK_LOGS_URL          : process.env.SLACK_LOGS_URL,
            SLACK_WEBHOOK_URL       : process.env.SLACK_WEBHOOK_URL,
            SLIPPING                : +process.env.SLIPPING,
            STRAT_ID                : +process.env.STRAT_ID,
            TELEGRAM_LOGGING        : +process.env.TELEGRAM_LOGGING,
            TIME_TRACKER            : +process.env.TIME_TRACKER,
            WALLET                  : +process.env.WALLET
        },
        env_params: JSON.parse(JSON.stringify(global.params)),
        env_total: JSON.parse(JSON.stringify(global.env_total))
    };
    res.status(200).json(ans);
}

module.exports.ready_for_logs = function(req, res) {
    if (global.ignore_logs) res.status(200).send('0');
    else res.status(200).send('1');
}

module.exports.last_got_log = function(req, res) {
    if (global.logs.length === 0) res.status(200).json({});
    else res.status(200).json(global.logs[global.logs.length-1]);
}

module.exports.ready_for_pnls = function(req, res) {
    if (global.init_done) res.status(200).send(ORACLE_NAME);
    else res.status(200).send('0');
}

module.exports.in_progress = function(req, res) {
    setImmediate(async function(){
        if ((global.in_progress >>> 16) === 0x0000FFFF) res.status(200).send('0');
        else res.status(200).send('1');
    });
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

function decimalAdjust(value, e) {
    let exp = e || 10;
    return Math.round(value * Math.pow(10, exp)) / Math.pow(10, exp);
}

function memorySizeOf(obj) {
    var bytes = 0;

    function sizeOf(obj) {
        if(obj !== null && obj !== undefined) {
            switch(typeof obj) {
            case 'number':
                bytes += 8;
                break;
            case 'string':
                bytes += obj.length * 2;
                break;
            case 'boolean':
                bytes += 4;
                break;
            case 'object':
                var objClass = Object.prototype.toString.call(obj).slice(8, -1);
                if(objClass === 'Object' || objClass === 'Array') {
                    for(var key in obj) {
                        if(!obj.hasOwnProperty(key)) continue;
                        sizeOf(obj[key]);
                    }
                } else bytes += obj.toString().length * 2;
                break;
            }
        }
        return bytes;
    };

    function formatByteSize(bytes) {
        if(bytes < 1024) return bytes + " bytes";
        else if(bytes < 1048576) return(bytes / 1024).toFixed(3) + " KiB";
        else if(bytes < 1073741824) return(bytes / 1048576).toFixed(3) + " MiB";
        else return(bytes / 1073741824).toFixed(3) + " GiB";
    };

    return sizeOf(obj);
    // return formatByteSize(sizeOf(obj));
};
